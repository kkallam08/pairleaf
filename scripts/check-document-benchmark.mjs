// Publicly available source documents stay in ignored test storage, not releases.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const benchmark = JSON.parse(
  await fs.readFile("tests/document-benchmark.json", "utf8"),
);
const inputs = path.resolve("tmp/store-benchmark");
const out = path.resolve("output/store-benchmark");
await fs.mkdir(inputs, { recursive: true });
await fs.mkdir(out, { recursive: true });
for (const [name, source] of Object.entries(benchmark.files)) {
  const file = path.join(inputs, name);
  let bytes;
  try {
    bytes = await fs.readFile(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    assert.ok(
      process.argv.includes("--download"),
      `Missing ${name}; run with --download to fetch the documented public sources.`,
    );
    const response = await fetch(source.url);
    assert.ok(response.ok, `Download failed: ${response.status} ${source.url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      source.sha256,
      `Source changed: ${name}`,
    );
    await fs.writeFile(file, bytes);
  }
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    source.sha256,
    `Source changed: ${name}; re-review the benchmark before updating its checksum.`,
  );
}

const profile = await fs.mkdtemp(path.resolve("tmp/document-benchmark-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1440, height: 1000 },
});
const errors = [],
  external = [],
  results = [];
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: path.resolve(process.env.PAIRLEAF_EXTENSION_DIR ?? "dist"),
  });
  await context.setOffline(true);
  context.on("request", (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  for (const entry of benchmark.cases) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/index.html`);
    if (entry.answerRange) {
      await page.getByRole("radio", { name: "Answers in this PDF" }).check();
      await page
        .getByLabel("Textbook PDF")
        .setInputFiles(path.join(inputs, entry.questions));
      await page.getByRole("button", { name: "Open PDF", exact: true }).click();
      await expect(page.locator("#range-start")).toHaveValue(
        String(entry.answerRange[0]),
      );
      await expect(page.locator("#range-end")).toHaveValue(
        String(entry.answerRange[1]),
      );
      await page.locator("#range-apply").click();
    } else {
      await page
        .getByLabel("Questions PDF", { exact: true })
        .setInputFiles(path.join(inputs, entry.questions));
      await page
        .getByLabel("Solutions PDF", { exact: true })
        .setInputFiles(path.join(inputs, entry.solutions));
      await page.locator("#pair").click();
    }
    await expect(page.locator("#save-status")).toHaveText(
      "Saved on this device",
      { timeout: 30000 },
    );
    const states = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("pairleaf-library", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const read = db
              .transaction("states", "readonly")
              .objectStore("states")
              .getAll();
            read.onsuccess = () => {
              resolve(read.result);
              db.close();
            };
            read.onerror = () => {
              reject(read.error);
              db.close();
            };
          };
        }),
    );
    const state = states.find((s) => s.questionName === entry.questions);
    assert.ok(state, `Saved state missing for ${entry.name}`);
    const expectedIds = entry.questionPages.map((_, i) => String(i + 1));
    assert.deepEqual(
      state.matches.map((m) => m.id),
      expectedIds,
      `${entry.name}: detected question coverage`,
    );
    await expect(page.locator("#match-count")).toHaveText(
      `${expectedIds.length} matched / ${expectedIds.length} questions`,
    );
    const revealed = [];
    for (const [index, match] of state.matches.entries()) {
      assert.equal(match.status, "matched");
      assert.equal(match.questions.length, 1);
      assert.equal(match.questions[0].page, entry.questionPages[index]);
      assert.equal(match.solutions.length, 1);
      assert.equal(match.solutions[0].id, match.id);
      const regions = match.solutions[0].regions;
      const requiredPages = entry.answerPages[index];
      const pages = regions.map((region) => region.page);
      for (const required of requiredPages)
        assert.ok(
          pages.includes(required),
          `${entry.name}/${match.id}: missing original answer page ${required}`,
        );
      const extras = pages.filter((p) => !requiredPages.includes(p));
      assert.ok(
        extras.every((p) => {
          if (
            entry.knownExtraPage?.question === match.id &&
            entry.knownExtraPage.page === p
          )
            return true;
          if (
            entry.knownLeadingStrip?.question !== match.id ||
            entry.knownLeadingStrip.page !== p
          )
            return false;
          const next = state.sources.find(
            (source) => source.id === entry.knownLeadingStrip.beforeQuestion,
          );
          return (
            next &&
            regions
              .filter((region) => region.page === p)
              .every((region) => region.y + region.height <= next.top)
          );
        }),
        `${entry.name}/${match.id}: unexpected source page`,
      );
      for (const region of regions)
        for (const other of state.sources) {
          if (other.id !== match.id && other.page === region.page)
            assert.ok(
              other.y < region.y || other.y >= region.y + region.height,
              `${entry.name}/${match.id}: neighboring answer ${other.id} leaked into crop`,
            );
        }
      // These source lines crossed the old fixed top margin and were clipped.
      if (entry.name === "mit-biology" && match.id === "2") {
        const continuation = regions.find((r) => r.page === 2);
        assert.ok(
          continuation.y < 38.094,
          "Complete first line of biology answer 2 must remain visible",
        );
      }
      if (entry.name === "mit-biology" && match.id === "6") {
        const illustrated = regions.find((region) => region.page === 2);
        assert.ok(
          illustrated.y + illustrated.height >= 779,
          "Complete lower molecular diagram must remain visible",
        );
      }
      await page.getByLabel("Find problem").fill(match.id);
      await page.getByLabel("Find problem").press("Enter");
      const reveal = page.getByRole("button", {
        name: `Show solution for ${match.id}`,
        exact: true,
      });
      await reveal.scrollIntoViewIfNeeded();
      const before = await page
        .locator("#question-scroll")
        .evaluate((e) => e.scrollTop);
      await reveal.click();
      assert.equal(
        await page.locator("#question-scroll").evaluate((e) => e.scrollTop),
        before,
      );
      await expect(page.locator(".solution-crop")).toHaveCount(regions.length);
      for (let n = 0; n < regions.length; n++) {
        const crop = page.locator(".solution-crop").nth(n);
        await crop.scrollIntoViewIfNeeded();
        await expect(crop).toHaveAttribute("data-rendered", "true");
        const png = await crop
          .locator("canvas")
          .evaluate((c) => c.toDataURL("image/png").split(",")[1]);
        await fs.writeFile(
          path.join(out, `${entry.name}-answer-${match.id}-${n + 1}.png`),
          Buffer.from(png, "base64"),
        );
      }
      revealed.push({
        question: match.id,
        questionPage: match.questions[0].page,
        answerPages: pages,
        extraPages: extras,
      });
    }
    results.push({
      name: entry.name,
      title: entry.title,
      expectedQuestions: expectedIds.length,
      detectedQuestions: state.matches.length,
      correctSourceAssignments: revealed.length,
      revealed,
      knownLimit: entry.knownExtraPage?.description,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const report = {
    chrome: context.browser().version(),
    offline: true,
    results,
    errors,
    external,
    note: "Source correspondence and required pages checked; crop PNGs require visual inspection. Small benchmark, not general PDF accuracy.",
  };
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        cases: results.length,
        questions: results.reduce((sum, r) => sum + r.expectedQuestions, 0),
        correctSourceAssignments: results.reduce(
          (sum, r) => sum + r.correctSourceAssignments,
          0,
        ),
        errors,
        external,
        knownLimit: benchmark.cases.at(-1).knownExtraPage.description,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
}
