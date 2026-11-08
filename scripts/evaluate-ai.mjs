import { mkdir, open, unlink, writeFile } from "node:fs/promises";
import { createMatcher } from "../server/matching.mjs";

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
  const before = matcher.usage();
  const cases = [
    {
      question: "1. Explain how liquid water changes into vapor.",
      answers: [
        "1. Plants use sunlight to produce sugars.",
        "8. Evaporation occurs when molecules escape a liquid's surface.",
      ],
      expected: "s1",
    },
    {
      question: "2. Name the capital city of France.",
      answers: ["7. Paris.", "2. Madrid."],
      expected: "s0",
    },
    {
      question: "3. Differentiate x squared with respect to x.",
      answers: [
        "8. The derivative is 2x.",
        "3. The integral is x cubed divided by 3 plus a constant.",
      ],
      expected: "s0",
    },
    {
      question: "4. Explain the historical causes of the French Revolution.",
      answers: [
        "1. Photosynthesis stores light energy.",
        "2. Water evaporates when molecules escape.",
      ],
      expected: null,
    },
    {
      question: "5. Explain how plants convert light into chemical energy.",
      answers: [
        "5. Water moves across a membrane.",
        "9. Photosynthesis uses light to produce sugars.",
      ],
      expected: "s1",
    },
    {
      question: "6. Find the area of a rectangle with length 3 and width 4.",
      answers: ["6. For a rectangle of length 5 and width 4, the area is 20."],
      expected: null,
    },
  ];
  const results = [];
  for (const [i, item] of cases.entries()) {
    console.log(`Checking synthetic case ${i + 1} of ${cases.length}`);
    const body = {
      question: { key: `q${i}`, label: String(i + 1), text: item.question },
      candidates: item.answers.map((text, index) => ({
        key: `s${index}`,
        label: String(index + 1),
        text,
      })),
    };
    const result = await matcher.match(body, new AbortController().signal);
    results.push({
      case: i + 1,
      expected: item.expected,
      selected: result.candidateKey,
      confidence: result.confidence,
      correct: result.candidateKey === item.expected,
    });
  }
  const report = {
    results,
    passed: results.filter((r) => r.correct).length,
    total: cases.length,
    costUSD: matcher.usage() - before,
    totalUsedUSD: matcher.usage(),
  };
  await writeFile("output/ai-evaluation.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await lock.close();
  await unlink("tmp/ai-helper.lock");
}
