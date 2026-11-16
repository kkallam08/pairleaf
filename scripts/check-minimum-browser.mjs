import {
  choosePdf,
  importBackup,
  recoverFiles,
} from "./local-file-fixtures.mjs";
// Runs the real declared minimum Chrome major in an isolated, offline profile.
// Set PAIRLEAF_CHROME_PATH to an official Chrome for Testing executable.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pdfBookFixture } from "../tests/pdf-fixture.mjs";

const extensionPath = path.resolve(
  process.env.PAIRLEAF_EXTENSION_DIR ?? "dist",
);
const executablePath = path.resolve(
  process.env.PAIRLEAF_CHROME_PATH ??
    "tmp/minimum-browser-download/130.0.6723.116/chrome-win64/chrome.exe",
);
await fs.access(executablePath);
const manifest = JSON.parse(
  await fs.readFile(path.join(extensionPath, "manifest.json"), "utf8"),
);
const minimumMajor = Number(manifest.minimum_chrome_version.split(".")[0]);
const out = path.resolve("output/minimum-browser");
await fs.mkdir(out, { recursive: true });
await fs.mkdir("tmp", { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/minimum-browser-profile-"));
const checks = [],
  errors = [],
  external = [];
let context, page, extensionUrl, browserVersion;

async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    executablePath,
    // Chrome 130 needs new headless for extension support. It has no CDP
    // Extensions.loadUnpacked command, so use its supported loading flags.
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--headless=new",
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  browserVersion = context.browser().version();
  assert.equal(
    Number(browserVersion.split(".")[0]),
    minimumMajor,
    "This check must run the declared minimum Chrome major, not current Chrome",
  );
  await context.setOffline(true);
  context.on("request", (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  extensionUrl = `chrome-extension://${new URL(worker.url()).hostname}/index.html`;
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(extensionUrl);
}
const questions = pdfBookFixture([
  [
    ["1. Explain evaporation.", 100],
    ["2. Explain photosynthesis.", 400],
  ],
  [["3. Explain condensation.", 100]],
]);
questions.name = "Minimum browser questions.pdf";
const answers = pdfBookFixture([
  [
    ["1. Water becomes vapor.", 100],
    ["2. Plants use sunlight.", 400],
  ],
  [["3. Vapor becomes liquid.", 100]],
]);
answers.name = "Minimum browser answers.pdf";
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
  [["The explanation continues on this page.", 100]],
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
book.name = "Minimum browser textbook.pdf";
const saved = () =>
  expect(page.locator("#save-status")).toHaveText("Saved on this device");
async function library() {
  await page.locator("#rail-library").click();
  await expect(page.locator("#library-refresh")).toBeEnabled();
  await expect(page.locator("#library-message")).not.toHaveText("Working…");
}
async function open(title) {
  await page.locator(".library-book").filter({ hasText: title }).click();
  await recoverFiles(page);
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
}
async function reviewFirst(confirmed = false) {
  await page.locator("#report-open").click();
  await page.locator("#report-filter").selectOption("all");
  const choice = page.getByRole("button", {
    name: "Review solution for 1",
    exact: true,
  });
  if (confirmed) await expect(choice).toHaveText("Change choice");
  await choice.click();
}
async function record(failure) {
  const buildFingerprint = createHash("sha256")
    .update(await fs.readFile(path.join(extensionPath, "manifest.json")))
    .update(await fs.readFile(path.join(extensionPath, "index.html")))
    .digest("hex");
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        browser: browserVersion,
        platform: process.platform,
        minimumChromeVersion: manifest.minimum_chrome_version,
        extensionVersion: manifest.version,
        buildFingerprint,
        offline: true,
        binarySource: "https://googlechromelabs.github.io/chrome-for-testing/",
        checks,
        errors,
        external,
        ...(failure ? { failure } : {}),
      },
      null,
      2,
    ),
  );
}
try {
  await launch();
  await choosePdf(page, "questions", questions);
  await choosePdf(page, "solutions", answers);
  await page.locator("#pair").click();
  await expect(page.locator("#match-count")).toHaveText(
    "3 matched / 3 questions",
  );
  await saved();
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  await expect(page.locator(".solution-crop[data-rendered=true]")).toHaveCount(
    1,
  );
  await expect(
    page.locator(".paper[data-rendered=true]").first(),
  ).toBeVisible();
  await page.screenshot({ path: path.join(out, "pair-reveal.png") });
  checks.push(
    "PDF pair parses, matches, saves and renders its original source answer",
  );

  await reviewFirst();
  const chosenSource = await page.locator("#review-source").inputValue();
  await page.locator("#review-preview").click();
  await expect(page.locator("#review-preview-pages canvas")).toHaveCount(1);
  await page.locator("#review-confirm").click();
  await page.locator("#report-close").click();
  await page.locator("#page-number").fill("2");
  await page.locator("#page-number").press("Enter");
  await page.locator("#zoom").selectOption("1.25");
  await saved();
  await library();
  page.once("dialog", (d) => d.accept("Minimum browser study"));
  await page
    .getByRole("button", {
      name: "Rename Minimum browser questions",
      exact: true,
    })
    .click();
  await expect(page.locator(".library-book")).toContainText(
    "Minimum browser study",
  );
  await page.locator("#library-close").click();
  await saved();
  await context.close();
  await launch();
  await library();
  await open("Minimum browser study");
  await expect(page.locator("#page-number")).toHaveValue("2");
  await expect(page.locator("#zoom")).toHaveValue("1.25");
  await reviewFirst(true);
  await expect(page.locator("#review-source")).toHaveValue(chosenSource);
  await page.locator("#review-close").click();
  await page.locator("#report-close").click();
  checks.push(
    "Review confirmation, title, reading page and zoom survive a complete browser restart with renewed file access",
  );

  const downloading = page.waitForEvent("download");
  await page.locator("#study-export").click();
  const backupPath = path.join(out, "minimum-browser.pairleaf");
  await (await downloading).saveAs(backupPath);
  await library();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete Minimum browser study", exact: true })
    .click();
  await expect(page.locator(".library-entry")).toHaveCount(0);
  await importBackup(page, backupPath);
  await expect(page.locator("#library-dialog")).not.toBeVisible();
  await saved();
  await library();
  await expect(page.locator(".library-entry")).toHaveCount(1);
  await open("Minimum browser study");
  await expect(page.locator("#match-count")).toHaveText(
    "3 matched / 3 questions",
  );
  await expect(page.locator("#page-number")).toHaveValue("2");
  checks.push(
    "Complete study backup exports, deletes and imports as a usable library copy",
  );

  await page.locator("#replace").click();
  await page.getByRole("radio", { name: "Answers in this PDF" }).check();
  await choosePdf(page, "questions", book);
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(page.locator("#range-start")).toHaveValue("3");
  await expect(page.locator("#range-end")).toHaveValue("5");
  await page.locator("#range-preview-start").click();
  await expect(page.locator("#range-preview [data-rendered=true]")).toHaveCount(
    1,
  );
  await page.locator("#range-apply").click();
  await expect(page.locator("#match-count")).toHaveText(
    "2 matched / 2 questions",
  );
  await page
    .getByRole("button", {
      name: "Show solution for chapter 1 / exercise A / 1",
      exact: true,
    })
    .click();
  await expect(page.locator(".solution-region")).toHaveCount(3);
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
  await page.screenshot({ path: path.join(out, "single-pdf.png") });
  await page.locator("#range-open").click();
  await page.locator("#range-end").fill("4");
  await page.locator("#range-apply").click();
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 2 questions",
  );
  await saved();
  await page.reload();
  await library();
  await open("Minimum browser textbook");
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 2 questions",
  );
  await page.locator("#range-open").click();
  await expect(page.locator("#range-start")).toHaveValue("3");
  await expect(page.locator("#range-end")).toHaveValue("4");
  checks.push(
    "Single-PDF detection, preview, repeated chapter labels, multi-page reveal and corrected range persist",
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await record();
  console.log(
    JSON.stringify(
      { browser: browserVersion, checks, errors, external },
      null,
      2,
    ),
  );
} catch (error) {
  await record(error.stack ?? String(error));
  throw error;
} finally {
  await context?.close();
}
