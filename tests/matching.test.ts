import { describe, it, expect } from "vitest";
import { analyze, extractIdentifier } from "../src/parser";
import { matchDocuments } from "../src/matching";
import type { PageText, TextSpan } from "../src/model";
function span(text: string, y: number, x = 72, height = 11): TextSpan {
  return {
    text,
    x,
    y,
    bottom: y + height,
    baseline: y + height * 0.8,
    height,
    width: text.length * 5,
    font: "body",
  };
}
function page(items: TextSpan[], n = 1): PageText {
  return { page: n, width: 612, height: 792, items };
}
const sentence = "This is a normal line of synthetic body text.";
describe("identifier and heading extraction", () => {
  it("accepts explicit dotted identifiers and optional punctuation or labels", () => {
    expect(
      [
        "1.1.1 Let x be 2.",
        "12.4.16. Compute x.",
        "Problem 3.2.1 (a) Evaluate",
        "1.2.30",
      ].map(extractIdentifier),
    ).toEqual(["1.1.1", "12.4.16", "3.2.1", "1.2.30"]);
    expect(extractIdentifier("See Problem 1.1.1 for details.")).toBeUndefined();
  });
  it("rejects inline and wrapped prose references, TOC entries and running headers", () => {
    const pages = [
      page([
        span("Contents", 60, 72, 18),
        span("1.2.3", 100),
        span(". . . . . . . . . . . 12", 100, 115),
      ]),
      page(
        [
          span("1.2.3", 24),
          span(sentence, 80),
          span("See", 120),
          span("1.2.3", 120, 110),
          span("1.2.3 gives the result.", 150),
          span("1.2.3. Compute a vector.", 210),
          span("1.2.4. Compute a matrix.", 310),
        ],
        2,
      ),
    ];
    expect(analyze(pages, "questions").headings.map((h) => h.id)).toEqual([
      "1.2.3",
      "1.2.4",
    ]);
  });
  it("uses end-of-section scope to exclude examples, exercises and numbered subsections", () => {
    const a = analyze(
      [
        page([
          span(sentence, 80),
          span("Example 1.1.1", 100),
          span("Exercise 1.1.2", 130),
          span("Section 1.1 Problems", 200, 72, 15),
          span("1.1.1. Compute a vector.", 240),
          span("1.1.2. Show that x = y.", 300),
          span("1.2 Next section", 400, 72, 15),
          span("1.2.1 A subsection", 450, 72, 14),
        ]),
      ],
      "questions",
    );
    expect(a.headings.map((h) => h.id)).toEqual(["1.1.1", "1.1.2"]);
  });
  it("reports scanned / textless documents as unsupported", () => {
    expect(analyze([page([])], "solutions").warnings[0]).toContain("Scanned");
  });
  it("recognizes a body-sized question whose wrapped first line crosses the top margin", () => {
    const a = analyze(
      [
        page([
          span("1. Explain the first observation.", 120, 54, 10.8),
          span(sentence, 150, 54, 10.8),
        ]),
        page(
          [
            span("2.", 36.17, 54, 10.8),
            span("Describe how the membrane changes when", 36.17, 65, 10.8),
            span("the surrounding temperature increases.", 48.17, 54, 10.8),
            span("3. Compare the two observations.", 160, 54, 10.8),
          ],
          2,
        ),
      ],
      "questions",
    );
    expect(a.headings.map((h) => h.id)).toEqual(["1", "2", "3"]);
    expect(a.headings[1].top).toBeLessThan(36.17);
    expect(a.headings[1].text).toContain("Describe how the membrane");
  });
  it("keeps repeated running headings outside the body even when they cross the margin", () => {
    const a = analyze(
      [1, 2].map((n) =>
        page(
          [
            span("1.2.3. Repeated chapter running header", 36),
            span(sentence, 50),
            span(`1.1.${n}. The actual exercise.`, 120),
          ],
          n,
        ),
      ),
      "questions",
    );
    expect(a.headings.map((h) => h.id)).toEqual(["1.1.1", "1.1.2"]);
  });
});
describe("matching safety", () => {
  it("keeps unsafe question bounds unresolved even with one safe answer", () => {
    const questions = analyze(
      Array.from({ length: 14 }, (_, index) =>
        page(
          [span(index ? sentence : "1.1.1. Describe this passage.", 100)],
          index + 1,
        ),
      ),
      "questions",
    );
    const answers = analyze(
      [page([span("1.1.1. The original answer.", 100)])],
      "solutions",
    );
    expect(questions.headings[0].issue).toContain("more than 12 pages");
    expect(answers.solutions[0].issue).toBeUndefined();
    const [match] = matchDocuments(questions.headings, answers.solutions);
    expect(match.status).toBe("unsafe");
    expect(match.reason).toBe(questions.headings[0].issue);
    expect(match.solutions).toEqual(answers.solutions);
  });
  it("never picks among duplicate question or solution identifiers", () => {
    const q = analyze(
      [
        page([
          span("1.1.1. First question.", 80),
          span("1.1.1. Another question.", 180),
          span("1.1.2. Third question.", 280),
        ]),
      ],
      "questions",
    );
    const s = analyze(
      [
        page([
          span("1.1.1. First answer.", 80),
          span("1.1.2. Second answer.", 180),
          span("1.1.2. Another answer.", 280),
        ]),
      ],
      "solutions",
    );
    expect(
      matchDocuments(q.headings, s.solutions).map((m) => m.status),
    ).toEqual(["ambiguous", "ambiguous"]);
  });
  it("reports a missing match without falling back to another solution", () => {
    const q = analyze(
      [
        page([
          span("1.1.1. A question.", 80),
          span("1.1.2. Another question.", 180),
        ]),
      ],
      "questions",
    );
    const s = analyze([page([span("1.1.1. An answer.", 80)])], "solutions");
    expect(
      matchDocuments(q.headings, s.solutions).map((m) => m.status),
    ).toEqual(["matched", "missing"]);
  });
});
describe("bounded original page regions", () => {
  it("includes complete continuation pages, including text near the top edge", () => {
    const a = analyze(
      [
        page([
          span("1. Explain the difference.", 620, 54, 10.8),
          span(sentence, 650, 54, 10.8),
        ]),
        page(
          [
            span("Running header", 20, 54, 10.8),
            span(
              "The first material has tightly packed molecules.",
              38.09,
              54,
              10.8,
            ),
            span("The second material contains larger gaps.", 52.01, 54, 10.8),
            span("2. The next original answer.", 90, 54, 10.8),
          ],
          2,
        ),
      ],
      "solutions",
    );
    const continuation = a.solutions[0].regions[1];
    expect(continuation.y).toBe(0);
    expect(a.solutions[0].text).toContain("The first material");
    expect(a.solutions[0].text).toContain("Running header");
  });
  it("retains page edges on continuations and excludes neighboring answers", () => {
    const a = analyze(
      [
        page([
          span("1.1.1. (a) First answer.", 600),
          span("(b) Continued below.", 700),
          span("1", 760),
        ]),
        page(
          [
            span("Section 1.1 Solutions", 24),
            span("(c) A continued matrix.", 60),
            span(sentence, 350),
          ],
          2,
        ),
        page(
          [
            span("Section 1.1 Solutions", 24),
            span("(d) Final part of answer.", 60),
            span("1.1.2. Next answer.", 180),
            span(sentence, 230),
            span("3", 760),
          ],
          3,
        ),
      ],
      "solutions",
    );
    const r = a.solutions[0].regions;
    expect(r.map((x) => x.page)).toEqual([1, 2, 3]);
    expect(r[0].y).toBeLessThan(600);
    expect(r[0].y + r[0].height).toBe(792);
    expect(r[1].y).toBe(0);
    expect(r[1].y + r[1].height).toBe(792);
    expect(r[2].y + r[2].height).toBeLessThan(180);
  });
  it("preserves a diagram extending below the usual text margin", () => {
    // A vector diagram need not appear in extracted text. This bottom matches
    // the near-page-edge molecular diagram that exposed the cropped answer.
    const diagramBottom = 779;
    const a = analyze(
      [
        page([span("1. Explain the molecular diagram below.", 515)]),
        page(
          [
            span("(a) The answer continues here.", 60),
            span("2. Next answer.", 180),
          ],
          2,
        ),
      ],
      "solutions",
    );
    const first = a.solutions[0].regions[0];
    expect(first.y).toBeLessThan(515);
    expect(first.y + first.height).toBeGreaterThanOrEqual(diagramBottom);
    expect(
      a.solutions[0].regions[1].y + a.solutions[0].regions[1].height,
    ).toBeLessThan(180);
    expect(a.solutions[0].text).not.toContain("Next answer.");
  });
  it("keeps a bounded diagram page whose only extracted text is a footer", () => {
    const a = analyze(
      [
        page([span("1. Explain the figure on the next page.", 600)]),
        page([span("2", 770)], 2),
        page([span("2. Next answer.", 100)], 3),
      ],
      "solutions",
    );
    const diagramPage = a.solutions[0].regions.find((r) => r.page === 2);
    expect(diagramPage).toBeDefined();
    expect(diagramPage!.y).toBe(0);
    expect(diagramPage!.height).toBe(792);
    expect(
      a.solutions[0].regions.at(-1)!.y + a.solutions[0].regions.at(-1)!.height,
    ).toBeLessThan(100);
    expect(a.solutions[0].text).not.toContain("Next answer.");
  });
  it("ends before a section transition even when the next answer starts later", () => {
    const a = analyze(
      [
        page([
          span("1.1.7. Last answer.", 100),
          span(sentence, 150),
          span("1.2 A new section", 300, 72, 15),
          span("1.2.1. Next answer.", 350),
        ]),
      ],
      "solutions",
    );
    const r = a.solutions[0].regions[0];
    expect(r.y + r.height).toBeLessThan(300);
  });
  it("moves a crop edge above a tall matrix rather than cutting its top", () => {
    const a = analyze(
      [
        page([
          span("1.1.1. First answer.", 100),
          span("1.1.2. Matrix answer.", 300),
          span("[", 284, 130, 30),
          span(sentence, 400),
        ]),
      ],
      "solutions",
    );
    expect(a.solutions[1].regions[0].y).toBeLessThan(284);
    expect(
      a.solutions[0].regions[0].y + a.solutions[0].regions[0].height,
    ).toBeLessThan(284);
  });
  it("keeps narrow formula gaps instead of expanding into preceding questions", () => {
    const a = analyze(
      [
        page([
          span("1.1.1. First answer.", 100),
          span("denominator", 126, 180),
          span("1.1.2. Radical answer.", 149),
          span("radical", 139, 240),
          span("denominator", 149.5, 240),
          span("1.1.3. Third answer.", 168),
        ]),
      ],
      "solutions",
    );
    expect(a.solutions.every((s) => !s.issue)).toBe(true);
    const secondTop = a.solutions[1].regions[0].y;
    expect(secondTop).toBeGreaterThan(137);
    expect(secondTop).toBeLessThan(139);
    const thirdTop = a.solutions[2].regions[0].y;
    expect(thirdTop).toBeGreaterThan(160.5);
    expect(thirdTop).toBeLessThan(168);
    expect(a.solutions[0].regions[0].y + a.solutions[0].regions[0].height).toBe(
      secondTop,
    );
    expect(a.solutions[1].regions[0].y + a.solutions[1].regions[0].height).toBe(
      thirdTop,
    );
  });
  it("marks an implausible open boundary unsafe", () => {
    const pages = Array.from({ length: 15 }, (_, i) =>
      page([span(i === 0 ? "1.1.1. Long answer." : sentence, 100)], i + 1),
    );
    const s = analyze(pages, "solutions");
    expect(s.solutions[0].issue).toContain("12 pages");
    expect(s.solutions[0].regions).toEqual([]);
    expect(matchDocuments([s.headings[0]], s.solutions)[0].status).toBe(
      "unsafe",
    );
  });
  it("flags a textless graphic continuation instead of silently losing it", () => {
    const a = analyze(
      [
        page([span("1.1.1. An answer.", 100)]),
        { ...page([], 2), textlessGraphics: true },
        page([span("1.1.2. Next answer.", 100)], 3),
      ],
      "solutions",
    );
    expect(a.solutions[0].issue).toContain("textless graphic");
  });
  it("leaves space for TeX vector accents whose fonts report zero ascent", () => {
    const p = page([
      span("1.1.1. First answer.", 100),
      span("1.1.2. Consider x.", 200),
      { ...span("arrow", 203, 180), bottom: 203 },
    ]);
    const a = analyze([p], "solutions");
    expect(a.solutions[1].top).toBeLessThanOrEqual(193);
  });
});
