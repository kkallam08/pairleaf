import type { Analysis, Heading, PageText, Solution, TextSpan } from "./model";

const identifier =
  /^(?:(?:Problem|Question|Solution)\s+)?(\d+(?:\.\d+){2,})(?:[.)])?(?=\s|$)/i;
const ordinaryIdentifier =
  /^(?:(?:Problem|Question|Solution)\s+(\d+(?:\.\d+)*)[.)]?|(\d+(?:\.\d+)*)(?:[.)]))(?=\s|$)/i;
export function extractIdentifier(text: string): string | undefined {
  return text.trim().match(identifier)?.[1];
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 11;
function lineAt(page: PageText, span: TextSpan) {
  return page.items
    .filter((i) => Math.abs(i.baseline - span.baseline) < 2.5)
    .sort((a, b) => a.x - b.x);
}
function isBody(page: PageText, item: TextSpan, top = page.height * 0.055) {
  return item.y >= top && item.bottom <= page.height * 0.95;
}
const lineText = (line: TextSpan[]) =>
  line
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
function bodyTops(pages: PageText[], bodySize: number) {
  const marginLines = new Map<string, Set<number>>();
  for (const p of pages) {
    const edge = p.height * 0.055;
    for (const i of p.items.filter((i) => i.y < edge && i.bottom > edge)) {
      const key = lineText(lineAt(p, i));
      const occurrences = marginLines.get(key) ?? new Set<number>();
      occurrences.add(p.page);
      marginLines.set(key, occurrences);
    }
  }
  return new Map(
    pages.map((p) => {
      const edge = p.height * 0.055;
      let top = edge;
      for (const i of p.items.filter((i) => i.y < edge && i.bottom > edge)) {
        const line = lineAt(p, i);
        const text = lineText(line);
        const left = Math.min(...line.map((j) => j.x));
        // Expand only for body-sized prose that flows into the next body line.
        // A repeated margin line is still a running header, not a question.
        if (
          text.length < 20 ||
          (marginLines.get(text)?.size ?? 0) > 1 ||
          left > p.width * 0.35 ||
          i.height < bodySize * 0.85 ||
          i.height > bodySize * 1.15 ||
          !p.items.some(
            (next) =>
              isBody(p, next) &&
              next.text.length > 15 &&
              next.baseline > i.baseline + 2.5 &&
              next.baseline - i.baseline <= bodySize * 1.8 &&
              Math.abs(next.x - left) <= bodySize * 2 &&
              next.height >= bodySize * 0.85 &&
              next.height <= bodySize * 1.15,
          )
        )
          continue;
        const firstY = Math.min(...line.map((j) => j.y));
        const previousBottom = Math.max(
          0,
          ...p.items.filter((j) => j.bottom <= firstY).map((j) => j.bottom),
        );
        const padding = Math.min(
          Math.max(7, i.height * 0.65),
          (firstY - previousBottom) / 2,
        );
        top = Math.min(top, firstY - padding);
      }
      return [p.page, top];
    }),
  );
}
function isContents(page: PageText) {
  return (
    page.items.some((i) =>
      /^Contents$|^Table of contents$/i.test(i.text.trim()),
    ) || page.items.filter((i) => /(?:\.\s*){5,}/.test(i.text)).length >= 3
  );
}
/** Find the whitespace just above a heading, expanding upward around tall math glyphs. */
function cropTop(page: PageText, span: TextSpan, bodyTop: number) {
  // TeX accent fonts can report zero ascent/descent. Leave room for vector arrows
  // above the normal text box, then expand around taller matrix delimiters.
  let cut = span.y - Math.max(7, span.height * 0.65);
  const body = page.items.filter((i) => isBody(page, i, bodyTop));
  for (let pass = 0; pass < 20; pass++) {
    const crossing = body.filter((i) => i.y < cut && i.bottom > cut);
    if (!crossing.length) break;
    const top = Math.min(...crossing.map((i) => i.y));
    const previousBottom = Math.max(
      bodyTop,
      ...body.filter((i) => i.bottom <= top).map((i) => i.bottom),
    );
    // A fixed pad can cross a narrow gap and pull in the preceding question.
    // Keep the edge inside the actual whitespace above the intersecting glyphs.
    const padding = Math.min(2, (top - previousBottom) / 2);
    const next = Math.min(cut, top - padding);
    if (next === cut) break;
    cut = next;
  }
  return Math.max(bodyTop, cut);
}
interface Marker {
  page: number;
  y: number;
  top: number;
  section?: string;
  problems: boolean;
}

/** Single-column layout with numbered headings in a consistent left label lane. */
export function analyze(
  pages: PageText[],
  role: "questions" | "solutions",
): Analysis {
  const pagesByNumber = new Map(pages.map((page) => [page.page, page]));
  const bodySize = median(
    pages.flatMap((p) =>
      p.items
        .filter((i) => i.text.length > 20 && isBody(p, i))
        .map((i) => i.height),
    ),
  );
  const tops = bodyTops(pages, bodySize);
  const inBody = (p: PageText, i: TextSpan) => isBody(p, i, tops.get(p.page)!);
  const dotted = pages.some((p) =>
    p.items.some((i) => inBody(p, i) && identifier.test(i.text.trim())),
  );
  const candidates: { p: PageText; i: TextSpan; id: string }[] = [];
  const markers: Marker[] = [];
  let context = "";
  let chapter = "";
  for (const p of pages) {
    if (isContents(p)) continue;
    for (const i of p.items) {
      const section = i.text
        .trim()
        .match(
          /^(Chapter|Section|Exercise|Review set)\s+(\d+[A-Za-z]?(?:\.\d+)*|[A-Z])(?:\s|$)/i,
        );
      if (!dotted && section) {
        const label = `${section[1].toLowerCase()} ${section[2].toUpperCase()}`;
        if (section[1].toLowerCase() === "chapter") {
          if (chapter !== label) context = label;
          chapter = label;
        } else context = chapter ? `${chapter} / ${label}` : label;
      }
      if (!inBody(p, i)) continue;
      const problemSection = i.text.match(
        /^(?:Section\s+)?(\d+(?:\.\d+)+)\s+(?:Problems|Exercises)\b/i,
      );
      const structural =
        i.height > bodySize * 1.17 &&
        /^(?:\d+(?:\.\d+)*\s|\d+(?:\.\d+)*$|Chapter\b|Appendix\b|Solutions to\b|References\b|Index$)/i.test(
          i.text.trim(),
        );
      if (problemSection || structural || (!dotted && section))
        markers.push({
          page: p.page,
          y: i.y,
          top: cropTop(p, i, tops.get(p.page)!),
          section: problemSection?.[1],
          problems: !!problemSection,
        });
      const ordinary = i.text.trim().match(ordinaryIdentifier);
      const label = dotted
        ? extractIdentifier(i.text)
        : (ordinary?.[1] ?? ordinary?.[2]);
      const id = label && context ? `${context} / ${label}` : label;
      if (!id || i.height > bodySize * 1.15) continue;
      const line = lineAt(p, i);
      if (
        line.some((j) => j.x < i.x - 3) ||
        /(?:\.\s*){5,}/.test(line.map((j) => j.text).join(" "))
      )
        continue;
      // A wrapped reference can start a line; these continuations are never headings.
      if (
        /^\s*(?:that|gives?|shows?|as|respectively|and|is indeed|are systems)\b/.test(
          i.text.replace(dotted ? identifier : ordinaryIdentifier, ""),
        )
      )
        continue;
      candidates.push({ p, i, id });
    }
  }
  // Infer the label lane from the document itself, tolerating wider two/three-digit labels.
  const lanes = new Map<number, number>();
  for (const c of candidates) {
    const lane = Math.round(c.i.x / 16) * 16;
    lanes.set(lane, (lanes.get(lane) ?? 0) + 1);
  }
  const lane = [...lanes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const hasProblemSections =
    role === "questions" && markers.some((m) => m.problems);
  markers.sort((a, b) => a.page - b.page || a.y - b.y);
  const headings: Heading[] = [];
  for (const { p, i, id } of candidates) {
    if (lane === undefined || Math.abs(i.x - lane) > 20 || i.x > p.width * 0.35)
      continue;
    if (hasProblemSections) {
      const preceding = markers
        .filter((m) => m.page < p.page || (m.page === p.page && m.y < i.y))
        .at(-1);
      if (
        !preceding?.problems ||
        id.slice(0, id.lastIndexOf(".")) !== preceding.section
      )
        continue;
    }
    headings.push({
      id,
      page: p.page,
      x: i.x,
      y: i.y,
      top: cropTop(p, i, tops.get(p.page)!),
    });
  }
  headings.sort((a, b) => a.page - b.page || a.y - b.y);
  const warnings: string[] = [];
  if (!headings.length)
    warnings.push(
      "No supported problem headings found. Use selectable-text, single-column PDFs with numbered questions such as 1. or 1.1.1. Scanned PDFs need OCR, which is not included.",
    );
  if (role === "questions" && hasProblemSections)
    warnings.push(
      "Only end-of-section problem lists are included. In-section exercises, examples, and definitions are excluded.",
    );
  const solutions: Solution[] =
    headings.length > 0
      ? headings.map((h, index) => {
          const next = headings[index + 1];
          const structure = markers.find(
            (m) =>
              (m.page > h.page || (m.page === h.page && m.y > h.y)) &&
              (!next ||
                m.page < next.page ||
                (m.page === next.page && m.y < next.y)),
          );
          const end =
            structure ??
            (next ? { page: next.page, top: next.top } : undefined);
          const lastPage = end?.page ?? pages.at(-1)!.page;
          const solution: Solution = { ...h, regions: [] };
          if (
            candidates.some(
              (candidate) =>
                candidate.p.page === h.page &&
                candidate.i.x > candidate.p.width * 0.45,
            )
          ) {
            solution.issue =
              "Multiple numbered columns need source-layout review.";
            return solution;
          }
          if (lastPage - h.page > 12) {
            solution.issue =
              "Boundary spans more than 12 pages; review the source PDF.";
            return solution;
          }
          for (let n = h.page; n <= lastPage; n++) {
            const p = pagesByNumber.get(n);
            if (!p) {
              solution.issue = "A page could not be read.";
              break;
            }
            // Without an explicit neighboring heading, preserve the page edge:
            // diagrams can extend beyond text margins without extracted glyphs.
            // Running headers/footers are preferable to clipped source content.
            const start = n === h.page ? h.top : 0;
            const stop = end && n === end.page ? end.top : p.height;
            if (stop <= start) continue;
            if (p.textlessGraphics) {
              solution.issue =
                "A textless graphic page interrupts this solution. Its boundaries need review in the source PDF.";
              break;
            }
            // A bounded region may contain drawing operators but no text. Keep
            // it even when that also retains a blank strip before the next label.
            // Trim horizontal paper margins only; all diagrams/equations within the body stay original.
            solution.regions.push({
              page: n,
              x: Math.max(0, h.x - 12),
              y: start,
              width: p.width - Math.max(0, h.x - 12) - 24,
              height: stop - start,
            });
          }
          if (
            !solution.regions.length ||
            (next && next.page === h.page && next.top <= h.y)
          )
            solution.issue =
              "Could not separate this solution from its neighbor.";
          // Without a next heading, only a finite document end is accepted. No page is opened unbounded.
          return solution;
        })
      : [];
  for (const [index, heading] of headings.entries()) {
    const block = solutions[index];
    heading.regions = block.regions;
    heading.issue = block.issue;
    heading.text = block.regions
      .map((region) =>
        pagesByNumber
          .get(region.page)!
          .items.filter(
            (item) =>
              item.bottom > region.y && item.y < region.y + region.height,
          )
          .map((item) => item.text)
          .join(" "),
      )
      .join("\n");
    block.text = heading.text;
  }
  return {
    headings,
    solutions: role === "solutions" ? solutions : [],
    warnings,
  };
}
