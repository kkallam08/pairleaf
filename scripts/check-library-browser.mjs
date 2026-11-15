import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { pdfBookFixture } from "../tests/pdf-fixture.mjs";
const out = path.resolve("output/library");
await fs.mkdir(out, { recursive: true });
await fs.mkdir("tmp", { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/library-"));
let context, page, url;
const errors = [],
  network = [],
  checks = [];
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked", {
    path: path.resolve("dist"),
  });
  url = `chrome-extension://${id}/index.html`;
  await context.setOffline(true);
  context.on("request", (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
}
const questions = pdfBookFixture([
  [
    ["1. Explain evaporation.", 100],
    ["2. Explain photosynthesis.", 400],
  ],
  [["3. Explain condensation.", 100]],
]);
questions.name = "Biology questions.pdf";
const answers = pdfBookFixture([
  [
    ["1. Water becomes vapor.", 100],
    ["2. Plants use sunlight.", 400],
  ],
  [["3. Vapor becomes liquid.", 100]],
]);
answers.name = "Biology answers.pdf";
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
  [["An explanation continues here.", 100]],
  [
    ["Chapter 2", 70],
    ["Exercise A", 110],
    ["1. Plants use sunlight to make sugars.", 170],
  ],
  [
    ["Index", 70],
    ["1. An index item.", 160],
  ],
]);
book.name = "Biology textbook.pdf";
const saved = () =>
  expect(page.locator("#save-status")).toHaveText("Saved on this device");
