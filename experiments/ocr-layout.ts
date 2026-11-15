import type { Analysis, PageText, Solution, TextSpan } from "../src/model";

interface Event {
  y: number;
  x: number;
  label?: string;
  exercise?: string;
  stop?: boolean;
}

export function analyzeOcr(
  pages: PageText[],
  role: "questions" | "solutions",
): Analysis {
  const sources: Solution[] = [];
  let exercise = "",
    active: Solution | undefined;
  for (const page of pages)
    for (const column of page.ocrColumns ?? []) {
      const top = page.height * 0.055,
        bottom = page.height * 0.96;
      const words = column.items.filter((w) => w.y >= top && w.bottom < bottom);
      const lines = new Map<number, TextSpan[]>();
      for (const word of words)
        lines.set(word.line!, [...(lines.get(word.line!) ?? []), word]);
      const events: Event[] = [];
      for (const line of lines.values()) {
        const text = line.map((w) => w.text).join(" ");
        const heading = text.match(/\bEXERCISE\s+(\d+)\s*([A-Z])\b/i);
        if (heading)
          events.push({
            x: line[0].x,
            y: Math.min(...line.map((w) => w.y)) - 3,
            exercise: `exercise ${heading[1]}${heading[2].toUpperCase()}`,
          });
        else if (
          role === "questions" &&
          /^(?:Example\s+\d|[A-Z]\s+[A-Z]|Review\s+(?:set|exercise)|Chapter\s+\d)/i.test(
            text,
          )
        )
          events.push({ x: line[0].x, y: line[0].y - 3, stop: true });
      }
      const labels = words.filter(
        (w) => w.coloredLabel && /^\d{1,3}[.)]?$/.test(w.text),
      );
      const labelX = column.labelX ?? Math.min(...labels.map((w) => w.x));
      const tolerance = column.labelTolerance ?? column.width * 0.035;
      const marginLabels = labels.filter(
        (w) => Math.abs(w.x - labelX) <= tolerance,
      );
      for (const word of labels) {
        // The printed-textbook profile uses colored integer labels to avoid
        // treating graph coordinates, coefficients and subparts as questions.
        if (
          !marginLabels.includes(word) &&
          !marginLabels.some(
            (w) =>
              Math.abs(w.y - word.y) < 4 &&
              Number(word.text) === Number(w.text) + 1,
          )
        )
          continue;
        const text = word.text.replace(/[.)]$/, "");
        if (/^\d{1,3}$/.test(text))
          events.push({
            x: word.x,
            y: word.boundaryTop ?? word.y - word.height * 0.65 - 3,
            label: text,
          });
      }
      events.sort((a, b) => (Math.abs(a.y - b.y) < 4 ? a.x - b.x : a.y - b.y));
      let start = top,
        left = column.x + 8;
      const right = column.x + column.width - 8;
      const addRegion = (stop: number, edge = right) => {
        if (!active || stop <= start || edge <= left) return;
        active.regions.push({
          page: page.page,
          x: left,
          y: start,
          width: edge - left,
          height: stop - start,
        });
        active.text =
          (active.text ?? "") +
          "\n" +
          words
            .filter(
              (w) => w.y >= start && w.y < stop && w.x >= left && w.x < edge,
            )
            .map((w) => w.text)
            .join(" ");
      };
      for (const [i, event] of events.entries()) {
        if (
          active &&
          event.label &&
          Number(event.label) !== Number(active.id.split(" / ")[1]) + 1
        )
          active.issue =
            "OCR may have missed a question boundary. Review the original page.";
        addRegion(event.y);
        active = undefined;
        start = event.y;
        left = column.x + 8;
        if (event.exercise) {
          exercise = event.exercise;
          continue;
        }
        if (event.stop || !exercise || !event.label) continue;
        active = {
          id: `${exercise} / ${event.label}`,
          page: page.page,
          x: event.x,
          y: event.y + 3,
          top: event.y,
          regions: [],
          text: "",
        };
        sources.push(active);
        const next = events[i + 1];
        if (next?.label && Math.abs(next.y - event.y) < 4) {
          const below = events.slice(i + 2).find((e) => e.y > event.y + 4);
          addRegion(below?.y ?? bottom, next.x - 4);
          active = undefined;
        } else if (i > 0 && Math.abs(events[i - 1].y - event.y) < 4)
          left = event.x - 4;
      }
      addRegion(bottom);
    }
  for (const source of sources)
    if (!source.regions.length)
      source.issue =
        "OCR could not bound this source. Review the original page.";
  return {
    headings: sources,
    solutions: role === "solutions" ? sources : [],
    warnings: sources.length
      ? [
          "OCR reads printed exercise headings and blue question numbers. Check source crops before confirming.",
        ]
      : [
          "No supported OCR headings found. Include the exercise heading and use the correct column count. This profile expects blue question numbers.",
        ],
  };
}
