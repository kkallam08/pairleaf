// Historical UI check for commit bbda4ef; not a check of the current local MVP.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
await fs.mkdir("output/ocr", { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/ocr-chrome-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1440, height: 1000 },
});
const errors = [],
  network = [];
try {
  const session = await context.browser().newBrowserCDPSession();
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
  await page.getByRole("radio", { name: "Answers in this PDF" }).check();
  await page
    .getByLabel("Textbook PDF")
    .setInputFiles(
      process.argv[2] ??
        path.join(
          os.homedir(),
          "Downloads",
          "Mathematics - Core Topics HL 1 - Haese 2019.pdf",
        ),
    );
  await page.locator("#pair").click();
  await expect(page.locator("#answer-range")).toBeVisible();
  await page.locator("#range-start").fill("485");
  await page.locator("#range-end").fill("486");
  await page.locator("#ocr-enabled").check();
  await page.locator("#ocr-question-start").fill("22");
  await page.locator("#ocr-question-end").fill("27");
  await page.screenshot({ path: "output/ocr/setup.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#range-apply").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/ocr/setup-mobile.png" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const started = Date.now();
  await page.locator("#range-apply").click();
  await expect(page.locator("#answer-range")).not.toBeVisible({
    timeout: 180000,
  });
  const elapsedMs = Date.now() - started;
  await expect(page.locator("#match-count")).toHaveText(
    "0 matched / 24 questions",
  );
  await page.locator("#report-open").click();
  await page.locator("#report-filter").selectOption("all");
  const rows = await page.locator("#report-list").innerText();
  expect((rows.match(/Suggested/g) ?? []).length).toBe(24);
  const checked = [];
  for (const [exercise, total] of [
    ["1A", 19],
    ["1B", 5],
  ])
    for (let number = 1; number <= total; number++) {
      await page
        .getByRole("button", {
          name: `Review solution for exercise ${exercise} / ${number}`,
          exact: true,
        })
        .click();
      await page.locator("#review-preview").click();
      const regions = exercise === "1B" && number === 1 ? 2 : 1;
      await expect(page.locator("#review-preview-pages canvas")).toHaveCount(
        regions,
      );
      for (let i = 0; i < regions; i++) {
        const canvas = page.locator("#review-preview-pages canvas").nth(i);
        await canvas.scrollIntoViewIfNeeded();
        await expect(canvas.locator("..")).toHaveAttribute(
          "data-rendered",
          "true",
        );
        const png = await canvas.evaluate(
          (node) => node.toDataURL("image/png").split(",")[1],
        );
        await fs.writeFile(
          `output/ocr/answer-${exercise}-${number}-${i}.png`,
          Buffer.from(png, "base64"),
        );
      }
      await page.locator("#review-confirm").click();
      checked.push({ exercise, number, regions });
    }
  await page.locator("#report-close").click();
  await expect(page.locator("#match-count")).toHaveText(
    "24 matched / 24 questions",
  );
  await page
    .getByRole("combobox", { name: "Find problem" })
    .fill("exercise 1B / 1");
  await page.getByRole("combobox", { name: "Find problem" }).press("Enter");
  await page
    .getByRole("button", {
      name: "Show solution for exercise 1B / 1",
      exact: true,
    })
    .click();
  await expect(page.locator(".solution-region")).toHaveCount(2);
  await page.screenshot({ path: "output/ocr/result.png" });
  // Cancel during actual OCR, then immediately rerun and restore confirmed choices.
  await page.locator("#range-open").click();
  await page.locator("#range-apply").click();
  await expect(page.locator("#ocr-progress")).toContainText(
    "Reading scanned page",
    { timeout: 30000 },
  );
  await page.locator("#range-cancel").click();
  await expect(page.locator("#answer-range")).not.toBeVisible();
  await expect(page.locator("#match-count")).toHaveText(
    "24 matched / 24 questions",
  );
  await page.locator("#range-open").click();
  await expect(page.locator("#range-apply")).toBeEnabled();
  await page.locator("#range-apply").click();
  await expect(page.locator("#answer-range")).not.toBeVisible({
    timeout: 180000,
  });
  await expect(page.locator("#match-count")).toHaveText(
    "24 matched / 24 questions",
  );
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
  const result = {
    questionPages: [22, 27],
    answerPages: [485, 486],
    elapsedMs,
    questions: 24,
    proposals: 24,
    automaticAssignments: 0,
    checked,
    restoredChoices: 24,
    cancellation: true,
    errors,
    network,
  };
  await fs.writeFile("output/ocr/probe.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
