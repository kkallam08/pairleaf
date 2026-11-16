import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pdfBookFixture } from "../tests/pdf-fixture.mjs";

const out = path.resolve("output/single-pdf");
await fs.mkdir(out, { recursive: true });
await fs.mkdir("tmp", { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/single-browser-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1440, height: 1000 },
});
const checks = [],
  errors = [],
  external = [];
try {
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked", {
    path: path.resolve("dist"),
  });
  await context.setOffline(true);
  context.on("request", (r) => {
    if (/^https?:/.test(r.url())) external.push(r.url());
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole("radio", { name: "Answers in this PDF" }).check();
  await expect(page.getByLabel("Solutions PDF")).toBeHidden();
  const book = pdfBookFixture([
    [
      ["Chapter 1", 70],
      ["Exercise A", 110],
      ["1. Explain evaporation.", 170],
    ],
    [
      ["Chapter 2", 70],
      ["Exercise A", 110],
      ["1. Explain photosynthesis.", 170],
    ],
    [
      ["Answers to exercises", 70],
      ["Chapter 1", 110],
      ["Exercise A", 150],
      ["1. Water becomes vapor.", 210],
    ],
    [["An explanation continued on another page.", 100]],
    [
      ["Chapter 2", 70],
      ["Exercise A", 110],
      ["1. Plants use sunlight to make sugars.", 170],
    ],
    [
      ["Index", 70],
      ["1. This numbered index entry must not become an answer.", 160],
    ],
  ]);
  async function openBook(file = book) {
    await page.getByLabel("Textbook PDF").setInputFiles(file);
    await page.getByRole("button", { name: "Open PDF", exact: true }).click();
    await expect(page.locator("#answer-range")).toBeVisible();
  }
  await openBook();
  await expect(
    page.locator("#ocr-enabled, #ocr-options, #ocr-progress"),
  ).toHaveCount(0);
  await expect(page.locator("#range-start")).toHaveValue("3");
  await expect(page.locator("#range-end")).toHaveValue("5");
  await expect(page.locator("#range-preview")).toBeHidden();
  await page.locator("#range-preview-start").click();
  await expect(page.locator("#range-preview [data-rendered=true]")).toHaveCount(
    1,
  );
  await page.screenshot({ path: path.join(out, "range-preview.png") });
  await page.locator("#range-end").fill("2");
  await page.locator("#range-apply").click();
  await expect(page.locator("#range-error")).toContainText("last page");
  await page.locator("#range-end").fill("5");
  await page.locator("#range-apply").click();
  await expect(page.locator("#match-count")).toHaveText(
    "2 matched / 2 questions",
  );
  await expect(page.locator(".page-block")).toHaveCount(2);
  await page
    .getByRole("button", {
      name: "Show solution for chapter 1 / exercise A / 1",
      exact: true,
    })
    .click();
  await expect(page.locator(".solution-region")).toHaveCount(3);
  assert.deepEqual(
    await page
      .locator(".solution-region")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.page)),
    ["3", "4", "5"],
  );
  const leadingStrip = await page
    .locator(".solution-region")
    .last()
    .evaluate((node) => JSON.parse(node.dataset.region));
  assert.ok(
    leadingStrip.y + leadingStrip.height < 70,
    "The retained page edge must end before the next chapter heading",
  );
  await expect(
    page.locator(".solution-crop[data-rendered=true]").first(),
  ).toBeVisible();
  await page.screenshot({ path: path.join(out, "single-reader.png") });
  checks.push(
    "Automatic answer detection excludes the index; repeated exercise numbers match within chapters; answer continuations retain PDF pages 3 and 4",
  );
  await page.locator("#range-open").click();
  await page.locator("#range-end").fill("4");
  await page.locator("#range-apply").click();
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 2 questions",
  );
  await expect(page.locator("#solution-pages canvas")).toHaveCount(0);
  await page.locator("#range-open").click();
  await page.locator("#range-end").fill("5");
  await page.keyboard.press("Escape");
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 2 questions",
  );
  await page.locator("#range-open").click();
  await expect(page.locator("#range-end")).toHaveValue("4");
  await page.locator("#range-end").fill("5");
  await page.locator("#range-apply").click();
  checks.push(
    "Range correction rebuilds matches; cancellation retains the applied range and prior reader",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#range-open").click();
  await page.locator("#range-preview-end").click();
  await expect(page.locator("#range-preview [data-rendered=true]")).toHaveCount(
    1,
  );
  await page.screenshot({ path: path.join(out, "range-mobile.png") });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("#range-close").click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#replace").click();
  await openBook(
    pdfBookFixture([[["1. State a fact.", 100]], [["1. A fact.", 100]]]),
  );
  await expect(page.locator("#range-detection")).toContainText(
    "No answer section found",
  );
  await page.locator("#range-start").fill("2");
  await page.locator("#range-end").fill("2");
  await page.locator("#range-apply").click();
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 1 question",
  );
  await page.locator("#replace").click();
  await openBook();
  await page.locator("#range-cancel").click();
  await expect(page.locator("#setup")).toBeVisible();
  await expect(page.locator("#pair")).toBeEnabled();
  checks.push(
    "Manual fallback, mobile preview, initial cancellation, and mode switching work offline",
  );
  if (process.argv[2]) {
    await openBook(process.argv[2]);
    checks.push(
      `Supplied textbook detection: ${await page.locator("#range-detection").innerText()}`,
    );
    await page.screenshot({
      path: path.join(out, "supplied-textbook-range.png"),
    });
    await page.locator("#range-start").fill("485");
    await page.locator("#range-end").fill("546");
    await page.locator("#range-apply").click();
    if (await page.locator("#answer-range").isVisible()) {
      checks.push(
        `Supplied textbook manual range: ${await page.locator("#range-error").innerText()}`,
      );
      await page.locator("#range-cancel").click();
    } else {
      checks.push(
        `Supplied textbook manual range: ${await page.locator("#match-count").innerText()}`,
      );
      await page.locator("#replace").click();
    }
  }
  await page.getByRole("radio", { name: "Separate PDFs" }).check();
  await expect(page.getByLabel("Solutions PDF")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pair PDFs", exact: true }),
  ).toBeEnabled();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify({ checks, errors, external }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, external }, null, 2));
} finally {
  await context.close();
}
