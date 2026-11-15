import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
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
    path: path.resolve(process.env.PAIRLEAF_EXTENSION_DIR ?? "dist"),
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
function backupWithMetadata(original, metadata) {
  const previousSize = original.readUInt32BE(8);
  const encoded = Buffer.from(JSON.stringify(metadata));
  const header = Buffer.from(original.subarray(0, 44));
  header.writeUInt32BE(encoded.length, 8);
  createHash("sha256").update(encoded).digest().copy(header, 12);
  return Buffer.concat([header, encoded, original.subarray(44 + previousSize)]);
}
async function exportedMetadata(filename) {
  const download = page.waitForEvent("download");
  await page.locator("#study-export").click();
  const file = path.join(out, filename);
  await (await download).saveAs(file);
  const bytes = await fs.readFile(file);
  return JSON.parse(bytes.subarray(44, 44 + bytes.readUInt32BE(8)).toString());
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open("Biology textbook");
  const legacyDownload = page.waitForEvent("download");
  await page.locator("#study-export").click();
  const legacyPath = path.join(out, "legacy.pairleaf");
  await (await legacyDownload).saveAs(legacyPath);
  const original = await fs.readFile(legacyPath);
  const size = original.readUInt32BE(8);
  const legacy = JSON.parse(original.subarray(44, 44 + size).toString());
  // Stage 2 saved live checkbox values even after cancelling edits to the range dialog.
  const cancelledOcr = structuredClone(legacy);
  cancelledOcr.title = "Legacy selectable text";
  cancelledOcr.state.ocr.enabled = true;
  await library();
  await page.locator("#backup-file").setInputFiles({
    name: "cancelled-ocr.pairleaf",
    mimeType: "application/octet-stream",
    buffer: backupWithMetadata(original, cancelledOcr),
  });
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
  await expect(page.locator("#range-open")).toBeVisible();
  await page.locator("#range-open").click();
  await expect(page.locator("#range-start")).toHaveValue("3");
  await expect(page.locator("#range-end")).toHaveValue("6");
  await page.locator("#range-cancel").click();
  await page.reload();
  await library();
  await open("Legacy selectable text");
  await expect(page.locator("#range-open")).toBeVisible();
  const correctedText = await exportedMetadata("cancelled-ocr.pairleaf");
  expect(correctedText.state.ocr).toEqual({
    ...cancelledOcr.state.ocr,
    enabled: false,
  });
  expect(correctedText.state.fingerprint).toBe(cancelledOcr.state.fingerprint);
  expect(correctedText.hashes).toEqual(cancelledOcr.hashes);
  checks.push(
    "Cancelled legacy OCR checkbox does not disable range editing for a selectable-text study",
  );
  legacy.title = "Legacy textbook";
  legacy.state.ocr = {
    enabled: false,
    first: "1",
    last: "2",
    questions: "1",
    answers: "2",
  };
  legacy.state.fingerprint += ":ocr-v1:1-2:1-2";
  legacy.state.reportScope +=
    " AI checks extracted text against up to 12 candidate solutions per question.";
  legacy.state.matches[0].status = "suggested";
  legacy.state.matches[0].confirmed = false;
  legacy.state.matches[0].aiChecked = true;
  legacy.state.matches[0].reason =
    "Saved source proposal; confirm before revealing.";
  await library();
  await page.locator("#backup-file").setInputFiles({
    name: "legacy.pairleaf",
    mimeType: "application/octet-stream",
    buffer: backupWithMetadata(original, legacy),
  });
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
  await expect(page.locator("#range-open")).toBeHidden();
  await expect(page.locator("#match-count")).toHaveText(
    "0 matched / 2 questions",
  );
  await page.locator("#report-open").click();
  await expect(page.locator("#report-scope")).not.toContainText("AI checks");
  await page
    .getByRole("button", {
      name: "Review solution for chapter 1 / exercise A / 1",
      exact: true,
    })
    .click();
  await expect(page.locator("#review-preview-pages")).toBeHidden();
  await page.locator("#review-preview").click();
  await expect(
    page.locator("#review-preview-pages [data-rendered=true]"),
  ).toHaveCount(2);
  await page.locator("#review-confirm").click();
  await page.locator("#report-close").click();
  await saved();
  await page.reload();
  await library();
  await open("Legacy textbook");
  await expect(page.locator("#range-open")).toBeHidden();
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 2 questions",
  );
  const preserved = await exportedMetadata("legacy.pairleaf");
  expect(preserved.state.ocr).toEqual({ ...legacy.state.ocr, enabled: true });
  expect(preserved.hashes).toEqual(legacy.hashes);
  expect(preserved.state.matches[0].confirmed).toBe(true);
  checks.push(
    "Legacy recognition backups reopen without engines, retain source regions and settings, and allow local confirmation",
  );
  // Simulate a pre-upgrade saved record whose unsafe question was marked confirmed.
  await page.locator("#replace").click();
  const unsafeId = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("pairleaf-library", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(["entries", "states"], "readwrite");
        let id;
        const entries = tx.objectStore("entries").getAll();
        entries.onsuccess = () => {
          id = entries.result.find(
            (entry) => entry.title === "Legacy textbook",
          ).id;
          const state = tx.objectStore("states").get(id);
          state.onsuccess = () => {
            state.result.matches[0].questions[0].issue =
              "Legacy uncertain question bounds";
            state.result.matches[0].status = "matched";
            state.result.matches[0].confirmed = true;
            tx.objectStore("states").put(state.result, id);
          };
        };
        tx.oncomplete = () => resolve(id);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await library();
  await open("Legacy textbook");
  await expect(
    page.getByRole("button", {
      name: "Show solution for chapter 1 / exercise A / 1",
      exact: true,
    }),
  ).toHaveCount(0);
  // Read storage immediately after the open/save completes, without scrolling or editing.
  const migrated = await page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("pairleaf-library", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("states").objectStore("states").get(id);
        request.onsuccess = () => resolve(request.result.matches[0]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, unsafeId);
  expect(migrated.status).toBe("unsafe");
  expect(migrated.confirmed).toBe(false);
  checks.push(
    "Opening a legacy unsafe confirmed match disables reveal and persists the corrected status without an edit",
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
