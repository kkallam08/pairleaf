import type { Heading, Match, Solution } from "./model";

export const sourceKey = (source: Heading) =>
  `${source.page}:${source.y.toFixed(2)}:${source.id}`;

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
  const reviewable = splitForReview(matches);
  if (!saved || typeof saved !== "object") return reviewable;
  return reviewable.map((match) => {
    const question = match.questions[0];
    if (question.issue || !Object.hasOwn(saved, sourceKey(question)))
      return match;
    const value = (saved as Record<string, unknown>)[sourceKey(question)];
    const chosen = solutions.find((s) => sourceKey(s) === value && !s.issue);
    if (!chosen && value !== null) return match;
    return {
      ...match,
      solutions: chosen ? [chosen] : [],
      status: chosen ? ("matched" as const) : ("missing" as const),
      reason: "Your saved choice",
      confirmed: true,
    };
  });
}

/** Keep repeated labels unresolved, but allow each question to be reviewed locally. */
export function splitForReview(matches: Match[]): Match[] {
  return matches.flatMap((match) =>
    match.questions.length === 1
      ? [
          match.questions[0].issue &&
          (match.status !== "unsafe" ||
            match.confirmed !== false ||
            match.reason !== match.questions[0].issue)
            ? {
                ...match,
                status: "unsafe" as const,
                reason: match.questions[0].issue,
                confirmed: false,
              }
            : match,
        ]
      : match.questions.map((question, index) => ({
          ...match,
          id: match.id + " (" + (index + 1) + ")",
          questions: [question],
          status: question.issue ? ("unsafe" as const) : ("ambiguous" as const),
          reason: question.issue ?? match.reason,
          confirmed: false,
        })),
  );
}
