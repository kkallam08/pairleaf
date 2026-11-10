import { describe, it, expect } from "vitest";
import { detectAnswerRange, validateAnswerRange } from "../src/single";
import { analyze } from "../src/parser";
import { matchDocuments } from "../src/matching";
import type { PageText } from "../src/model";

function page(n: number, lines: string[]): PageText {
  return {
    page: n,
    width: 612,
    height: 792,
    items: lines.map((text, i) => ({
      text,
      x: 72,
      y: 70 + i * 50,
      bottom: 81 + i * 50,
      baseline: 79 + i * 50,
      width: 300,
      height: 11,
      font: "test",
    })),
  };
}
describe("single PDF answer sections", () => {
  it("ignores contents references and bounds answers before an index", () => {
    const pages = [
      page(1, ["Contents", "Answers ..... 4"]),
      page(2, ["Exercise 1", "1. Explain evaporation."]),
      page(3, ["Questions continued"]),
      page(4, [
        "Answers to exercises",
        "Exercise 1",
        "1. Water becomes vapor.",
      ]),
      page(5, ["Continued explanation"]),
      page(6, ["Index"]),
    ];
    expect(detectAnswerRange(pages)).toEqual({ start: 4, end: 5 });
    const solutions = analyze(pages.slice(3, 5), "solutions").solutions;
    expect(solutions[0].regions.map((r) => r.page)).toEqual([4, 5]);
    expect(solutions[0].text).toContain("Continued explanation");
    expect(solutions[0].issue).toBeUndefined();
  });
  it("leaves absent headings for manual correction and validates ranges", () => {
    expect(
      detectAnswerRange([page(1, ["1. Question"]), page(2, ["1. Answer"])]),
    ).toBeUndefined();
    for (const range of [
      { start: 1, end: 2 },
      { start: 3, end: 2 },
      { start: 2, end: 6 },
      { start: 2.5, end: 3 },
    ])
      expect(validateAnswerRange(range, 5)).toBeTruthy();
    expect(validateAnswerRange({ start: 2, end: 5 }, 5)).toBeUndefined();
  });
  it("distinguishes exercises repeated across chapters and keeps original page numbers", () => {
    const questions = analyze(
      [
        page(1, ["Chapter 1", "Exercise A", "1. Describe water."]),
        page(2, ["Chapter 2", "Exercise A", "1. Describe light."]),
      ],
      "questions",
    );
    const answers = analyze(
      [
        page(4, ["Answers", "Chapter 1", "Exercise A", "1. Water answer."]),
        page(5, ["Chapter 2", "Exercise A", "1. Light answer."]),
      ],
      "solutions",
    );
    const matches = matchDocuments(questions.headings, answers.solutions);
    expect(matches.map((m) => m.status)).toEqual(["matched", "matched"]);
    expect(matches.map((m) => m.solutions[0].page)).toEqual([4, 5]);
    expect(answers.solutions[0].text).not.toContain("Chapter 2");
  });
});
