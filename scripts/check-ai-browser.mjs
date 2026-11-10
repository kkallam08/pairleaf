import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pdfFixture } from "../tests/pdf-fixture.mjs";
import { createHelper } from "../server/http.mjs";
const out = path.resolve("output/ai-interface");
await fs.mkdir(out, { recursive: true });
let delay = 0;
const requests = [];
const server = createHelper({
  pairingCode: "browser-test-code",
  matcher: {
    match: async (body) => {
      requests.push(body);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const text = body.question.text;
      const word = text.includes("evaporation")
        ? "vapor"
        : text.includes("photosynthesis")
          ? "sunlight"
          : "absent";
      const candidate = body.candidates.find((c) => c.text.includes(word));
      return {
        candidateKey: candidate?.key ?? null,
        confidence: candidate ? "supported" : "none",
        evidence: candidate
          ? "The source discusses the same process."
          : "No source discusses this task.",
        usedUSD: 0.001,
      };
    },
  },
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(5182, "127.0.0.1", resolve);
});
const profile = await fs.mkdtemp(path.resolve("tmp/ai-browser-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1440, height: 1000 },
});
const errors = [],
  external = [],
  checks = [];
try {
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked", {
    path: path.resolve("dist"),
  });
  context.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:5182/")
    )
      external.push(r.url());
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const url = `chrome-extension://${id}/index.html`;
  const questions = pdfFixture([
    ["1. Explain evaporation.", 100],
    ["2. Explain photosynthesis.", 220],
    ["3. Explain the French Revolution.", 340],
  ]);
  const solutions = pdfFixture([
    ["1. Plants use sunlight to make sugars.", 100],
    ["2. Liquid water becomes vapor.", 220],
  ]);
  async function pair(q = questions) {
    await page.getByLabel("Questions PDF").setInputFiles(q);
    await page.getByLabel("Solutions PDF").setInputFiles(solutions);
    await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
    await expect(page.locator("#reader")).toBeVisible();
  }
  await page.goto(url);
  await pair();
  await expect(page.locator("#match-count")).toHaveText(
    "2 matched / 3 questions",
  );
  await page.locator("#ai-open").click();
  await page.locator("#helper-code").fill("wrong");
  await page.locator("#ai-run").click();
  await expect(page.locator("#ai-progress")).toContainText(
    "connection code shown",
  );
  await page.locator("#helper-code").fill("browser-test-code");
  await page.locator("#ai-run").click();
  await expect(page.locator("#report")).toBeVisible();
  await expect(page.locator("#match-count")).toHaveText(
    "0 matched / 3 questions",
  );
  assert.equal(requests.length, 3);
  assert.equal(await page.locator("#solution-pages canvas").count(), 0);
  checks.push(
    "Ordinary numbered PDFs load; AI checks all three questions and disputed number matches become suggestions",
  );
  await page
    .getByRole("button", { name: "Review solution for 1", exact: true })
    .click();
  await expect(page.locator("#review-source option:checked")).toContainText(
    "2 — page 1",
  );
  await expect(page.locator("#review-preview-pages")).toBeHidden();
  await page.locator("#review-preview").click();
  await expect(
    page.locator("#review-preview-pages [data-rendered=true]"),
  ).toHaveCount(1);
  await page.screenshot({ path: path.join(out, "suggestion-preview.png") });
  await page.locator("#review-confirm").click();
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 3 questions",
  );
  await page.locator("#report-close").click();
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  await expect(page.locator(".solution-crop")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  const region = await page
    .locator(".solution-region")
    .evaluate((e) => JSON.parse(e.dataset.region));
  assert.ok(region.y > 200, "Must reveal answer 2, not answer 1");
  checks.push(
    "Explicit preview renders original source; confirmation assigns the different-number answer",
  );
  await page.reload();
  await pair();
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  const restored = await page
    .locator(".solution-region")
    .evaluate((e) => JSON.parse(e.dataset.region));
  assert.ok(restored.y > 200);
  checks.push(
    "Confirmed mapping survives reload and reimport of the same PDF bytes",
  );
  delay = 800;
  await page.locator("#ai-open").click();
  await page.locator("#helper-code").fill("browser-test-code");
  await page.locator("#ai-run").click();
  await expect(page.locator("#ai-progress")).toContainText("Checking question");
  await page.locator("#ai-cancel").click();
  await expect(page.locator("#ai-progress")).toContainText(
    "Previous matches kept",
  );
  await page.locator("#ai-close").click();
  await page.getByRole("button", { name: "Change PDFs", exact: true }).click();
  await pair(pdfFixture([["1. Explain a different process.", 100]]));
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  const changed = await page
    .locator(".solution-region")
    .evaluate((e) => JSON.parse(e.dataset.region));
  assert.ok(changed.y < 150);
  checks.push(
    "Cancellation preserves prior results; changed PDF content cannot reuse a saved mapping",
  );
  await page.getByRole("button", { name: "Change PDFs", exact: true }).click();
  await page
    .getByLabel("Questions PDF")
    .setInputFiles(path.join(os.homedir(), "Downloads", "M116P7.pdf"));
  await page
    .getByLabel("Solutions PDF")
    .setInputFiles(path.join(os.homedir(), "Downloads", "M116P7sol.pdf"));
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await expect(page.locator("#match-count")).toHaveText(
    "8 matched / 8 questions",
  );
  await page.getByRole("combobox", { name: "Find problem" }).fill("8");
  await page.getByRole("combobox", { name: "Find problem" }).press("Enter");
  await page
    .getByRole("button", { name: "Show solution for 8", exact: true })
    .click();
  await expect(page.locator(".solution-region")).toHaveCount(5);
  checks.push(
    "Supplied M116 pair detects eight questions and preserves the five-page solution to question 8",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify({ checks, errors, external }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, external }, null, 2));
} finally {
  await context.close();
  server.close();
}
