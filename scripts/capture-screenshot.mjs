import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Original practice material, generated in memory; no personal PDFs are used.
function practicePdf(name, lines) {
  const escape = (text) => text.replace(/[\\()]/g, "\\$&");
  const stream = lines
    .map(
      ([text, y, size = 12, font = "F1", x = 60]) =>
        `BT /${font} ${size} Tf ${x} ${792 - y - size} Td (${escape(text)}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [5 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${start}\n%%EOF`;
  return { name, mimeType: "application/pdf", buffer: Buffer.from(body) };
}

const questions = practicePdf("Algebra practice.pdf", [
  ["Algebra practice", 55, 24, "F2"],
  ["Quadratic equations and everyday problems", 95, 12],
  ["Show your reasoning and check each answer.", 118, 11],
  ["1. The garden problem", 170, 13, "F2"],
  ["A rectangular garden is 2 metres longer than it is wide.", 200],
  ["Its area is 48 square metres.", 220],
  ["Find the width and length of the garden.", 252],
  ["Start by defining a variable and writing an equation.", 284, 11],
  ["2. A quadratic equation", 380, 13, "F2"],
  ["Solve x squared - 5x + 6 = 0 by factorising.", 410],
  ["Check both solutions in the original equation.", 442],
  ["3. Two consecutive integers", 550, 13, "F2"],
  ["The product of two consecutive positive integers is 72.", 580],
  ["Find the integers and explain why a negative solution", 612],
  ["does not fit the question.", 632],
]);
const solutions = practicePdf("Algebra solutions.pdf", [
  ["Worked solutions", 55, 24, "F2"],
  ["Quadratic equations and everyday problems", 95, 12],
  ["1. The garden problem", 150, 13, "F2"],
  ["Let x be the width in metres.", 183],
  ["The length is x + 2, so the area gives:", 206],
  ["x(x + 2) = 48", 242, 13, "F1", 82],
  ["x squared + 2x - 48 = 0", 269, 13, "F1", 82],
  ["(x + 8)(x - 6) = 0", 296, 13, "F1", 82],
  ["Hence x = -8 or x = 6.", 332],
  ["A width must be positive, so x = 6.", 355],
  ["The garden is 6 metres wide and 8 metres long.", 391, 12, "F2"],
  ["Check: 6 x 8 = 48 square metres, and 8 - 6 = 2 metres.", 426, 11],
  ["2. A quadratic equation", 500, 13, "F2"],
  ["(x - 2)(x - 3) = 0, so x = 2 or x = 3.", 530],
  ["Check: 4 - 10 + 6 = 0 and 9 - 15 + 6 = 0.", 552],
  ["3. Two consecutive integers", 625, 13, "F2"],
  ["n(n + 1) = 72 gives (n + 9)(n - 8) = 0.", 655],
  ["Choose n = 8: the positive integers are 8 and 9.", 677],
  ["The other root, -9, gives negative integers.", 699],
]);

await fs.mkdir("tmp", { recursive: true });
await fs.mkdir("docs/images", { recursive: true });
await fs.mkdir("output/screenshots", { recursive: true });
const profile = await fs.mkdtemp(path.resolve("tmp/readme-screenshot-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [],
  external = [];
try {
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked", {
    path: path.resolve("dist"),
  });
  await context.setOffline(true);
  context.on("request", (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  await page
    .getByLabel("Questions PDF", { exact: true })
    .setInputFiles(questions);
  await page
    .getByLabel("Solutions PDF", { exact: true })
    .setInputFiles(solutions);
  await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
  await expect(page.locator("#match-count")).toHaveText(
    "3 matched / 3 questions",
  );
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  await expect(
    page.locator(".solution-crop[data-rendered=true]"),
  ).toBeVisible();
  await expect(page.locator("#save-status")).toHaveText("Saved on this device");
  await page.locator("#question-scroll").focus();
  await page.locator("#question-scroll").press("Control+Home");
  await expect
    .poll(() => page.locator("#question-scroll").evaluate((el) => el.scrollTop))
    .toBe(0);
  await page.mouse.move(1400, 980);
  await page.screenshot({
    path: "docs/images/reader.png",
    animations: "disabled",
  });
  assert.deepEqual(errors, [], "Unexpected browser errors");
  assert.deepEqual(external, [], "Unexpected external requests");
  await fs.writeFile(
    "output/screenshots/reader-check.json",
    JSON.stringify(
      {
        viewport: { width: 1440, height: 1000 },
        browser: context.browser().version(),
        fixture: "Original in-memory algebra practice and worked solutions",
        matched: 3,
        revealed: "1",
        errors,
        external,
      },
      null,
      2,
    ),
  );
  console.log(
    "Captured docs/images/reader.png offline; 3 matches, no browser errors or external requests.",
  );
} finally {
  await context.close();
}
