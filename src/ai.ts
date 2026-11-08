import type { Heading, Match, Solution } from "./model";

export const sourceKey = (source: Heading) =>
  `${source.page}:${source.y.toFixed(2)}:${source.id}`;
export interface AiResult {
  candidateKey: string | null;
  confidence: "supported" | "uncertain" | "none";
  evidence: string;
  usedUSD: number;
}
const terms = (text: string) =>
  new Set(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
export function rankCandidates(question: Heading, solutions: Solution[]) {
  const words = terms(question.text ?? "");
  const candidates = solutions.filter(
    (s) => !s.issue && s.regions.length && s.text?.trim(),
  );
  const frequencies = new Map<string, number>();
  const vocabularies = candidates.map((s) => terms(s.text!));
  for (const vocabulary of vocabularies)
    for (const word of vocabulary)
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  return candidates
    .map((source, index) => ({
      source,
      score: [...words].reduce(
        (score, word) =>
          score +
          (vocabularies[index].has(word)
            ? Math.log(1 + candidates.length / frequencies.get(word)!)
            : 0),
        source.id === question.id ? 2 : 0,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.source);
}
export function requestBody(question: Heading, candidates: Solution[]) {
  const excerpt = (source: Heading) => ({
    key: sourceKey(source),
    label: source.id,
    text:
      (source.text ?? "").slice(0, 11950) +
      ((source.text?.length ?? 0) > 11950
        ? "\n[Excerpt shortened; correspondence needs review.]"
        : ""),
  });
  return { question: excerpt(question), candidates: candidates.map(excerpt) };
}
export async function checkQuestion(
  question: Heading,
  candidates: Solution[],
  code: string,
  signal: AbortSignal,
): Promise<AiResult> {
  const response = await fetch("http://127.0.0.1:5182/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${code}`,
    },
    body: JSON.stringify(requestBody(question, candidates)),
    signal,
  }).catch((error) => {
    if (signal.aborted) throw error;
    throw new Error(
      "Start the local helper with npm run ai, then enter its connection code.",
    );
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "AI check failed.");
  if (
    !["supported", "uncertain", "none"].includes(result.confidence) ||
    typeof result.evidence !== "string" ||
    (result.candidateKey !== null &&
      !candidates.some((s) => sourceKey(s) === result.candidateKey))
  )
    throw new Error("AI returned an unknown source. No matches were changed.");
  return result;
}
export function applySuggestion(
  previous: Match,
  question: Heading,
  result: AiResult,
  candidates: Solution[],
  displayId: string,
): Match {
  const selected = candidates.find((s) => sourceKey(s) === result.candidateKey);
  const same =
    previous.status === "matched" &&
    previous.solutions.length === 1 &&
    selected &&
    sourceKey(previous.solutions[0]) === sourceKey(selected);
  const complete =
    (question.text?.length ?? 0) <= 11950 &&
    (selected?.text?.length ?? 0) <= 11950;
  return {
    id: displayId,
    questions: [question],
    solutions: selected ? [selected] : [],
    status: selected
      ? same && result.confidence === "supported" && complete
        ? "matched"
        : "suggested"
      : "missing",
    reason: result.evidence,
    aiChecked: true,
    confirmed: Boolean(
      same &&
      previous.confirmed &&
      result.confidence === "supported" &&
      complete,
    ),
  };
}

export async function pairFingerprint(
  questionBytes: ArrayBuffer,
  solutionBytes: ArrayBuffer,
) {
  const hash = async (bytes: ArrayBuffer) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return `pairleaf-review-v1:${await hash(questionBytes)}:${await hash(solutionBytes)}`;
}
export function restoreChoices(
  matches: Match[],
  solutions: Solution[],
  saved: unknown,
): Match[] {
  if (!saved || typeof saved !== "object") return matches;
  return matches.flatMap((match) => {
    const hasChoice = match.questions.some((q) =>
      Object.hasOwn(saved, sourceKey(q)),
    );
    if (!hasChoice) return [match];
    return match.questions.map((question, index) => {
      const value = (saved as Record<string, unknown>)[sourceKey(question)];
      const chosen = solutions.find((s) => sourceKey(s) === value && !s.issue);
      if ((!chosen && value !== null) || question.issue)
        return {
          ...match,
          questions: [question],
          id:
            match.questions.length > 1
              ? `${match.id} (${index + 1})`
              : match.id,
        };
      return {
        ...match,
        id:
          match.questions.length > 1 ? `${match.id} (${index + 1})` : match.id,
        questions: [question],
        solutions: chosen ? [chosen] : [],
        status: chosen ? ("matched" as const) : ("missing" as const),
        reason: "Your saved choice",
        confirmed: true,
      };
    });
  });
}
