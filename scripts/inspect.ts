import fs from "node:fs/promises";
import { analyze } from "../src/parser";
import { matchDocuments } from "../src/matching";
import type { PageText } from "../src/model";
const q: PageText[] = JSON.parse(
  await fs.readFile("tmp/questions-raw.json", "utf8"),
);
const s: PageText[] = JSON.parse(
  await fs.readFile("tmp/solutions-raw.json", "utf8"),
);
const qa = analyze(q, "questions"),
  sa = analyze(s, "solutions"),
  matches = matchDocuments(qa.headings, sa.solutions);
const result = {
  questionPages: q.length,
  solutionPages: s.length,
  questions: qa.headings.length,
  solutions: sa.headings.length,
  counts: Object.fromEntries(
    ["matched", "missing", "ambiguous", "unsafe"].map((status) => [
      status,
      matches.filter((m) => m.status === status).length,
    ]),
  ),
  unmatched: matches.filter((m) => m.status !== "matched"),
  extraSolutions: sa.solutions
    .filter((s) => !qa.headings.some((q) => q.id === s.id))
    .map((s) => s.id),
  multiPage: sa.solutions
    .filter((s) => s.regions.length > 1)
    .map((s) => ({ id: s.id, pages: s.regions.map((r) => r.page) })),
  matches,
};
await fs.writeFile("tmp/analysis.json", JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    { ...result, matches: undefined, multiPage: result.multiPage.slice(0, 10) },
    null,
    2,
  ),
);
