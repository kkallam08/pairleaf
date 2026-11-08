import { describe, expect, it } from "vitest";
import { analyze } from "../src/parser";
import {
  applySuggestion,
  rankCandidates,
  restoreChoices,
  sourceKey,
} from "../src/ai";
import type { PageText, Match, Solution } from "../src/model";
const page = (lines: string[]): PageText => ({
  page: 1,
  width: 612,
  height: 792,
  items: lines.map((text, i) => ({
    text,
    x: 72,
    y: 100 + i * 80,
    bottom: 111 + i * 80,
    baseline: 109 + i * 80,
    width: 350,
    height: 11,
    font: "test",
  })),
});
describe("AI source matching", () => {
  it("extracts integer questions, preserves subparts and distinguishes exercise context", () => {
    const result = analyze(
      [
        page([
          "Exercise 1A",
          "1. Describe the process.",
          "(a) Include an example.",
          "Exercise 1B",
          "1. Explain the result.",
        ]),
      ],
      "questions",
    );
    expect(result.headings.map((h) => h.id)).toEqual([
      "exercise 1A / 1",
      "exercise 1B / 1",
    ]);
    expect(result.headings[0].text).toContain("Include an example");
    expect(result.headings[0].text).not.toContain("Explain the result");
  });
  const solutions = analyze(
    [
      page([
        "8. Plants convert sunlight into stored chemical energy.",
        "2. Water evaporates into vapor.",
      ]),
    ],
    "solutions",
  ).solutions;
  const question = analyze(
    [page(["2. Describe how plants use sunlight."])],
    "questions",
  ).headings[0];
  const previous: Match = {
    id: "2",
    questions: [question],
    solutions: [solutions[1]],
    status: "matched",
    reason: "Number",
  };
  it("ranks content and turns a contradicted number match into a suggestion", () => {
    expect(rankCandidates(question, solutions)[0].id).toBe("8");
    const result = applySuggestion(
      previous,
      question,
      {
        candidateKey: sourceKey(solutions[0]),
        confidence: "supported",
        evidence: "Same biological process",
        usedUSD: 0,
      },
      solutions,
      "2",
    );
    expect(result.status).toBe("suggested");
    expect(result.solutions[0].id).toBe("8");
    expect(result.confirmed).toBe(false);
  });
  it("requires review for uncertain agreement and removes unsupported assignments", () => {
    const shortened = applySuggestion(
      { ...previous, confirmed: true },
      { ...question, text: "x".repeat(12001) },
      {
        candidateKey: sourceKey(solutions[1]),
        confidence: "supported",
        evidence: "Same topic",
        usedUSD: 0,
      },
      solutions,
      "2",
    );
    expect(shortened.status).toBe("suggested");
    expect(shortened.confirmed).toBe(false);
    expect(
      applySuggestion(
        previous,
        question,
        {
          candidateKey: sourceKey(solutions[1]),
          confidence: "uncertain",
          evidence: "Insufficient detail",
          usedUSD: 0,
        },
        solutions,
        "2",
      ).status,
    ).toBe("suggested");
    expect(
      applySuggestion(
        previous,
        question,
        {
          candidateKey: null,
          confidence: "none",
          evidence: "No corresponding task",
          usedUSD: 0,
        },
        solutions,
        "2",
      ).solutions,
    ).toEqual([]);
  });
  it("restores only existing safe source choices", () => {
    expect(
      restoreChoices([previous], solutions, {
        [sourceKey(question)]: sourceKey(solutions[0]),
      })[0].confirmed,
    ).toBe(true);
    expect(
      restoreChoices([previous], solutions, {
        [sourceKey(question)]: "invented",
      })[0],
    ).toEqual(previous);
    const unsafe: Solution = { ...solutions[0], issue: "Overlapping bounds" };
    expect(
      restoreChoices([previous], [unsafe], {
        [sourceKey(question)]: sourceKey(unsafe),
      })[0].confirmed,
    ).not.toBe(true);
  });
});
