import type { Heading, Match, Solution } from "./model";
export function matchDocuments(
  questions: Heading[],
  solutions: Solution[],
): Match[] {
  const q = new Map<string, Heading[]>(),
    s = new Map<string, Solution[]>();
  for (const h of questions) q.set(h.id, [...(q.get(h.id) ?? []), h]);
  for (const h of solutions) s.set(h.id, [...(s.get(h.id) ?? []), h]);
  return [...q].map(([id, questions]) => {
    const candidates = s.get(id) ?? [];
    const status =
      questions.length > 1 || candidates.length > 1
        ? "ambiguous"
        : questions[0].issue
          ? "unsafe"
          : !candidates.length
            ? "missing"
            : candidates[0].issue
              ? "unsafe"
              : "matched";
    const reason =
      status === "ambiguous"
        ? `Duplicate identifier: ${questions.length} question headings, ${candidates.length} solution headings.`
        : status === "missing"
          ? "No solution heading with this identifier."
          : status === "unsafe"
            ? (questions[0].issue ?? candidates[0].issue!)
            : "Ready to reveal";
    return { id, questions, solutions: candidates, status, reason };
  });
}
