import { choosePdf } from "./local-file-fixtures.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Original study material, generated in memory. No personal or third-party PDFs.
function practicePdf(name, pages) {
  const escape = (text) => text.replace(/[\\()]/g, "\\$&");
  const streams = pages.map((lines) =>
    lines
      .map(
        ([text, y, size = 14, font = "F1", x = 52]) =>
          `BT /${font} ${size} Tf ${x} ${720 - y - size} Td (${escape(text)}) Tj ET`,
      )
      .join("\n"),
  );
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ...streams.flatMap((stream, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 720] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ]),
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
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

const algebra = practicePdf("Algebra practice.pdf", [
  [
    ["Algebra practice", 50, 25, "F2"],
    ["Quadratic equations", 90],
    ["1. The garden problem", 145, 16, "F2"],
    ["A rectangular garden is 2 metres longer", 180],
    ["than it is wide. Its area is 48 square metres.", 204],
    ["Find the width and length of the garden.", 245],
    ["Show your working and check your answer.", 278, 12],
    ["2. Two consecutive integers", 365, 16, "F2"],
    ["Two consecutive positive integers have", 400],
    ["a product of 72. Find the integers.", 424],
    ["Explain why the negative root is unsuitable.", 465, 12],
  ],
]);
const algebraAnswers = practicePdf("Algebra solutions.pdf", [
  [
    ["Worked solutions", 50, 25, "F2"],
    ["1. The garden problem", 130, 16, "F2"],
    ["Let x be the width in metres.", 167],
    ["The length is x + 2, so:", 191],
    ["x(x + 2) = 48", 231, 16, "F1", 68],
    ["x squared + 2x - 48 = 0", 261, 16, "F1", 68],
    ["(x + 8)(x - 6) = 0", 291, 16, "F1", 68],
    ["A width must be positive, so x = 6.", 333],
    ["The garden is 6 m wide and 8 m long.", 373, 14, "F2"],
    ["Check: 6 x 8 = 48 and 8 - 6 = 2.", 409, 13],
    ["2. Two consecutive integers", 510, 16, "F2"],
    ["n(n + 1) = 72, so (n + 9)(n - 8) = 0.", 545],
    ["The positive integers are 8 and 9.", 569],
    ["The other root, -9, gives negative integers.", 593],
  ],
]);
const book = practicePdf("Biology essentials.pdf", [
  [
    ["Biology essentials", 50, 25, "F2"],
    ["Chapter 1", 110, 18, "F2"],
    ["Exercise A", 150, 16, "F2"],
    ["1. Explain evaporation.", 205, 16, "F2"],
    ["Describe the change of state and explain", 240],
    ["why a puddle can dry on a cool day.", 264],
  ],
  [
    ["Chapter 2", 60, 22, "F2"],
    ["Exercise A", 110, 16, "F2"],
    ["1. Explain photosynthesis.", 170, 16, "F2"],
    ["Identify the energy source and describe", 205],
    ["what a plant produces.", 229],
  ],
  [
    ["Answers to exercises", 50, 25, "F2"],
    ["Chapter 1", 110, 18, "F2"],
    ["Exercise A", 150, 16, "F2"],
    ["1. Evaporation", 205, 16, "F2"],
    ["Liquid water changes into water vapour.", 240],
    ["Some particles at the surface have enough", 264],
    ["energy to escape even below boiling point.", 288],
  ],
  [
    ["Chapter 2", 60, 22, "F2"],
    ["Exercise A", 110, 16, "F2"],
    ["1. Photosynthesis", 170, 16, "F2"],
    ["Plants use light energy to make sugars", 205],
    ["from carbon dioxide and water.", 229],
    ["Oxygen is released as a by-product.", 270],
  ],
]);
const language = practicePdf("Reading practice.pdf", [
  [
    ["Reading practice", 50, 25, "F2"],
    ["Claims and evidence", 90],
    ["1. Identify the claim.", 160, 16, "F2"],
    ["The school should plant more trees because", 195],
    ["they provide shade in the playground.", 219],
    ["Which part states the writer's position?", 260],
  ],
]);
const languageAnswers = practicePdf("Reading solutions.pdf", [
  [
    ["Reading solutions", 50, 25, "F2"],
    ["1. Identify the claim.", 160, 16, "F2"],
    ["The claim is that the school should plant", 195],
    ["more trees. Providing shade is the reason", 219],
    ["given to support that position.", 243],
  ],
]);

