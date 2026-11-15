import { describe, expect, it } from "vitest";
import { analyzeOcr } from "../experiments/ocr-layout";
import { abortable } from "../experiments/ocr-abort";
import { matchDocuments } from "../src/matching";
import type { PageText, TextSpan } from "../src/model";

function word(
  text: string,
  x: number,
  y: number,
  line: number,
  coloredLabel = false,
): TextSpan {
  return {
    text,
    x,
    y,
    width: text.length * 8,
    height: 16,
    bottom: y + 16,
    baseline: y + 16,
    line,
    coloredLabel,
    font: "ocr",
  };
}
function page(left: TextSpan[], right: TextSpan[] = [], n = 1): PageText {
  return {
    page: n,
    width: 1000,
    height: 1000,
    items: [...left, ...right],
    ocrColumns: [
      { x: 0, width: 500, labelX: 30, labelTolerance: 20, items: left },
      { x: 500, width: 500, labelX: 530, labelTolerance: 20, items: right },
    ],
  };
}
describe("OCR layout", () => {
  it("carries an original answer into the next column and excludes graph numbers", () => {
    const result = analyzeOcr(
      [
        page(
          [
            word("EXERCISE 1B", 30, 600, 1),
            word("1", 30, 650, 2, true),
            word("1", 250, 700, 3, true),
          ],
          [
            word("graph continuation", 570, 80, 1),
            word("2", 530, 300, 2, true),
          ],
        ),
      ],
      "solutions",
    );
    expect(result.solutions.map((s) => s.id)).toEqual([
      "exercise 1B / 1",
      "exercise 1B / 2",
    ]);
    expect(result.solutions[0].regions).toHaveLength(2);
    expect(result.solutions[0].regions[1].x).toBeGreaterThan(500);
    expect(
      result.solutions[0].regions[1].y + result.solutions[0].regions[1].height,
    ).toBeLessThan(300);
  });
  it("separates two answers printed on the same row", () => {
    const { solutions } = analyzeOcr(
      [
        page([
          word("EXERCISE 2A", 30, 100, 1),
          word("18", 30, 200, 2, true),
          word("19", 300, 200, 2, true),
        ]),
      ],
      "solutions",
    );
    expect(solutions).toHaveLength(2);
    const a = solutions[0].regions[0],
      b = solutions[1].regions[0];
    expect(a.x + a.width).toBe(b.x);
    expect(a.y).toBe(b.y);
  });
  it("keeps exercise context across pages and distinguishes repeated numbers", () => {
    const { solutions } = analyzeOcr(
      [
        page([word("EXERCISE 1A", 30, 100, 1), word("1", 30, 200, 2, true)]),
        page(
          [
            word("2", 30, 100, 1, true),
            word("EXERCISE 1B", 30, 300, 2),
            word("1", 30, 400, 3, true),
          ],
          [],
          2,
        ),
      ],
      "solutions",
    );
    expect(solutions.map((s) => s.id)).toEqual([
      "exercise 1A / 1",
      "exercise 1A / 2",
      "exercise 1B / 1",
    ]);
    expect(solutions[0].regions.some((r) => r.page === 2)).toBe(true);
  });
  it("flags the preceding source when a number is skipped", () => {
    const { solutions } = analyzeOcr(
      [
        page([
          word("EXERCISE 1A", 30, 100, 1),
          word("1", 30, 200, 2, true),
          word("3", 30, 400, 3, true),
        ]),
      ],
      "solutions",
    );
    expect(matchDocuments([solutions[0]], solutions)[0].status).toBe("unsafe");
  });
  it("uses visual whitespace boundaries to retain fraction numerators and denominators", () => {
    const first = { ...word("1", 30, 200, 2, true), boundaryTop: 185 };
    const next = { ...word("2", 30, 240, 3, true), boundaryTop: 237 };
    const { solutions } = analyzeOcr(
      [page([word("EXERCISE 1A", 30, 100, 1), first, next])],
      "solutions",
    );
    expect(solutions[0].regions[0].y).toBe(185);
    expect(solutions[0].regions[0].height).toBe(52);
  });
});
describe("OCR cancellation", () => {
  it("releases a wait even when the terminated worker never settles its job", async () => {
    const controller = new AbortController();
    const pending = abortable(new Promise<never>(() => {}), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("handles cancellation before startup and ordinary successful work", async () => {
    await expect(
      abortable(Promise.resolve(42), new AbortController().signal),
    ).resolves.toBe(42);
    const controller = new AbortController();
    controller.abort();
    await expect(
      abortable(new Promise<never>(() => {}), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
