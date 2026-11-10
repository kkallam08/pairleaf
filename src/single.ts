import type { PageText } from "./model";

export interface AnswerRange {
  start: number;
  end: number;
}

// Standalone headings avoid prose references and dotted table-of-contents entries.
const answerTitle =
  /^(?:(?:selected|suggested|worked)\s+)?(?:answers?|solutions?)(?:\s+(?:and\s+solutions|key|to\s+(?:(?:the|selected|all)\s+)?(?:exercises|questions|problems)(?:\s+and\s+(?:exercises|questions|problems))?))?\s*[:.]?$/i;
const endTitle =
  /^(?:index|glossary|bibliography|references|acknowledg(?:e)?ments)\s*$/i;

function titles(page: PageText) {
  if (
    page.items.some((item) =>
      /^(?:table of )?contents$/i.test(item.text.trim()),
    )
  )
    return [];
  const lines = new Map<number, string[]>();
  for (const item of [...page.items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (item.y > page.height * 0.45) continue;
    const baseline = Math.round(item.baseline / 3) * 3;
    const parts = lines.get(baseline) ?? [];
    parts.push(item.text.trim());
    lines.set(baseline, parts);
  }
  return [...lines.values()].map((parts) =>
    parts.join(" ").replace(/\s+/g, " ").trim(),
  );
}

export function detectAnswerRange(pages: PageText[]): AnswerRange | undefined {
  const candidates = pages.filter(
    (page) =>
      page.page > 1 && titles(page).some((text) => answerTitle.test(text)),
  );
  // A single contiguous answer section is supported. Prefer back matter when
  // several sections exist, and always let the reader correct the proposal.
  const startPage =
    candidates.find((page) => page.page > pages.length / 2) ?? candidates[0];
  if (!startPage) return undefined;
  const ending = pages.find(
    (page) =>
      page.page > startPage.page &&
      titles(page).some((text) => endTitle.test(text)),
  );
  return {
    start: startPage.page,
    end: ending ? ending.page - 1 : pages.at(-1)!.page,
  };
}

export function validateAnswerRange(
  range: AnswerRange,
  pageCount: number,
): string | undefined {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end))
    return "Enter whole PDF page numbers.";
  if (range.start < 2 || range.end > pageCount || range.start > range.end)
    return `Choose answer pages from 2 to ${pageCount}, with the last page at or after the first.`;
  return undefined;
}