const out = "store/screenshots";
await fs.mkdir(out, { recursive: true });
await fs.mkdir("tmp", { recursive: true });
await fs.mkdir("output/store", { recursive: true });
await fs.mkdir("output/store/fixtures", { recursive: true });
for (const fixture of [
  algebra,
  algebraAnswers,
  book,
  language,
  languageAnswers,
]) {
  await fs.writeFile(
    path.join("output/store/fixtures", fixture.name),
    fixture.buffer,
  );
}
const profile = await fs.mkdtemp(path.resolve("tmp/store-capture-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const errors = [],
  external = [],
  checks = [];
try {
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked", {
    path: path.resolve(process.env.PAIRLEAF_EXTENSION_DIR ?? "dist"),
  });
  await context.setOffline(true);
  context.on("request", (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  const saved = () =>
    expect(page.locator("#save-status")).toHaveText("Saved on this device");
  async function pair(questions, solutions) {
    await page.getByRole("radio", { name: "Separate PDFs" }).check();
    await choosePdf(page, "questions", questions);
    await choosePdf(page, "solutions", solutions);
    await page.getByRole("button", { name: "Pair PDFs", exact: true }).click();
    await saved();
  }
  async function screenshot(name) {
    await page.mouse.move(1260, 780);
    await page.screenshot({
      path: `${out}/${name}.png`,
      animations: "disabled",
    });
    const png = await fs.readFile(`${out}/${name}.png`);
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 800);
  }

  await pair(algebra, algebraAnswers);
  await expect(page.locator("#match-count")).toHaveText(
    "2 matched / 2 questions",
  );
  await page
    .getByRole("button", { name: "Show solution for 1", exact: true })
    .click();
  await expect(
    page.locator(".solution-crop[data-rendered=true]"),
  ).toBeVisible();
  await page.locator("#question-scroll").focus();
  await page.locator("#question-scroll").press("Control+Home");
  await expect
    .poll(() => page.locator("#question-scroll").evaluate((el) => el.scrollTop))
    .toBe(0);
  await screenshot("01-paired-reader");
  checks.push(
    "Separate PDFs: two matched questions, original solution rendered, study saved.",
  );

  await page.getByRole("button", { name: "Change PDFs", exact: true }).click();
  await page.getByRole("radio", { name: "Answers in this PDF" }).check();
  await choosePdf(page, "questions", book);
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(page.locator("#answer-range")).toBeVisible();
  await expect(page.locator("#range-start")).toHaveValue("3");
  await expect(page.locator("#range-end")).toHaveValue("4");
  await page.locator("#range-preview-start").click();
  await expect(page.locator("#range-preview [data-rendered=true]")).toHaveCount(
    1,
  );
  await screenshot("02-textbook-answer-pages");
  await page.locator("#range-apply").click();
  await expect(page.locator("#match-count")).toHaveText(
    "2 matched / 2 questions",
  );
  await saved();
  checks.push(
    "Single PDF: automatically detected answer pages 3–4; preview and repeated chapter labels work.",
  );

  await page.getByRole("button", { name: "Change PDFs", exact: true }).click();
  await pair(language, languageAnswers);
  await expect(page.locator("#match-count")).toHaveText(
    "1 matched / 1 question",
  );
  await page.locator("#rail-library").click();
  await expect(page.locator(".library-book")).toHaveCount(3);
  await expect(page.locator("#library-refresh")).toBeEnabled();
  await expect(page.locator("#library-message")).not.toHaveText("Working…");
  await screenshot("03-study-library");
  checks.push(
    "Library: three genuinely saved sets, covering two PDF pairs and a textbook.",
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    "output/store/capture-results.json",
    JSON.stringify(
      {
        browser: context.browser().version(),
        viewport: { width: 1280, height: 800 },
        checks,
        errors,
        external,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors, external }, null, 2));
} finally {
  await context.close();
}
