import { describe, expect, it } from "vitest";
import {
  pairFingerprint,
  restoreChoices,
  sourceKey,
  splitForReview,
} from "../src/review";
import type { Match, Solution } from "../src/model";

const question = { id: "1", page: 1, x: 30, y: 50, top: 40 };
const other = { ...question, page: 2 };
const source: Solution = {
  ...question,
  regions: [{ page: 1, x: 0, y: 40, width: 612, height: 100 }],
};
const duplicate: Match = {
  id: "1",
  questions: [question, other],
  solutions: [source],
  status: "ambiguous",
  reason: "Duplicate identifier",
};
describe("local source review", () => {
  it("downgrades unsafe legacy matches while preserving safe confirmations and source regions", () => {
    const unsafeQuestion = { ...question, issue: "Uncertain bounds" };
    const legacy: Match = {
      ...duplicate,
      questions: [unsafeQuestion],
      status: "matched",
      confirmed: true,
    };
    const valid: Match = {
      ...duplicate,
      questions: [other],
      status: "matched",
      confirmed: true,
      reason: "Your confirmed choice",
    };
    const normalized = splitForReview([legacy, valid]);
    expect(normalized[0].status).toBe("unsafe");
    expect(normalized[0].confirmed).toBe(false);
    expect(normalized[0].reason).toBe(unsafeQuestion.issue);
    expect(normalized[0].solutions).toBe(legacy.solutions);
    expect(normalized[1]).toBe(valid);
    expect(splitForReview(normalized)[0]).toBe(normalized[0]);
    const choices = { [sourceKey(unsafeQuestion)]: sourceKey(source) };
    expect(restoreChoices([legacy], [source], choices)[0].status).toBe(
      "unsafe",
    );
    expect(restoreChoices([legacy], [source], null)[0].status).toBe("unsafe");
  });
  it("keeps repeated labels unresolved and restores independent manual choices", () => {
    const separate = splitForReview([duplicate]);
    expect(separate.map((m) => m.id)).toEqual(["1 (1)", "1 (2)"]);
    expect(
      separate.every((m) => m.status === "ambiguous" && !m.confirmed),
    ).toBe(true);
    const corrected = restoreChoices(separate, [source], {
      [sourceKey(question)]: sourceKey(source),
      [sourceKey(other)]: null,
    });
    expect(corrected.map((m) => m.status)).toEqual(["matched", "missing"]);
    expect(corrected.every((m) => m.confirmed)).toBe(true);
    expect(splitForReview(corrected)).toEqual(corrected);
  });
  it("preserves unsafe question boundaries during duplicate separation", () => {
    const separated = splitForReview([
      {
        ...duplicate,
        questions: [question, { ...other, issue: "Uncertain bounds" }],
      },
    ]);
    const restored = restoreChoices(separated, [source], {
      [sourceKey(other)]: sourceKey(source),
    });
    expect(restored[1].status).toBe("unsafe");
    expect(restored[1].confirmed).toBe(false);
  });
  it("retains the legacy fingerprint format and invalidates choices for changed PDF bytes", async () => {
    const a = new Uint8Array([1, 2, 3]).buffer;
    const b = new Uint8Array([4, 5, 6]).buffer;
    const key = await pairFingerprint(a, b);
    expect(key).toMatch(/^pairleaf-review-v1:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(await pairFingerprint(a, b)).toBe(key);
    expect(await pairFingerprint(b, a)).not.toBe(key);
  });
});
