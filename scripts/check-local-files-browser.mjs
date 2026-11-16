import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { pdfBookFixture } from "../tests/pdf-fixture.mjs";
import {
  fixturePath,
  grantFiles,
  chooseFile,
  recoverFiles,
  importBackup,
} from "./local-file-fixtures.mjs";

const out = path.resolve("output/local-files");
await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/local-files-"));
const checks = [],
  errors = [],
  network = [];
const question = pdfBookFixture([[["1. Explain evaporation.", 100]]]);
question.name = "Local questions.pdf";
const answer = pdfBookFixture([[["1. Water becomes vapor.", 100]]]);
answer.name = "Local answers.pdf";
const qp = await fixturePath(question),
  ap = await fixturePath(answer);
let context, page, url;
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
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
async function saved() {
  await expect(page.locator("#save-status")).toHaveText("Saved on this device");
}
async function library() {
  await page.locator("#rail-library").click();
  await expect(page.locator("#library-refresh")).toBeEnabled();
}
async function record() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("pairleaf-library", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction(["entries", "files", "states"]);
    const get = (store) =>
      new Promise((resolve) => {
        const r = tx.objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result[0]);
      });
    const [meta, files, state] = await Promise.all([
      get("entries"),
      get("files"),
      get("states"),
    ]);
    db.close();
    return {
      meta,
      state,
      kind: files.kind ?? "legacy",
      blobs: files.questions instanceof Blob,
      hash: files.questions?.hash,
      handle: files.questions?.handle?.kind,
      backup: files.backup?.handle?.kind,
    };
  });
}
async function chooseRow(role, file) {
  await chooseFile(
    page,
    file,
    `.local-file-row button[aria-label="Locate ${role} file"]`,
  );
}
async function open() {
  await page.locator(".library-book").first().click();
}
try {
  await launch();
  // Exercise the application's genuine drag/drop handlers with external files.
  const cdp = await context.newCDPSession(page);
  for (const [role, file] of [
    ["questions", qp],
    ["solutions", ap],
  ]) {
    const b = await page.locator(`#${role}-drop`).boundingBox();
    const data = { items: [], files: [file], dragOperationsMask: 1 };
    for (const type of ["dragEnter", "dragOver", "drop"])
      await cdp.send("Input.dispatchDragEvent", {
        type,
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
        data,
      });
    await expect(page.locator(`#${role}-selection`)).toHaveText(
      path.basename(file),
    );
  }
  await cdp.detach();
  await page.locator("#pair").click();
  await saved();
  await page.locator("#zoom").selectOption("1.25");
  await saved();
  let before = await record();
  expect(before.kind).toBe("pdfs");
  expect(before.blobs).toBe(false);
  expect(before.handle).toBe("file");
  checks.push(
    "Real PDF drops store file handles and SHA-256 references, without PDF blobs",
  );
  await context.close();
  await launch();
  await library();
  await open();
  await expect(page.locator(".local-files-dialog")).toBeVisible();
  // Simulate declining the browser prompt, then grant via a trusted drop and
  // exercise the real handle.requestPermission method with access granted.
  await page.evaluate(() => {
    const original = FileSystemHandle.prototype.requestPermission;
    window.restorePermission = () =>
      (FileSystemHandle.prototype.requestPermission = original);
    FileSystemHandle.prototype.requestPermission = async () => "denied";
  });
  await page
    .getByRole("button", { name: "Allow questions access", exact: true })
    .click();
  await expect(page.locator(".local-files-error")).toContainText("not allowed");
  await expect(page.locator(".files-apply")).toBeDisabled();
  await page.evaluate(() => window.restorePermission());
  await grantFiles(page, [qp, ap]);
  for (const role of ["questions", "solutions"])
    await page
      .getByRole("button", { name: `Allow ${role} access`, exact: true })
      .click();
  await expect(page.locator(".files-apply")).toBeEnabled();
  await page.locator(".files-apply").click();
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
  await expect(page.locator("#zoom")).toHaveValue("1.25");
  checks.push(
    "Full browser restart restores progress after renewed access; declined permission leaves the saved study intact",
  );

  await page.locator("#replace").click();
  // Same size/name, different contents: the digest must catch this.
  const changed = Buffer.from(question.buffer);
  const at = changed.indexOf("evaporation");
  expect(at).toBeGreaterThan(0);
  changed[at] = 69;
  await fs.writeFile(qp, changed);
  await library();
  await open();
  await expect(page.locator(".local-files-dialog")).toBeVisible();
  before = await record();
  await chooseRow("questions", qp);
  await expect(page.locator(".local-files-error")).toContainText(
    "different or changed",
  );
  await expect(page.locator(".files-apply")).toBeDisabled();
  expect((await record()).meta.version).toBe(before.meta.version);
  await page.evaluate(() => {
    window.showOpenFilePicker = async () => {
      throw new DOMException("Cancelled", "AbortError");
    };
  });
  await page
    .getByRole("button", { name: "Locate questions file", exact: true })
    .click();
  await expect(page.locator(".files-apply")).toBeDisabled();
  await page.locator(".files-cancel").click();
  expect((await record()).state).toEqual(before.state);
  checks.push(
    "Changed same-name/same-size PDFs and cancelled choosers cannot replace a saved reference or state",
  );

  await fs.writeFile(qp, question.buffer);
  const moved = path.join(path.dirname(qp), "Moved local questions.pdf");
  await fs.rename(qp, moved);
  await open();
  await expect(page.locator(".local-files-dialog")).toBeVisible();
  await chooseRow("questions", moved);
  await chooseRow("solutions", ap);
  await expect(page.locator(".files-apply")).toBeEnabled();
  await page.locator(".files-apply").click();
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
  await expect(page.locator("#zoom")).toHaveValue("1.25");
  checks.push(
    "Missing/moved files can be relocated by verified content, preserving progress",
  );

  // Seed exactly the legacy blob shape to exercise nondestructive migration.
  await page.locator("#replace").click();
  await page.evaluate(
    async (bytes) => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open("pairleaf-library", 1);
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["entries", "files"], "readwrite"),
          r = tx.objectStore("entries").getAll();
        r.onsuccess = () =>
          tx.objectStore("files").put(
            {
              questions: new Blob([new Uint8Array(bytes.q)]),
              solutions: new Blob([new Uint8Array(bytes.a)]),
            },
            r.result[0].id,
          );
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { q: [...question.buffer], a: [...answer.buffer] },
  );
  await library();
  await open();
  await saved();
  expect((await record()).blobs).toBe(true);
  await library();
  await page
    .getByRole("button", { name: /Locate files Local questions/ })
    .click();
  await chooseRow("questions", ap);
  await expect(page.locator(".local-files-error")).toContainText(
    "different or changed",
  );
  await page.locator(".files-cancel").click();
  expect((await record()).blobs).toBe(true);
  await page
    .getByRole("button", { name: /Locate files Local questions/ })
    .click();
  await chooseRow("questions", moved);
  await chooseRow("solutions", ap);
  // Force a synchronous clone/storage failure after validation.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restorePut = () => (IDBObjectStore.prototype.put = put);
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "files")
        throw new DOMException("Test write failure", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.locator(".files-apply").click();
  await expect(page.locator("#library-message")).toContainText(
    "Test write failure",
  );
  expect((await record()).blobs).toBe(true);
  await page.evaluate(() => window.restorePut());
  await page
    .getByRole("button", { name: /Locate files Local questions/ })
    .click();
  await chooseRow("questions", moved);
  await chooseRow("solutions", ap);
  await page.locator(".files-apply").click();
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
  expect((await record()).blobs).toBe(false);
  await expect(page.locator("#zoom")).toHaveValue("1.25");
  checks.push(
    "Legacy PDF copies remain readable; cancellation, incorrect files and failed migration preserve them; successful migration removes copies atomically",
  );

  // Another tab changes the record while the migration dialog is open.
  await library();
  await page
    .getByRole("button", { name: /Locate files Local questions/ })
    .click();
  await chooseRow("questions", moved);
  await chooseRow("solutions", ap);
  const other = await context.newPage();
  await other.goto(url);
  await other.locator("#library-open").click();
  other.once("dialog", (d) => d.accept("Renamed study"));
  await other.getByRole("button", { name: /Rename Local questions/ }).click();
  await expect(other.locator(".library-book")).toContainText("Renamed study");
  await other.close();
  await page.locator(".files-apply").click();
  await expect(page.locator("#library-message")).toContainText("Study changed");
  expect((await record()).meta.title).toBe("Renamed study");
  checks.push("A competing tab's changes prevent a stale file-link update");

  // Reopen the authoritative record and export a full portable backup.
  await page.locator("#library-refresh").click();
  await open();
  await saved();
  const download = page.waitForEvent("download");
  await page.locator("#study-export").click();
  const backup = path.join(out, "portable.pairleaf");
  await (await download).saveAs(backup);
  await library();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete Renamed study", exact: true })
    .click();
  await expect(page.locator(".library-entry")).toHaveCount(0);
  expect(await fs.readFile(moved)).toEqual(question.buffer);
  expect(await fs.readFile(ap)).toEqual(answer.buffer);
  await fs.unlink(moved);
  await fs.unlink(ap); // Disposable fixtures owned by this test only.
  await importBackup(page, backup);
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
  expect((await record()).kind).toBe("backup");
  expect((await record()).backup).toBe("file");
  await context.close();
  await launch();
  await library();
  await open();
  await recoverFiles(page);
  await saved();
  await expect(page.locator("#zoom")).toHaveValue("1.25");
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  await expect(page.locator(".solution-crop[data-rendered=true]")).toHaveCount(
    1,
  );
  checks.push(
    "Deletion leaves original files alone; a complete backup restores and reopens without original PDFs and stores only its file reference",
  );
  await library();
  await page
    .getByRole("button", { name: "Locate files Renamed study", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({ path: path.join(out, "locate-mobile.png") });
  await page.locator(".files-cancel").click();
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(
      { browser: context.browser().version(), checks, errors, network },
      null,
      2,
    ),
  );
  console.log({ checks, errors, network });
} finally {
  await context?.close();
}
