import type { StudySet, StudyState } from "./library";
import type { Heading, PageText, Region, Solution, TextSpan } from "./model";
const magic = "PAIRLF01";
const maxMetadata = 32 * 1024 * 1024;
function assert(
  value: unknown,
  message = "This backup is incomplete or invalid.",
): asserts value {
  if (!value) throw new Error(message);
}
const text = (value: unknown) => typeof value === "string";
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown) =>
  number(value) && (value as number) > 0 && (value as number) < 1e7;
const pageNumber = (value: unknown) =>
  positive(value) && Number.isInteger(value);
function span(w: TextSpan) {
  return (
    w &&
    text(w.text) &&
    text(w.font) &&
    [w.x, w.y, w.width, w.height, w.bottom, w.baseline].every(number)
  );
}
function pages(value: PageText[], allowEmpty = false) {
  assert(Array.isArray(value) && (allowEmpty || value.length > 0));
  let previous = 0;
  for (const p of value) {
    assert(
      p &&
        pageNumber(p.page) &&
        p.page > previous &&
        positive(p.width) &&
        positive(p.height) &&
        Array.isArray(p.items) &&
        p.items.every(span),
    );
    previous = p.page;
    // Reopening uses saved matches. OCR columns are unnecessary for rendering.
    delete p.ocrColumns;
  }
}
function region(r: Region) {
  return (
    r &&
    pageNumber(r.page) &&
    number(r.x) &&
    r.x >= 0 &&
    number(r.y) &&
    r.y >= 0 &&
    positive(r.width) &&
    positive(r.height)
  );
}
function heading(h: Heading) {
  return (
    h &&
    text(h.id) &&
    pageNumber(h.page) &&
    [h.x, h.y, h.top].every(number) &&
    (h.text === undefined || text(h.text)) &&
    (h.issue === undefined || text(h.issue)) &&
    (h.regions === undefined ||
      (Array.isArray(h.regions) && h.regions.every(region)))
  );
}
function solution(s: Solution) {
  return (
    heading(s) &&
    Array.isArray(s.regions) &&
    s.regions.length > 0 &&
    s.regions.every(region)
  );
}
export function validateState(s: StudyState) {
  assert(
    s &&
      text(s.questionName) &&
      text(s.solutionName) &&
      text(s.fingerprint) &&
      text(s.reportScope) &&
      text(s.singleFingerprint),
  );
  pages(s.qpages);
  pages(s.singlePages, true);
  assert(Array.isArray(s.sources) && s.sources.every(solution));
  assert(Array.isArray(s.matches) && s.matches.length > 0);
  for (const m of s.matches) {
    assert(
      m &&
        text(m.id) &&
        text(m.reason) &&
        ["matched", "missing", "ambiguous", "unsafe", "suggested"].includes(
          m.status,
        ),
    );
    assert(
      Array.isArray(m.questions) &&
        m.questions.length &&
        m.questions.every(heading),
    );
    assert(m.questions.every((q) => s.qpages.some((p) => p.page === q.page)));
    assert(Array.isArray(m.solutions) && m.solutions.every(solution));
    assert(m.status !== "matched" || m.solutions.length === 1);
  }
  assert(
    s.position &&
      s.qpages.some((p) => p.page === s.position.page) &&
      number(s.position.offset) &&
      Math.abs(s.position.offset) < 1e7,
  );
  assert(
    [0.75, 1, 1.25, 1.5, 2].includes(s.zoom) &&
      ["1", "1.25", "1.5", "2"].includes(s.solutionZoom),
  );
  assert(
    s.ocr &&
      typeof s.ocr.enabled === "boolean" &&
      [s.ocr.first, s.ocr.last, s.ocr.questions, s.ocr.answers].every(text),
  );
  if (s.singlePages.length)
    assert(
      s.answerRange &&
        pageNumber(s.answerRange.start) &&
        pageNumber(s.answerRange.end) &&
        s.answerRange.start > 1 &&
        s.answerRange.start <= s.answerRange.end &&
        s.answerRange.end <= s.singlePages.length,
    );
  else assert(s.answerRange === undefined);
}
async function digest(blob: Blob) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
  );
}
const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function exportStudy(set: StudySet): Promise<Blob> {
  const documents = [
    set.files.questions,
    ...(set.files.solutions ? [set.files.solutions] : []),
  ];
  const hashes = await Promise.all(
    documents.map(async (file) => hex(await digest(file))),
  );
  const metadata = new Blob([
    JSON.stringify({
      version: 1,
      title: set.meta.title,
      state: set.state,
      sizes: documents.map((b) => b.size),
      hashes,
    }),
  ]);
  assert(
    metadata.size <= maxMetadata,
    "This study set has too much extracted text for this backup format.",
  );
  const header = new Uint8Array(44);
  header.set(new TextEncoder().encode(magic));
  new DataView(header.buffer).setUint32(8, metadata.size);
  header.set(await digest(metadata), 12);
  return new Blob([header, metadata, ...documents], {
    type: "application/octet-stream",
  });
}
export async function importStudy(file: Blob): Promise<StudySet> {
  assert(file.size >= 44);
  const header = new Uint8Array(await file.slice(0, 44).arrayBuffer());
  assert(
    new TextDecoder().decode(header.slice(0, 8)) === magic,
    "Choose a Pairleaf .pairleaf backup.",
  );
  const length = new DataView(header.buffer).getUint32(8);
  assert(length > 0 && length <= maxMetadata && length + 44 < file.size);
  const metadata = file.slice(44, 44 + length);
  assert(
    hex(await digest(metadata)) === hex(header.slice(12)),
    "The backup metadata is damaged.",
  );
  const data = JSON.parse(await metadata.text());
  assert(
    data.version === 1,
    "This backup version needs a newer Pairleaf release.",
  );
  assert(
    text(data.title) &&
      data.title.trim().length > 0 &&
      data.title.length <= 200,
  );
  validateState(data.state);
  assert(
    Array.isArray(data.sizes) &&
      data.sizes.length === (data.state.singlePages.length ? 1 : 2),
  );
  assert(
    data.sizes.every(
      (size: unknown) => Number.isSafeInteger(size) && (size as number) > 0,
    ),
  );
  assert(
    data.sizes.reduce((a: number, b: number) => a + b, 44 + length) ===
      file.size,
  );
  assert(
    Array.isArray(data.hashes) && data.hashes.length === data.sizes.length,
  );
  const documents: Blob[] = [];
  let offset = 44 + length;
  for (let i = 0; i < data.sizes.length; i++) {
    const document = file.slice(
      offset,
      offset + data.sizes[i],
      "application/pdf",
    );
    assert(
      hex(await digest(document)) === data.hashes[i],
      "A PDF in this backup is damaged.",
    );
    assert(
      (await document.slice(0, 1024).text()).includes("%PDF-"),
      "This backup contains an invalid PDF.",
    );
    documents.push(document);
    offset += document.size;
  }
  return {
    meta: {
      id: crypto.randomUUID(),
      title: data.title,
      version: 0,
      updated: Date.now(),
      questions: data.state.matches.length,
      single: data.state.singlePages.length > 0,
    },
    state: data.state,
    files: { questions: documents[0], solutions: documents[1] },
  };
}