async function library() {
  await page.locator("#rail-library").click();
  await expect(page.locator("#library-refresh")).toBeEnabled();
  await expect(page.locator("#library-message")).not.toHaveText("Working…");
}
async function open(title) {
  await page.locator(".library-book").filter({ hasText: title }).click();
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
}
try {
  await launch();
  await page
    .getByLabel("Questions PDF", { exact: true })
    .setInputFiles(questions);
  await page
    .getByLabel("Solutions PDF", { exact: true })
    .setInputFiles(answers);
  await page.locator("#pair").click();
  await saved();
  await page.locator("#report-open").click();
  await page.locator("#report-filter").selectOption("all");
  await page
    .getByRole("button", { name: "Review solution for 1", exact: true })
    .click();
  await page.locator("#review-source").selectOption({ index: 2 });
  await page.locator("#review-confirm").click();
  await page.locator("#report-close").click();
  await saved();
  await page.locator("#page-number").fill("2");
  await page.locator("#page-number").press("Enter");
  await page.locator("#zoom").selectOption("1.25");
  await saved();
  await library();
  page.once("dialog", (d) => d.accept("Biology practice"));
  await page
    .getByRole("button", { name: "Rename Biology questions", exact: true })
    .click();
  await expect(page.locator(".library-book")).toContainText("Biology practice");
  await page.screenshot({ path: path.join(out, "library.png") });
  await page.locator("#library-close").click();
  await saved();
  const anchor = await page
    .locator("#question-scroll")
    .evaluate((e) => e.scrollTop);
  await context.close();
  await launch();
  await library();
  await open("Biology practice");
  await expect(page.locator("#page-number")).toHaveValue("2");
  await expect(page.locator("#zoom")).toHaveValue("1.25");
  expect(
    Math.abs(
      (await page.locator("#question-scroll").evaluate((e) => e.scrollTop)) -
        anchor,
    ),
  ).toBeLessThan(3);
  await page.locator("#report-open").click();
  await page.locator("#report-filter").selectOption("all");
  await page
    .getByRole("button", { name: "Review solution for 1", exact: true })
    .click();
  await expect(page.locator("#review-source")).toHaveValue(
    await page.locator("#review-source option").nth(2).getAttribute("value"),
  );
  await page.locator("#review-close").click();
  await page.locator("#report-close").click();
  checks.push(
    "PDF pair, corrected answer, zoom and reading position survive a full Chrome restart",
  );
  const download = page.waitForEvent("download");
  await page.locator("#study-export").click();
  const backup = await download;
  const backupPath = path.join(out, "biology.pairleaf");
  await backup.saveAs(backupPath);
  await library();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete Biology practice", exact: true })
    .click();
  await expect(page.locator(".library-entry")).toHaveCount(0);
  await page.locator("#backup-file").setInputFiles(backupPath);
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
  await expect(page.locator("#page-number")).toHaveValue("2");
  checks.push("Export/import restores a deleted study set");
  // The second tab deletes this record while the reader holds an older version.
  const other = await context.newPage();
  await other.goto(url);
  await other.locator("#library-open").click();
  await expect(other.locator(".library-entry")).toHaveCount(1);
  other.once("dialog", (d) => d.accept());
  await other
    .getByRole("button", { name: "Delete Biology practice", exact: true })
    .click();
  await expect(other.locator(".library-entry")).toHaveCount(0);
  await other.close();
  await page.locator("#zoom").selectOption("1");
  await expect(page.locator("#save-status")).toContainText(
    "changed in another tab or was deleted",
  );
  const rescue = page.waitForEvent("download");
  await page.locator("#study-export").click();
  await (await rescue).saveAs(path.join(out, "rescue.pairleaf"));
  checks.push(
    "Concurrent deletion cannot resurrect a study set; unsaved session still exports",
  );
  page.once("dialog", (d) => d.accept());
  await page.locator("#replace").click();
  await page.getByRole("radio", { name: "Answers in this PDF" }).check();
  await page.getByLabel("Textbook PDF").setInputFiles(book);
  await page.locator("#pair").click();
  await page.locator("#range-apply").click();
  await saved();
  await page.locator("#range-open").click();
  await page.locator("#range-end").fill("6");
  await page.locator("#range-apply").click();
  await saved();
  await page.reload();
  await library();
  await open("Biology textbook");
  await expect(page.locator("#range-open")).toHaveText("Answer pages 3–6");
  await page
    .getByRole("button", {
      name: "Show solution for chapter 1 / exercise A / 1",
      exact: true,
    })
    .click();
  await expect(page.locator(".solution-region")).toHaveCount(2);
  await page.screenshot({ path: path.join(out, "reopened.png") });
  checks.push(
    "Single-PDF range correction and original multi-page answer survive reopening",
  );
  // Abort the first new save after writes have been queued, to exercise transaction rollback.
  await page.locator("#replace").click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.restorePut = () => (IDBObjectStore.prototype.put = original);
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === "states" && request.transaction)
        request.transaction.abort();
      return request;
    };
  });
  await page.getByRole("radio", { name: "Separate PDFs" }).check();
  await page
    .getByLabel("Questions PDF", { exact: true })
    .setInputFiles(questions);
  await page
    .getByLabel("Solutions PDF", { exact: true })
    .setInputFiles(answers);
  await page.locator("#pair").click();
  await expect(page.locator("#save-status")).toContainText("Unsaved.");
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  await expect(page.locator(".solution-region")).toHaveCount(1);
  await library();
  await expect(page.locator(".library-entry")).toHaveCount(1);
  await page.locator("#library-close").click();
  const failBackup = page.waitForEvent("download");
  await page.locator("#study-export").click();
  await (await failBackup).saveAs(path.join(out, "unsaved.pairleaf"));
  await page.evaluate(() => window.restorePut());
  await page.locator("#save-retry").click();
  await saved();
  await library();
  await expect(page.locator(".library-entry")).toHaveCount(2);
  checks.push(
    "Interrupted save rolls back all stores; reading, export and retry remain usable",
  );
  // Updating a saved set must preserve the previous complete version on failure.
  await page.locator("#library-close").click();
  const previousZoom = await page.locator("#zoom").inputValue();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.restorePut = () => (IDBObjectStore.prototype.put = original);
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "states")
        throw new DOMException("Test storage exhaustion", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.locator("#zoom").selectOption("1.5");
  await expect(page.locator("#save-status")).toContainText(
    "Device storage is full",
  );
  const unchanged = await context.newPage();
  await unchanged.goto(url);
  await unchanged.locator("#library-open").click();
  await unchanged
    .locator(".library-book")
    .filter({ hasText: "Biology questions" })
    .click();
  await expect(unchanged.locator("#zoom")).toHaveValue(previousZoom);
  await expect(unchanged.locator("#save-status")).toHaveText(
    "Saved on this device",
  );
  await unchanged.close();
  await library();
  let leavePrompts = 0;
  const dismissLeave = async (dialog) => {
    leavePrompts++;
    await dialog.dismiss();
  };
  page.on("dialog", dismissLeave);
  await page.locator("#library-new").click();
  await expect(page.locator("#library-dialog")).toBeVisible();
  expect(leavePrompts).toBe(1);
  page.off("dialog", dismissLeave);
  const acceptLeave = async (dialog) => {
    leavePrompts++;
    await dialog.accept();
  };
  page.on("dialog", acceptLeave);
  await page.locator("#library-new").click();
  await expect(page.locator("#setup")).toBeVisible();
  expect(leavePrompts).toBe(2);
  page.off("dialog", acceptLeave);
  await page.evaluate(() => window.restorePut());
  await library();
  await open("Biology questions");
  await expect(page.locator("#zoom")).toHaveValue(previousZoom);
  checks.push(
    "Storage exhaustion preserves the previous saved version; leaving warns once and can be cancelled",
  );
  await library();
  const damaged = await fs.readFile(backupPath);
  damaged[damaged.length - 20] ^= 1;
  await page.locator("#backup-file").setInputFiles({
    name: "damaged.pairleaf",
    mimeType: "application/octet-stream",
    buffer: damaged,
  });
  await expect(page.locator("#library-message")).toContainText("damaged");
  await expect(page.locator(".library-entry")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "library-mobile.png") });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  checks.push(
    "Damaged backups do not create entries; library fits mobile width",
  );
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify({ checks, errors, network }, null, 2),
  );
  console.log({ checks, errors, network });
} finally {
  await context?.close();
}
