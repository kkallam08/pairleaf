// Exercises PDF.js compatibility fallbacks; not a substitute for a Chrome 130 run.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { pdfFixture } from "../tests/pdf-fixture.mjs";

await fs.mkdir("tmp", { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/compat-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
});
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: path.resolve(process.env.PAIRLEAF_EXTENSION_DIR ?? "dist"),
  });
  await context.setOffline(true);
  const errors = [],
    external = [];
  context.on("request", (r) => {
    if (/^https?:/.test(r.url())) external.push(r.url());
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    delete Map.prototype.getOrInsertComputed;
    delete WeakMap.prototype.getOrInsertComputed;
    delete Uint8Array.prototype.toHex;
    delete Uint8Array.fromBase64;
    delete Response.prototype.bytes;
    delete Math.sumPrecise;
  });
  await page.goto(`chrome-extension://${id}/index.html`);
  await page
    .getByLabel("Questions PDF", { exact: true })
    .setInputFiles(pdfFixture([["1. Explain evaporation.", 100]]));
  await page
    .getByLabel("Solutions PDF", { exact: true })
    .setInputFiles(pdfFixture([["1. Water becomes vapor.", 100]]));
  await page.locator("#pair").click();
  await expect(page.locator(".paper[data-rendered=true]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  await expect(page.locator(".solution-crop[data-rendered=true]")).toHaveCount(
    1,
  );
  await expect(page.locator(".render-error")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  console.log(
    "Question and solution rendered offline without newer JavaScript built-ins.",
  );
} finally {
  await context.close();
}
