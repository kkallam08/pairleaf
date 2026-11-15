import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pdfFixture } from "../tests/pdf-fixture.mjs";

const out = path.resolve("output/interface");
await fs.mkdir(out, { recursive: true });
await fs.mkdir("tmp", { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/interface-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1440, height: 1000 },
});
const checks = [],
  errors = [],
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
  await expect(
    page.locator("#ai-open, #ai-setup, #helper-code, #ocr-enabled"),
  ).toHaveCount(0);
  await expect(page.locator(".local-badge")).toHaveText("On this device");
  await page.screenshot({ path: path.join(out, "import-desktop.png") });
  await expect(
    page.getByRole("radio", { name: "Answers in this PDF" }),
  ).toBeEnabled();
  await page.getByLabel("Questions PDF").focus();
  assert.equal(
    await page
      .locator("#questions-drop")
      .evaluate((e) => getComputedStyle(e).outlineStyle),
    "solid",
  );
  await page.getByLabel("Questions PDF").press("Tab");
  await expect(page.getByLabel("Solutions PDF")).toBeFocused();
  checks.push(
    "Keyboard file inputs have visible focus; both document arrangements are available",
  );

  const questions = pdfFixture([
    ["1.1.1. State the observation.", 100],
    ["1.1.2. Explain the difference.", 200],
    ["1.1.2. A second heading uses this number.", 300],
    ["1.1.3. Give an example.", 400],
    ["1.1.4. Compare the two methods.", 500],
  ]);
  const solutions = pdfFixture([
    ["1.1.1. The recorded observation.", 100],
    ["1.1.2. These differ in their structure.", 200],
    ["1.1.4. The first method uses fewer steps.", 500],
  ]);
  async function drop(selector, bytes, name) {
    await page.locator(selector).evaluate(
      (target, { bytes, name }) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], name, { type: "application/pdf" }),
        );
        target.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
      },
      { bytes: [...bytes], name },
    );
  }
  await drop("#questions-drop", [1], "invalid.txt");
  await expect(page.locator("#error")).toContainText("Drop one PDF");
  await drop("#questions-drop", questions.buffer, "Research questions.pdf");
  await drop("#solutions-drop", solutions.buffer, "Research solutions.pdf");
  await expect(page.locator("#error")).toBeHidden();
  await expect(page.locator("#questions-selection")).toHaveText(
    "Research questions.pdf",
  );
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await expect(page.locator("#reader")).toBeVisible();
  await expect(page.locator("#match-count")).toHaveText(
    "2 matched / 5 questions",
  );
  checks.push(
    "Invalid drops recover; valid drops populate real file inputs and pair successfully",
  );

  const finder = page.getByRole("combobox", { name: "Find problem" });
  await finder.fill("unknown");
  await expect(page.locator("#problem-list")).toContainText(
    "No question found",
  );
  await finder.fill("1.1.");
  await finder.press("ArrowDown");
  await finder.press("Enter");
  await expect(finder).toHaveValue("1.1.1");
  await expect(finder).toHaveAttribute("aria-expanded", "false");
  assert.equal(await page.locator("#solution-pages canvas").count(), 0);
  await finder.fill("1.1.");
  await finder.press("ArrowUp");
  await finder.press("Enter");
  await expect(finder).toHaveValue("1.1.4");
  await finder.fill("1.1.1");
  await finder.press("Enter");
  checks.push(
    "Combobox filters, announces empty results, and navigates by keyboard without revealing answers",
  );

  const reveal = page.getByRole("button", {
    name: "Show solution for 1.1.1",
    exact: true,
  });
  await reveal.focus();
  const before = await page
    .locator("#question-scroll")
    .evaluate((e) => e.scrollTop);
  await reveal.press("Enter");
  await expect(page.locator(".solution-crop").first()).toHaveAttribute(
    "data-rendered",
    "true",
  );
  assert.equal(
    await page.locator("#question-scroll").evaluate((e) => e.scrollTop),
    before,
  );
  await page.screenshot({ path: path.join(out, "reader-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(reveal).toBeFocused();
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  checks.push(
    "Keyboard reveal and Escape preserve reading position and return focus",
  );

  await page.locator("#report-open").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#report-list")).toContainText("Duplicate");
  await expect(page.locator("#report-list")).toContainText("Missing");
  assert.equal(await page.locator("#report canvas").count(), 0);
  await page.screenshot({ path: path.join(out, "review-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator("#report-open")).toBeFocused();
  checks.push(
    "Review shows source locations and issues without answer content; dialog returns focus",
  );

  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(250);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Page overflow at ${width}`,
    );
    await finder.fill("1.1.1");
    await finder.press("Enter");
    const button = page.getByRole("button", {
      name: "Show solution for 1.1.1",
      exact: true,
    });
    await button.scrollIntoViewIfNeeded();
    const scroll = await page
      .locator("#question-scroll")
      .evaluate((e) => e.scrollTop);
    await button.click();
    await expect(page.locator(".solution-crop").first()).toHaveAttribute(
      "data-rendered",
      "true",
    );
    await page.screenshot({ path: path.join(out, `reader-${width}.png`) });
    assert.equal(
      await page.locator("#question-scroll").evaluate((e) => e.scrollTop),
      scroll,
    );
    await page
      .getByRole("button", { name: "Close solution", exact: true })
      .click();
    assert.equal(
      await page.locator("#question-scroll").evaluate((e) => e.scrollTop),
      scroll,
    );
  }
  checks.push(
    "1024px and 390px layouts: no outer overflow; opening/closing answer preserves question position",
  );
  await page.locator("#report-open").click();
  await page.screenshot({ path: path.join(out, "review-mobile.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Change PDFs", exact: true }).click();
  await page.screenshot({ path: path.join(out, "import-mobile.png") });
  await expect(page.locator("#questions-selection")).toHaveText("Choose PDF");
  await expect(page.getByLabel("Questions PDF")).toBeFocused();
  checks.push(
    "Replacing documents clears file labels and returns focus to import",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify({ checks, errors, network }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, network }, null, 2));
} finally {
  await context.close();
}
