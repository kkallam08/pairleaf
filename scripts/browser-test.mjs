import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pdfFixture } from "../tests/pdf-fixture.mjs";
const [questionFile, solutionFile] = process.argv.slice(2);
if (!questionFile || !solutionFile)
  throw new Error(
    'Usage: npm run test:browser -- "questions.pdf" "solutions.pdf"',
  );
const out = path.resolve("output");
await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/chrome-test-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const browser = context.browser();
const errors = [],
  network = [],
  checks = [];
try {
  const session = await browser.newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked", {
    path: path.resolve("dist"),
  });
  await context.setOffline(true);
  context.on("request", (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  await page.screenshot({ path: path.join(out, "welcome.png") });
  await page.getByLabel("Questions PDF").setInputFiles(questionFile);
  await page.getByLabel("Solutions PDF").setInputFiles(solutionFile);
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await expect(page.locator("#reader")).toBeVisible({ timeout: 120000 });
  const counts = await page.locator("#match-count").innerText();
  assert.equal(counts, "236 matched / 236 questions");
  checks.push("Full supplied pair: 236 matched, 0 unmatched, offline");
  await expect(page.locator("#save-status")).toHaveText(
    "Saved on this device",
    { timeout: 30000 },
  );
  await page.reload();
  await page.locator("#library-open").click();
  await expect(page.locator(".library-book")).toHaveCount(1);
  await page.locator(".library-book").click();
  await expect(page.locator("#match-count")).toHaveText(counts);
  await expect(page.locator("#save-status")).toHaveText("Saved on this device");
  checks.push(
    "Full supplied pair reopens from the library after reload without reimporting",
  );
  const analysis = JSON.parse(await fs.readFile("tmp/analysis.json", "utf8"));
  const samples = [
    "1.1.1",
    "1.1.2",
    "1.3.10",
    "2.2.1",
    "3.1.2",
    "3.5.1",
    "4.3.1",
    "5.1.8",
    "6.4.1",
    "7.3.1",
    "8.4.6",
    "8.5.1",
  ];
  const observations = [];
  for (const identifier of samples) {
    const match = analysis.matches.find((m) => m.id === identifier);
    assert.ok(match, identifier);
    await page.getByLabel("Find problem").fill(identifier);
    await page.getByLabel("Find problem").press("Enter");
    const button = page.getByRole("button", {
      name: `Show solution for ${identifier}`,
      exact: true,
    });
    await button.scrollIntoViewIfNeeded();
    const before = await page
      .locator("#question-scroll")
      .evaluate((e) => e.scrollTop);
    await button.click();
    await expect(page.locator("#solution-title")).toHaveText(
      `Solution ${identifier}`,
    );
    await expect(page.locator(".solution-crop").first()).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 20000 },
    );
    assert.equal(
      await page.locator("#question-scroll").evaluate((e) => e.scrollTop),
      before,
      `scroll kept for ${identifier}`,
    );
    const regions = await page
      .locator(".solution-region")
      .evaluateAll((els) => els.map((e) => JSON.parse(e.dataset.region)));
    assert.deepEqual(regions, match.solutions[0].regions);
    for (const [index, region] of regions.entries()) {
      const crop = page.locator(".solution-crop").nth(index);
      await crop.scrollIntoViewIfNeeded();
      await expect(crop).toHaveAttribute("data-rendered", "true", {
        timeout: 20000,
      });
      const png = await crop
        .locator("canvas")
        .evaluate((c) => c.toDataURL("image/png").split(",")[1]);
      await fs.writeFile(
        path.join(out, `${identifier}-solution-${index + 1}.png`),
        Buffer.from(png, "base64"),
      );
      // No other detected answer heading can lie inside the revealed crop.
      for (const m of analysis.matches)
        for (const other of m.solutions) {
          if (other.id !== identifier && other.page === region.page)
            assert.ok(
              other.y < region.y || other.y >= region.y + region.height,
              `${identifier} leaks ${other.id}`,
            );
        }
    }
    await page.locator("#solution-scroll").evaluate((e) => (e.scrollTop = 0));
    const block = page.locator(
      `.page-block[data-page="${match.questions[0].page}"] .paper`,
    );
    await expect(block).toHaveAttribute("data-rendered", "true", {
      timeout: 20000,
    });
    const questionPng = await block
      .locator("canvas")
      .evaluate((c) => c.toDataURL("image/png").split(",")[1]);
    await fs.writeFile(
      path.join(out, `${identifier}-question.png`),
      Buffer.from(questionPng, "base64"),
    );
    await page.screenshot({ path: path.join(out, `${identifier}-reader.png`) });
    observations.push({
      id: identifier,
      questionPage: match.questions[0].page,
      solutionPages: regions.map((r) => r.page),
      scrollPreserved: true,
      neighborHeadingsExcluded: true,
    });
  }
  checks.push(
    "12 samples: exact source regions, question scroll preserved, other solution headings excluded",
  );
  await page.getByLabel("Find problem").fill("3.1.2");
  await page.getByLabel("Find problem").press("Enter");
  for (const zoom of ["0.75", "1.25", "2", "1"]) {
    await page.getByLabel("Question zoom").selectOption(zoom);
    const alignment = await page
      .locator('.solution-button[data-id="3.1.2"]')
      .evaluate((b) => {
        const paper = b.parentElement.querySelector(".paper");
        return Math.abs(
          parseFloat(b.style.top) +
            3 -
            (Number(b.dataset.anchorY) * parseFloat(paper.style.width)) / 612,
        );
      });
    assert.ok(alignment < 0.1, `zoom ${zoom}`);
    const overlap = await page.locator(".page-block").evaluateAll((blocks) =>
      blocks.some((block) => {
        const buttons = [...block.querySelectorAll(".solution-button")];
        return buttons.some((a, i) =>
          buttons.slice(i + 1).some((b) => {
            const ar = a.getBoundingClientRect(),
              br = b.getBoundingClientRect();
            return (
              ar.left < br.right &&
              ar.right > br.left &&
              ar.top < br.bottom &&
              ar.bottom > br.top
            );
          }),
        );
      }),
    );
    assert.equal(overlap, false, `Overlapping reveal buttons at ${zoom}`);
  }
  for (const width of [1280, 1800, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(250);
    const alignment = await page
      .locator('.solution-button[data-id="3.1.2"]')
      .evaluate((b) => {
        const paper = b.parentElement.querySelector(".paper");
        return Math.abs(
          parseFloat(b.style.top) +
            3 -
            (Number(b.dataset.anchorY) * parseFloat(paper.style.width)) / 612,
        );
      });
    assert.ok(alignment < 0.1, `resize ${width}`);
  }
  checks.push(
    "Button alignment at 75%, 125%, 200%, fit; window widths 1280, 1800, 1600",
  );
  const qBefore = await page
    .locator("#question-scroll")
    .evaluate((e) => e.scrollTop);
  await page.getByLabel("Solution zoom", { exact: true }).selectOption("2");
  await expect(page.locator(".solution-crop").first()).toHaveAttribute(
    "data-rendered",
    "true",
  );
  assert.equal(
    await page.locator("#question-scroll").evaluate((e) => e.scrollTop),
    qBefore,
  );
  await page.getByLabel("Solution zoom", { exact: true }).selectOption("1");
  checks.push(
    "Independent solution zoom preserves question position; no reveal-button overlaps",
  );
  await page.getByLabel("Question page", { exact: true }).fill("419");
  await page.getByLabel("Question page", { exact: true }).press("Tab");
  await page.waitForTimeout(500);
  const canvasCount = await page.locator("#pages canvas").count();
  assert.ok(canvasCount <= 6, `Too many page canvases: ${canvasCount}`);
  checks.push(
    `Distant page canvases released (${canvasCount} question canvases at page 419)`,
  );
  await page.getByLabel("Close solution", { exact: true }).click();
  await expect(page.locator("#solution-pages canvas")).toHaveCount(0);
  await page.locator("#report-open").click();
  await expect(page.locator("#report-summary")).toContainText("0 ambiguous");
  await page.getByLabel("Close matching report", { exact: true }).click();
  await page.getByRole("button", { name: "Change PDFs", exact: true }).click();
  await expect(page.locator(".solution-button")).toHaveCount(0);
  await expect(page.locator("#solution-pages canvas")).toHaveCount(0);
  checks.push(
    "Closing clears solution canvases; replacing clears all old matches and pages",
  );
  const bad = {
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a PDF"),
  };
  await page.getByLabel("Questions PDF").setInputFiles(bad);
  await page.getByLabel("Solutions PDF").setInputFiles(solutionFile);
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await expect(page.locator("#error")).toBeVisible({ timeout: 20000 });
  checks.push("Invalid PDF gives a recoverable error");
  await page.getByLabel("Questions PDF").setInputFiles(questionFile);
  await page.getByLabel("Solutions PDF").setInputFiles(solutionFile);
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await expect(page.locator("#reader")).toBeVisible({ timeout: 120000 });
  checks.push("Replacement pair succeeds after file error");
  await page.getByRole("button", { name: "Change PDFs", exact: true }).click();
  await page.getByLabel("Questions PDF").setInputFiles(pdfFixture([], true));
  await page
    .getByLabel("Solutions PDF")
    .setInputFiles(pdfFixture([["1.1.1. An answer.", 100]]));
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await expect(page.locator("#error")).toContainText("Scanned", {
    timeout: 20000,
  });
  checks.push("Textless graphic PDF is rejected with an OCR limitation");
  await page.getByLabel("Questions PDF").setInputFiles(
    pdfFixture([
      ["1.1.1. First question.", 100],
      ["1.1.2. Duplicate question.", 200],
      ["1.1.2. Duplicate question.", 300],
      ["1.1.3. Missing answer.", 400],
    ]),
  );
  await page.getByLabel("Solutions PDF").setInputFiles(
    pdfFixture([
      ["1.1.1. First answer.", 100],
      ["1.1.2. Second answer.", 200],
    ]),
  );
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 3 questions",
    { timeout: 20000 },
  );
  await page
    .getByRole("button", { name: "Review match for 1.1.2", exact: true })
    .first()
    .click();
  await expect(page.locator("#report-summary")).toContainText("1 ambiguous");
  await expect(page.locator("#report-summary")).toContainText("1 missing");
  assert.equal(await page.locator("#solution-pages canvas").count(), 0);
  await page.getByLabel("Close matching report", { exact: true }).click();
  checks.push(
    "Synthetic duplicate/missing identifiers are visibly reported and cannot reveal an answer",
  );
  await page.getByRole("button", { name: "Change PDFs", exact: true }).click();
  await page.getByLabel("Questions PDF").setInputFiles(questionFile);
  await page.getByLabel("Solutions PDF").setInputFiles(solutionFile);
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#setup")).toBeVisible();
  await expect(page.locator("#reader")).toBeHidden();
  await expect(page.locator("#error")).toBeHidden();
  checks.push("Cancelling pairing returns to file selection");
  assert.equal(network.length, 0, "External network request");
  assert.deepEqual(errors, []);
  const result = {
    chrome: browser.version(),
    extensionId: id,
    offline: true,
    counts,
    checks,
    observations,
    canvasCount,
    externalRequests: network,
    errors,
  };
  await fs.writeFile(
    path.join(out, "browser-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
