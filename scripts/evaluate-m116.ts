import assert from "node:assert/strict";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import { analyze } from "../src/parser";
import {
  applySuggestion,
  rankCandidates,
  requestBody,
  sourceKey,
} from "../experiments/ai";
import { createMatcher } from "../server/matching.mjs";
import type { PageText, Match } from "../src/model";

// This checked fixture has eight same-number pairs. Accept paths, never bundle PDFs.
const paths = process.argv.slice(2);
assert.equal(
  paths.length,
  2,
  "Provide the M116P7 question and solution PDF paths.",
);
async function extract(file: string): Promise<PageText[]> {
  const doc = await getDocument({
    data: new Uint8Array(await readFile(file)),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  try {
    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((i) => "str" in i && i.str.trim())
        .map((i) => {
          if (!("str" in i)) throw new Error("Unexpected text item");
          const t = Util.transform(viewport.transform, i.transform);
          const size = Math.hypot(t[2], t[3]),
            style = content.styles[i.fontName];
          return {
            text: i.str,
            x: t[4],
            y: t[5] - size * (style.ascent ?? 0.8),
            bottom: t[5] - size * (style.descent ?? -0.2),
            baseline: t[5],
            width: i.width,
            height: size,
            font: i.fontName,
          };
        });
      pages.push({
        page: n,
        width: viewport.width,
        height: viewport.height,
        items,
      });
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.loadingTask.destroy();
  }
}
const qa = analyze(await extract(paths[0]), "questions");
const sa = analyze(await extract(paths[1]), "solutions");
assert.deepEqual(
  qa.headings.map((q) => q.id),
  ["1", "2", "3", "4", "5", "6", "7", "8"],
);
assert.deepEqual(
  sa.solutions.map((s) => s.id),
  qa.headings.map((q) => q.id),
);
await mkdir("tmp", { recursive: true });
await mkdir("output", { recursive: true });
const lock = await open("tmp/ai-helper.lock", "wx").catch(() => {
  throw new Error("Close the helper before running this evaluation.");
});
try {
  if (!process.env.OPENAI_API_KEY) throw new Error("API key missing.");
  const matcher = await createMatcher({
    apiKey: process.env.OPENAI_API_KEY,
    ledgerPath: "tmp/ai-usage.json",
  });
  const before = matcher.usage(),
    results = [];
  for (const question of qa.headings) {
    console.log(`Checking M116 question ${question.id} of 8`);
    assert.ok(!question.issue);
    const candidates = rankCandidates(question, sa.solutions);
    const expected = sa.solutions.find((s) => s.id === question.id)!;
    assert.ok(candidates.includes(expected));
    const started = Date.now();
    const result = await matcher.match(
      requestBody(question, candidates),
      new AbortController().signal,
    );
    const previous: Match = {
      id: question.id,
      questions: [question],
      solutions: [expected],
      status: "matched",
      reason: "Number",
    };
    results.push({
      question: question.id,
      correct: result.candidateKey === sourceKey(expected),
      confidence: result.confidence,
      status: applySuggestion(
        previous,
        question,
        result,
        candidates,
        question.id,
      ).status,
      questionCharacters: question.text?.length,
      solutionCharacters: expected.text?.length,
      solutionRegions: expected.regions.length,
      milliseconds: Date.now() - started,
    });
  }
  const report = {
    results,
    passed: results.filter((r) => r.correct).length,
    total: results.length,
    reviewCount: results.filter((r) => r.status !== "matched").length,
    costUSD: matcher.usage() - before,
    totalUsedUSD: matcher.usage(),
  };
  await writeFile(
    "output/ai-m116-evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Evaluation failed");
  process.exitCode = 1;
} finally {
  await lock.close();
  await unlink("tmp/ai-helper.lock");
}
