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
});
describe("matching safety", () => {
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
  it("includes all continuation pages, removes headers/footers and excludes neighboring answers", () => {
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
    expect(r[1].y).toBeGreaterThan(35);
    expect(r[1].y + r[1].height).toBeLessThan(760);
    expect(r[2].y + r[2].height).toBeLessThan(180);
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
