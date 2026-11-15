import "./style.css";
import { markup, libraryMarkup } from "./ui";
import {
  listStudies,
  readStudy,
  saveStudy,
  renameStudy,
  deleteStudy,
  type StudySet,
  type StudyState,
} from "./library";
import { exportStudy, importStudy, validateState } from "./backup";
import {
  openPdf,
  extractPages,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
} from "./pdf";
import { analyze } from "./parser";
import {
  detectAnswerRange,
  validateAnswerRange,
  type AnswerRange,
} from "./single";
import { matchDocuments } from "./matching";
import { CanvasPool } from "./rendering";
import type { Match, PageText, Solution } from "./model";
import {
  pairFingerprint,
  splitForReview,
  restoreChoices,
  sourceKey,
} from "./review";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = markup + libraryMarkup;
function el<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
let revision = 0,
  tasks: PDFDocumentLoadingTask[] = [],
  qdoc: PDFDocumentProxy | undefined,
  sdoc: PDFDocumentProxy | undefined;
let qpages: PageText[] = [],
  matches: Match[] = [],
  questionPool: CanvasPool | undefined,
  solutionPool: CanvasPool | undefined;
let zoom = 1,
  scale = 1,
  renderedWidth = 0,
  activeId: string | undefined,
  lastButton: HTMLButtonElement | undefined;
const qscroll = el("question-scroll"),
  sscroll = el("solution-scroll");
let sourceSolutions: Solution[] = [];
let fingerprint = "";
let singlePages: PageText[] = [];
let singleName = "";
let singleFingerprint = "";
let answerRange: AnswerRange | undefined;
let rangePreviewPool: CanvasPool | undefined;
let reviewMatch: Match | undefined;
let previewPool: CanvasPool | undefined;

function closeSolution(restoreFocus = false) {
  const revealedId = activeId;
  solutionPool?.destroy();
  solutionPool = undefined;
  activeId = undefined;
  el("solution-pages").replaceChildren();
  el("solution-empty").hidden = false;
  el("close-solution").hidden = true;
  el("solution-zoom").hidden = true;
  el("solution-title").textContent = "Solution";
  el("solution-meta").textContent = "";
  delete el("reader").dataset.revealed;
  document
    .querySelectorAll<HTMLButtonElement>(".solution-button")
    .forEach((b) => b.setAttribute("aria-expanded", "false"));
  if (restoreFocus) {
    const currentButton = [
      ...document.querySelectorAll<HTMLButtonElement>(".solution-button"),
    ].find((b) => b.dataset.id === revealedId);
    (currentButton ?? lastButton)?.focus({ preventScroll: true });
  }
}
function reset() {
  flushStudy();
  currentStudy = undefined;
  importedFiles = undefined;
  revision++;
  singlePages = [];
  singleName = "";
  singleFingerprint = "";
  answerRange = undefined;
  clearRangePreview();
  el<HTMLDialogElement>("answer-range").close();
  el("range-open").hidden = true;
  previewPool?.destroy();
  sourceSolutions = [];
  fingerprint = "";
  reviewMatch = undefined;
  el<HTMLDialogElement>("match-review").close();
  questionPool?.destroy();
  questionPool = undefined;
  closeSolution();
  for (const task of tasks) void task.destroy().catch(() => {});
  tasks = [];
  qdoc = undefined;
  sdoc = undefined;
  qpages = [];
  matches = [];
  lastButton = undefined;
  el("pages").replaceChildren();
  el<HTMLInputElement>("problem").value = "";
  closeFinder();
  el("report-list").replaceChildren();
  el("match-count").textContent = "";
  el<HTMLDialogElement>("report").close();
  el("reader").hidden = true;
  el("setup").hidden = false;
  el("workspace-name").textContent = "New pair";
  el<HTMLButtonElement>("rail-find").disabled = true;
  el<HTMLButtonElement>("rail-review").disabled = true;
  el("rail-files").setAttribute("aria-current", "page");
  el("error").hidden = true;
  el("progress-wrap").hidden = true;
  el<HTMLButtonElement>("pair").disabled = false;
  el("cancel").hidden = true;
  el<HTMLInputElement>("questions-file").disabled = false;
  updateMode();
}
async function pair(event: SubmitEvent) {
  event.preventDefault();
  const qfile = el<HTMLInputElement>("questions-file").files?.[0],
    sfile = el<HTMLInputElement>("solutions-file").files?.[0];
  const single = isSingleMode();
  if (!qfile || (!single && !sfile)) return;
  reset();
  const token = revision;
  el<HTMLButtonElement>("pair").disabled = true;
  setModeDisabled(true);
  el("cancel").hidden = false;
  el("progress-wrap").hidden = false;
  el<HTMLInputElement>("questions-file").disabled = true;
  el<HTMLInputElement>("solutions-file").disabled = true;
  const cancelled = () => token !== revision;
  const update = (message: string, value: number) => {
    if (cancelled()) return;
    el("progress-text").textContent = message;
    el<HTMLProgressElement>("progress").value = value;
  };
  try {
    update("Opening PDFs…", 0);
    if (
      !/\.pdf$/i.test(qfile.name) ||
      (!single && !/\.pdf$/i.test(sfile!.name))
    )
      throw new Error(single ? "Choose a PDF file." : "Choose two PDF files.");
    const [qb, sb] = await Promise.all([
      qfile.arrayBuffer(),
      single ? Promise.resolve(undefined) : sfile!.arrayBuffer(),
    ]);
    if (cancelled()) return;
    importedFiles = { questions: qfile, solutions: single ? undefined : sfile };
    fingerprint = await pairFingerprint(qb, sb ?? qb);
    if (cancelled()) return;
    const qt = openPdf(new Uint8Array(qb)),
      st = single ? qt : openPdf(new Uint8Array(sb!));
    tasks = single ? [qt] : [qt, st];
    for (const task of tasks)
      task.onPassword = () => {
        void task.destroy();
      };
    const docs = await Promise.all([qt.promise, st.promise]);
    if (cancelled()) return;
    [qdoc, sdoc] = docs;
    const total = qdoc.numPages + (single ? 0 : sdoc.numPages);
    qpages = await extractPages(
      qdoc,
      (n) =>
        update(
          `Reading questions · page ${n} of ${qdoc!.numPages}`,
          (n / total) * 90,
        ),
      cancelled,
    );
    if (single) {
      if (qpages.length < 2)
        throw new Error(
          "Choose a PDF with questions and answers on separate pages.",
        );
      singlePages = qpages;
      singleName = qfile.name;
      singleFingerprint = fingerprint;
      update("Choose answer pages", 100);
      openAnswerRange();
      return;
    }
    const spages = await extractPages(
      sdoc,
      (n) =>
        update(
          `Reading solutions · page ${n} of ${sdoc!.numPages}`,
          ((qpages.length + n) / total) * 90,
        ),
      cancelled,
    );
    update("Matching questions…", 95);
    finishPair(qpages, spages, qfile.name, sfile!.name, fingerprint);
    startStudy();
    update("Pair ready", 100);
  } catch (error) {
    if (cancelled()) return;
    const message = error instanceof Error ? error.message : String(error);
    reset();
    el("error").textContent = /password|destroyed|worker was destroyed/i.test(
      message,
    )
      ? "Password-protected PDFs are not supported. Choose an unlocked copy."
      : `Could not pair these PDFs. ${message} Select replacement files and try again.`;
    el("error").hidden = false;
  } finally {
    if (!cancelled()) {
      el<HTMLButtonElement>("pair").disabled = false;
      el("cancel").hidden = true;
      el<HTMLInputElement>("questions-file").disabled = false;
      updateMode();
    }
  }
}
function finishPair(
  questionPages: PageText[],
  solutionPages: PageText[],
  questionName: string,
  solutionName: string,
  choiceKey: string,
  jumpToFirst = true,
) {
  const anchor = position();
  const qa = analyze(questionPages, "questions"),
    sa = analyze(solutionPages, "solutions");
  if (!qa.headings.length || !sa.headings.length)
    throw new Error(
      [...qa.warnings, ...sa.warnings].find((w) =>
        w.startsWith("No supported"),
      )!,
    );
  qpages = questionPages;
  fingerprint = choiceKey;
  matches = splitForReview(matchDocuments(qa.headings, sa.solutions));
  sourceSolutions = sa.solutions;
  try {
    matches = restoreChoices(
      matches,
      sourceSolutions,
      JSON.parse(localStorage.getItem(fingerprint) ?? "null"),
    );
  } catch {
    /* An unavailable or malformed local cache does not block reading. */
  }
  el("question-name").textContent = questionName;
  el("question-name").title = questionName;
  el("solution-name").textContent = solutionName;
  el("solution-name").title = solutionName;
  const extra = sa.headings.filter(
    (s) => !qa.headings.some((q) => q.id === s.id),
  );
  el("report-scope").textContent =
    qa.warnings.join(" ") +
    ` ${qa.headings.length} question headings and ${sa.headings.length} solution headings detected. ${extra.length} solution headings have no corresponding question. Local matching uses exercise context and numbers. Undetected questions are not included in the counts.`;
  mountReader(jumpToFirst, anchor);
}
function mountReader(jumpToFirst = true, anchor = position()) {
  const ready = matches.filter((m) => m.status === "matched").length;
  el("match-count").textContent =
    `${ready} matched / ${matches.length} questions`;
  const counts = ["suggested", "missing", "ambiguous", "unsafe"]
    .map(
      (status) =>
        `${matches.filter((m) => m.status === status).length} ${status === "unsafe" ? "uncertain boundaries" : status}`,
    )
    .join(" · ");
  el("report-summary").textContent =
    `${ready} matched. ${counts.replaceAll(" · ", ", ")}.`;
  el("page-total").textContent = `/ ${qpages.at(-1)!.page}`;
  el<HTMLInputElement>("page-number").min = String(qpages[0].page);
  el<HTMLInputElement>("page-number").max = String(qpages.at(-1)!.page);
  el<HTMLInputElement>("problem").value = "";
  if (jumpToFirst) {
    zoom = 1;
    el<HTMLSelectElement>("zoom").value = "1";
  }
  el("setup").hidden = true;
  el("reader").hidden = false;
  el("workspace-name").textContent = "Reading desk";
  el<HTMLButtonElement>("rail-find").disabled = false;
  el<HTMLButtonElement>("rail-review").disabled = false;
  el("rail-files").removeAttribute("aria-current");
  renderQuestions();
  if (jumpToFirst)
    goTo(matches[0].questions[0].page, matches[0].questions[0].y);
  else if (anchor.page > qpages.at(-1)!.page || anchor.page < qpages[0].page)
    goTo(qpages[0].page);
  renderReport();
  closeSolution();
}

function position() {
  const blocks = [...el("pages").children] as HTMLElement[];
  const block =
    blocks.find((b) => b.offsetTop + b.offsetHeight > qscroll.scrollTop + 1) ??
    blocks.at(-1);
  return block
    ? {
        page: Number(block.dataset.page),
        offset: (qscroll.scrollTop - block.offsetTop) / scale,
      }
    : { page: 1, offset: 0 };
}
function renderQuestions() {
  if (!qdoc) return;
  renderedWidth = qscroll.clientWidth;
  const anchor = position();
  questionPool?.destroy();
  el("pages").replaceChildren();
  const maxWidth = Math.max(...qpages.map((p) => p.width));
  const headings = matches
    .flatMap((m) => m.questions)
    .sort((a, b) => a.page - b.page || a.y - b.y);
  const closest = Math.min(
    ...headings
      .slice(1)
      .map((h, i) =>
        h.page === headings[i].page ? h.y - headings[i].y : Infinity,
      ),
  );
  scale = Math.max(0.3, (qscroll.clientWidth - 174) / maxWidth) * zoom;
  const doubleLane = closest * scale < 27;
  if (doubleLane)
    scale = Math.max(0.3, (qscroll.clientWidth - 302) / maxWidth) * zoom;
  questionPool = new CanvasPool(qscroll);
  for (const p of qpages) {
    const block = document.createElement("div");
    block.className = "page-block";
    block.dataset.page = String(p.page);
    block.style.width = `${p.width * scale + (doubleLane ? 274 : 146)}px`;
    block.style.height = `${p.height * scale}px`;
    const paper = document.createElement("div");
    paper.className = "paper";
    block.append(paper);
    el("pages").append(block);
    questionPool.add(
      paper,
      qdoc,
      { page: p.page, x: 0, y: 0, width: p.width, height: p.height },
      scale,
    );
    const laneBottoms: number[] = [];
    for (const { m, h } of matches
      .flatMap((m) =>
        m.questions.filter((h) => h.page === p.page).map((h) => ({ m, h })),
      )
      .sort((a, b) => a.h.y - b.h.y)) {
      const top = h.y * scale - 3;
      let lane = laneBottoms.findIndex((bottom) => bottom <= top);
      if (lane < 0) lane = laneBottoms.length;
      laneBottoms[lane] = top + 27;
      const button = document.createElement("button");
      button.className = `solution-button ${m.status !== "matched" ? "unavailable" : ""}`;
      button.dataset.id = m.id;
      button.dataset.anchorY = String(h.y);
      button.style.left = `${p.width * scale + 12 + lane * 128}px`;
      button.style.top = `${top}px`;
      button.style.setProperty("--connector-width", `${9 + lane * 128}px`);
      button.style.setProperty("--connector-left", `${-12 - lane * 128}px`);
      button.textContent =
        m.status === "matched"
          ? "Show solution"
          : m.status === "missing"
            ? "No solution"
            : "Review match";
      button.setAttribute("aria-label", `${button.textContent} for ${m.id}`);
      button.setAttribute("aria-expanded", String(activeId === m.id));
      button.setAttribute(
        "aria-controls",
        m.status === "matched" ? "solution-pages" : "report",
      );
      button.title = `${m.id}: ${m.reason}`;
      button.onclick = () => {
        lastButton = button;
        if (m.status === "matched") showSolution(m);
        else {
          el<HTMLSelectElement>("report-filter").value = "issues";
          renderReport();
          el<HTMLDialogElement>("report").showModal();
        }
      };
      block.append(button);
    }
  }
  const target = el("pages").querySelector<HTMLElement>(
    `[data-page="${anchor.page}"]`,
  );
  if (target) qscroll.scrollTop = target.offsetTop + anchor.offset * scale;
}
function goTo(page: number, y = 0) {
  const n = Math.max(
    qpages[0]?.page ?? 1,
    Math.min(qpages.at(-1)?.page ?? 1, Math.round(page) || 1),
  );
  const target = el("pages").querySelector<HTMLElement>(`[data-page="${n}"]`);
  if (target)
    qscroll.scrollTop = target.offsetTop + Math.max(0, y * scale - 70);
  el<HTMLInputElement>("page-number").value = String(n);
}
function showSolution(match: Match, keepScroll = false) {
  if (!sdoc || match.status !== "matched") return;
  const old = sscroll.scrollTop;
  solutionPool?.destroy();
  solutionPool = new CanvasPool(sscroll);
  activeId = match.id;
  el("reader").dataset.revealed = "true";
  el("solution-pages").replaceChildren();
  el("solution-empty").hidden = true;
  el("close-solution").hidden = false;
  el("solution-zoom").hidden = false;
  const regions = match.solutions[0].regions;
  el("solution-title").textContent = `Solution ${match.id}`;
  el("solution-meta").textContent =
    regions.length > 1 ? `${regions.length} pages` : "";
  for (const [index, region] of regions.entries()) {
    const section = document.createElement("section");
    section.className = "solution-region";
    section.dataset.page = String(region.page);
    section.dataset.region = JSON.stringify(region);
    const label = document.createElement("p");
    label.className = "region-label";
    label.textContent = `Page ${region.page}${index ? " · continued" : ""}`;
    section.append(label);
    const crop = document.createElement("div");
    crop.className = "solution-crop";
    section.append(crop);
    el("solution-pages").append(section);
    solutionPool.add(
      crop,
      sdoc,
      region,
      Math.max(0.35, (sscroll.clientWidth - 36) / region.width) *
        Number(el<HTMLSelectElement>("solution-zoom").value),
    );
  }
  sscroll.scrollTop = keepScroll ? old : 0;
  document
    .querySelectorAll<HTMLButtonElement>(".solution-button")
    .forEach((b) =>
      b.setAttribute("aria-expanded", String(b.dataset.id === match.id)),
    );
}
function renderReport() {
  const list = el("report-list");
  list.replaceChildren();
  requestAnimationFrame(updateReportFade);
  const shown = matches.filter(
    (m) =>
      el<HTMLSelectElement>("report-filter").value === "all" ||
      m.status !== "matched",
  );
  if (!shown.length) {
    const p = document.createElement("p");
    p.className = "report-clear";
    p.textContent = "No matches need attention.";
    list.append(p);
    return;
  }
  for (const m of shown) {
    const row = document.createElement("div");
    row.className = "report-row";
    const b = document.createElement("button");
    b.className = "text-button";
    b.textContent = m.id;
    b.onclick = () => {
      el<HTMLDialogElement>("report").close();
      goTo(m.questions[0].page, m.questions[0].y);
      [...document.querySelectorAll<HTMLButtonElement>(".solution-button")]
        .find((button) => button.dataset.id === m.id)
        ?.focus({ preventScroll: true });
    };
    const locations = document.createElement("div");
    locations.className = "report-locations";
    const question = document.createElement("span");
    question.textContent = `Question page ${m.questions.map((q) => q.page).join(", ")}`;
    const answer = document.createElement("span");
    answer.textContent = m.solutions.length
      ? `Solution page ${m.solutions.map((s) => s.page).join(", ")}`
      : "No corresponding solution";
    locations.append(question, answer);
    if (m.status !== "matched") {
      const reason = document.createElement("p");
      reason.textContent = m.reason;
      locations.append(reason);
    }
    const status = document.createElement("span");
    status.className = `match-status ${m.status}`;
    status.textContent = {
      matched: "Matched",
      missing: "Missing",
      ambiguous: "Duplicate",
      unsafe: "Check bounds",
      suggested: "Suggested",
    }[m.status];
    row.append(b, locations, status);
    const review = document.createElement("button");
    review.className = "review-choice";
    review.textContent = m.confirmed ? "Change choice" : "Review solution";
    review.setAttribute("aria-label", `Review solution for ${m.id}`);
    review.onclick = () => openReview(m);
    locations.append(review);
    list.append(row);
  }
}
function refreshMatches() {
  scheduleStudy();
  const ready = matches.filter((m) => m.status === "matched").length;
  el("match-count").textContent =
    `${ready} matched / ${matches.length} questions`;
  el("report-summary").textContent =
    `${ready} matched. ${matches.length - ready} need review.`;
  closeSolution();
  renderQuestions();
  renderReport();
}
function clearPreview() {
  previewPool?.destroy();
  previewPool = undefined;
  el("review-preview-pages").replaceChildren();
  el("review-preview-pages").hidden = true;
}
function openReview(match: Match) {
  reviewMatch = match;
  clearPreview();
  el("review-title").textContent = `Question ${match.id}`;
  el("review-evidence").textContent = match.reason;
  const select = el<HTMLSelectElement>("review-source");
  select.replaceChildren(new Option("No matching solution", ""));
  for (const solution of sourceSolutions.filter(
    (s) => !s.issue && s.regions.length,
  )) {
    select.add(
      new Option(`${solution.id} — page ${solution.page}`, sourceKey(solution)),
    );
  }
  select.value =
    match.solutions[0] && !match.solutions[0].issue
      ? sourceKey(match.solutions[0])
      : "";
  const blocked =
    match.questions.length !== 1 || Boolean(match.questions[0].issue);
  el<HTMLButtonElement>("review-confirm").disabled = blocked;
  if (blocked)
    el("review-evidence").textContent +=
      " This question has uncertain boundaries. Check the original PDF before using its answer.";
  el<HTMLDialogElement>("match-review").showModal();
}
el("review-source").onchange = clearPreview;
el("review-preview").onclick = () => {
  clearPreview();
  const solution = sourceSolutions.find(
    (s) =>
      sourceKey(s) === el<HTMLSelectElement>("review-source").value && !s.issue,
  );
  if (!solution || !sdoc) return;
  const container = el("review-preview-pages");
  container.hidden = false;
  previewPool = new CanvasPool(container);
  for (const region of solution.regions) {
    const label = document.createElement("p");
    label.textContent = `Solution page ${region.page}`;
    const crop = document.createElement("div");
    container.append(label, crop);
    previewPool.add(
      crop,
      sdoc,
      region,
      Math.max(0.3, (container.clientWidth - 24) / region.width),
    );
  }
};
el("review-confirm").onclick = () => {
  if (
    !reviewMatch ||
    reviewMatch.questions.length !== 1 ||
    reviewMatch.questions[0].issue
  )
    return;
  const key = el<HTMLSelectElement>("review-source").value;
  const selected = sourceSolutions.find(
    (s) => sourceKey(s) === key && !s.issue,
  );
  if (key && !selected) return;
  reviewMatch.solutions = selected ? [selected] : [];
  reviewMatch.status = selected ? "matched" : "missing";
  reviewMatch.confirmed = true;
  reviewMatch.reason = "Your confirmed choice";
  try {
    const saved = JSON.parse(localStorage.getItem(fingerprint) ?? "{}");
    const choices = saved && typeof saved === "object" ? saved : {};
    choices[sourceKey(reviewMatch.questions[0])] = selected
      ? sourceKey(selected)
      : null;
    localStorage.setItem(fingerprint, JSON.stringify(choices));
  } catch {
    // The library saves choices independently and reports failures in its status.
    // This legacy cache only restores choices on raw-PDF reimport.
  }
  el<HTMLDialogElement>("match-review").close();
  refreshMatches();
  el("report-close").focus();
};
el("review-close").onclick = () =>
  el<HTMLDialogElement>("match-review").close();
el("match-review").addEventListener("close", clearPreview);
let finderIndex = -1;
let finderMatches: Match[] = [];
const finder = el<HTMLInputElement>("problem");
function closeFinder() {
  el("problem-list").hidden = true;
  finder.setAttribute("aria-expanded", "false");
  finder.removeAttribute("aria-activedescendant");
  finderIndex = -1;
}
function selectQuestion(match: Match) {
  finder.value = match.id;
  closeFinder();
  goTo(match.questions[0].page, match.questions[0].y);
  el("find-status").textContent =
    `Question ${match.id}, page ${match.questions[0].page}`;
}
function filterQuestions() {
  const list = el("problem-list");
  finderMatches = matches.filter((m) => m.id.includes(finder.value.trim()));
  finderIndex = -1;
  finder.removeAttribute("aria-activedescendant");
  list.replaceChildren();
  for (const [index, match] of finderMatches.entries()) {
    const option = document.createElement("li");
    option.id = `question-option-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    const id = document.createElement("span");
    id.textContent = match.id;
    const page = document.createElement("small");
    page.textContent = `Page ${match.questions[0].page}`;
    option.append(id, page);
    option.onmousedown = (e) => e.preventDefault();
    option.onclick = () => selectQuestion(match);
    list.append(option);
  }
  if (!finderMatches.length) {
    const empty = document.createElement("li");
    empty.className = "finder-empty";
    empty.textContent = "No question found";
    list.append(empty);
  }
  list.hidden = false;
  finder.setAttribute("aria-expanded", "true");
  el("find-status").textContent = `${finderMatches.length} questions found`;
}
finder.oninput = filterQuestions;
finder.onfocus = filterQuestions;
finder.onblur = closeFinder;
finder.onkeydown = (event) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    closeFinder();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (el("problem-list").hidden) filterQuestions();
    if (!finderMatches.length) return;
    finderIndex =
      finderIndex < 0
        ? event.key === "ArrowDown"
          ? 0
          : finderMatches.length - 1
        : (finderIndex +
            (event.key === "ArrowDown" ? 1 : -1) +
            finderMatches.length) %
          finderMatches.length;
    const options = [...el("problem-list").children];
    options.forEach((option, index) =>
      option.setAttribute("aria-selected", String(index === finderIndex)),
    );
    finder.setAttribute("aria-activedescendant", options[finderIndex].id);
    options[finderIndex].scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    const match =
      finderMatches[finderIndex] ??
      matches.find((m) => m.id === finder.value.trim()) ??
      finderMatches[0];
    if (match) selectQuestion(match);
  }
};
function isSingleMode() {
  return (
    document.querySelector<HTMLInputElement>('input[name="mode"]:checked')
      ?.value === "single"
  );
}
function setModeDisabled(disabled: boolean) {
  document
    .querySelectorAll<HTMLInputElement>('input[name="mode"]')
    .forEach((input) => {
      input.disabled = disabled;
    });
}
function updateMode() {
  const single = isSingleMode();
  setModeDisabled(false);
  el("solutions-drop").hidden = single;
  el<HTMLInputElement>("solutions-file").required = !single;
  el<HTMLInputElement>("solutions-file").disabled = single;
  el("file-grid").classList.toggle("single-file", single);
  el("questions-drop").querySelector(".file-heading span")!.textContent = single
    ? "Textbook PDF"
    : "Questions PDF";
  el("questions-file").setAttribute(
    "aria-label",
    single ? "Textbook PDF" : "Questions PDF",
  );
  el("pair").textContent = single ? "Open PDF" : "Pair PDFs";
}
document
  .querySelectorAll<HTMLInputElement>('input[name="mode"]')
  .forEach((input) => {
    input.onchange = () => {
      updateMode();
      el("error").hidden = true;
    };
  });
function clearRangePreview() {
  rangePreviewPool?.destroy();
  rangePreviewPool = undefined;
  el("range-preview").replaceChildren();
  el("range-preview").hidden = true;
}
function openAnswerRange() {
  clearRangePreview();
  const proposed = answerRange ?? detectAnswerRange(singlePages);
  el("range-detection").textContent = answerRange
    ? `${singleName} · ${singlePages.length} pages`
    : proposed
      ? `Suggested answer section · PDF pages ${proposed.start}–${proposed.end}`
      : `No answer section found. Choose its page range in this ${singlePages.length}-page PDF.`;
  for (const side of ["start", "end"] as const) {
    const input = el<HTMLInputElement>(`range-${side}`);
    input.max = String(singlePages.length);
    input.value = proposed ? String(proposed[side]) : "";
  }
  el("range-error").hidden = true;
  el<HTMLDialogElement>("answer-range").showModal();
}
function cancelRange() {
  el<HTMLDialogElement>("answer-range").close();
  if (!answerRange) reset();
}
el("range-open").onclick = openAnswerRange;
el("range-close").onclick = cancelRange;
el("range-cancel").onclick = cancelRange;
el("answer-range").addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelRange();
});
el("answer-range").addEventListener("close", clearRangePreview);
for (const side of ["start", "end"]) {
  el(`range-${side}`).oninput = () => {
    clearRangePreview();
    el("range-error").hidden = true;
  };
  el(`range-preview-${side}`).onclick = () => {
    clearRangePreview();
    const n = Number(el<HTMLInputElement>(`range-${side}`).value);
    if (!Number.isInteger(n) || n < 1 || n > singlePages.length || !sdoc)
      return;
    const page = singlePages[n - 1],
      container = el("range-preview");
    container.hidden = false;
    const label = document.createElement("p");
    label.textContent = `PDF page ${n}`;
    const canvas = document.createElement("div");
    container.append(label, canvas);
    rangePreviewPool = new CanvasPool(container);
    rangePreviewPool.add(
      canvas,
      sdoc,
      { page: n, x: 0, y: 0, width: page.width, height: page.height },
      Math.max(0.3, (container.clientWidth - 24) / page.width),
    );
  };
}
el<HTMLFormElement>("range-form").onsubmit = (event) => {
  event.preventDefault();
  const range = {
    start: Number(el<HTMLInputElement>("range-start").value),
    end: Number(el<HTMLInputElement>("range-end").value),
  };
  try {
    const invalid = validateAnswerRange(range, singlePages.length);
    if (invalid) throw new Error(invalid);
    const questions = singlePages.slice(0, range.start - 1);
    const solutions = singlePages.slice(range.start - 1, range.end);
    const key = `${singleFingerprint}:single:${range.start}-${range.end}`;
    finishPair(
      questions,
      solutions,
      singleName,
      `${singleName} · pages ${range.start}–${range.end}`,
      key,
      !answerRange,
    );
    answerRange = range;
    startStudy();
    el("range-open").hidden = false;
    el("range-open").textContent = `Answer pages ${range.start}–${range.end}`;
    el<HTMLDialogElement>("answer-range").close();
  } catch (error) {
    el("range-error").textContent =
      error instanceof Error
        ? error.message
        : "Could not read this range. Choose different answer pages.";
    el("range-error").hidden = false;
  }
};
function updateFiles() {
  for (const name of ["questions", "solutions"]) {
    const file = el<HTMLInputElement>(`${name}-file`).files?.[0];
    el(`${name}-selection`).textContent = file?.name ?? "Choose PDF";
    el(`${name}-selection`).title = file?.name ?? "";
    el(`${name}-detail`).textContent = file
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : "or drop it here";
    el(`${name}-drop`).classList.toggle("has-file", Boolean(file));
  }
}
for (const name of ["questions", "solutions"]) {
  const input = el<HTMLInputElement>(`${name}-file`);
  const drop = el(`${name}-drop`);
  input.onchange = () => {
    updateFiles();
    el("error").hidden = true;
  };
  drop.ondragover = (event) => {
    event.preventDefault();
    if (!input.disabled) drop.classList.add("dragging");
  };
  drop.ondragleave = (event) => {
    if (!drop.contains(event.relatedTarget as Node))
      drop.classList.remove("dragging");
  };
  drop.ondrop = (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    if (input.disabled) return;
    const files = event.dataTransfer?.files;
    if (!files || files.length !== 1 || !/\.pdf$/i.test(files[0].name)) {
      el("error").textContent = "Drop one PDF in each file area.";
      el("error").hidden = false;
      return;
    }
    input.files = files;
    input.dispatchEvent(new Event("change"));
  };
}
el("rail-files").onclick = () => {
  if (!el("reader").hidden) el("replace").click();
  else el("questions-file").focus();
};
el("rail-find").onclick = () => {
  finder.focus();
  finder.select();
};
el("rail-review").onclick = () => el("report-open").click();
el<HTMLFormElement>("pair-form").addEventListener("submit", pair);
el("cancel").onclick = reset;
async function replaceStudy() {
  if (!(await leaveStudy())) return;
  el<HTMLDialogElement>("library-dialog").close();
  reset();
  el<HTMLInputElement>("questions-file").value = "";
  el<HTMLInputElement>("solutions-file").value = "";
  updateFiles();
  el("questions-file").focus();
}
el("replace").onclick = replaceStudy;
el("close-solution").onclick = () => closeSolution(true);
el("report-open").onclick = () => el<HTMLDialogElement>("report").showModal();
el("report-close").onclick = () => el<HTMLDialogElement>("report").close();
el("report-filter").onchange = renderReport;
function updateReportFade() {
  const list = el("report-list");
  list.style.setProperty("--fade-top", list.scrollTop > 2 ? "12px" : "0px");
  list.style.setProperty(
    "--fade-bottom",
    list.scrollHeight - list.clientHeight - list.scrollTop > 2 ? "12px" : "0px",
  );
}
el("report-list").addEventListener("scroll", updateReportFade, {
  passive: true,
});
new ResizeObserver(updateReportFade).observe(el("report-list"));
el("page-number").onchange = () =>
  goTo(Number(el<HTMLInputElement>("page-number").value));
el("prev-page").onclick = () => goTo(position().page - 1);
el("next-page").onclick = () => goTo(position().page + 1);
el("zoom").onchange = () => {
  zoom = Number(el<HTMLSelectElement>("zoom").value);
  renderQuestions();
  scheduleStudy();
};
el("solution-zoom").onchange = () => {
  const m = matches.find((m) => m.id === activeId);
  if (m) showSolution(m, true);
  scheduleStudy();
};
let scrollTick = false;
qscroll.addEventListener("scroll", () => {
  scheduleStudy();
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    el<HTMLInputElement>("page-number").value = String(position().page);
    scrollTick = false;
  });
});
let resizeTimer: ReturnType<typeof setTimeout>;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (qdoc && qscroll.clientWidth !== renderedWidth) {
      renderQuestions();
      if (activeId) {
        const m = matches.find((m) => m.id === activeId);
        if (m) showSolution(m, true);
      }
    }
  }, 160);
}).observe(qscroll);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector("dialog[open]"))
    closeSolution(true);
});
window.addEventListener("beforeunload", (event) => {
  flushStudy();
  if (currentStudy?.dirty || currentStudy?.failed) {
    event.preventDefault();
    event.returnValue = "";
  }
});

interface StudySession {
  set: StudySet;
  pending: Promise<void>;
  generation: number;
  dirty: boolean;
  failed: string;
}
let currentStudy: StudySession | undefined;
let importedFiles: StudySet["files"] | undefined;
let studyTimer: ReturnType<typeof setTimeout> | undefined;
function studyState(): StudyState {
  return structuredClone({
    questionName: el("question-name").textContent ?? "Questions",
    solutionName: el("solution-name").textContent ?? "Solutions",
    fingerprint,
    reportScope: el("report-scope").textContent ?? "",
    qpages: qpages.map((p) => ({
      page: p.page,
      width: p.width,
      height: p.height,
      items: [],
    })),
    matches,
    sources: sourceSolutions,
    singlePages,
    singleFingerprint,
    answerRange,
    // Keep legacy scan metadata for reopening saved regions and exporting backups.
    ocr: currentStudy?.set.state.ocr ?? {
      enabled: false,
      first: "1",
      last: "1",
      questions: "1",
      answers: "2",
    },
    position: position(),
    zoom,
    solutionZoom: el<HTMLSelectElement>("solution-zoom").value,
  });
}
function updateSaveStatus() {
  const session = currentStudy;
  if (!session) return;
  el("study-title").textContent = session.set.meta.title;
  el("study-title").title = session.set.meta.title;
  el("save-status").textContent = session.failed
    ? `Unsaved. ${session.failed}`
    : session.dirty
      ? "Saving…"
      : "Saved on this device";
  el("save-status").classList.toggle("save-failed", Boolean(session.failed));
  el("save-retry").hidden = !session.failed;
}
function startStudy() {
  if (!importedFiles) return;
  if (!currentStudy)
    currentStudy = {
      set: {
        meta: {
          id: crypto.randomUUID(),
          title:
            (el("question-name").textContent ?? "Study set")
              .replace(/\.pdf$/i, "")
              .trim()
              .slice(0, 200) || "Study set",
          version: 0,
          updated: Date.now(),
          questions: matches.length,
          single: singlePages.length > 0,
        },
        state: studyState(),
        files: importedFiles,
      },
      pending: Promise.resolve(),
      generation: 0,
      dirty: false,
      failed: "",
    };
  scheduleStudy();
  flushStudy();
}
function scheduleStudy() {
  if (!currentStudy || el("reader").hidden) return;
  currentStudy.dirty = true;
  currentStudy.generation++;
  updateSaveStatus();
  clearTimeout(studyTimer);
  if (!currentStudy.failed) studyTimer = setTimeout(flushStudy, 150);
}
function flushStudy() {
  clearTimeout(studyTimer);
  const session = currentStudy;
  if (!session || !session.dirty) return session?.pending ?? Promise.resolve();
  const state = studyState(),
    generation = session.generation;
  session.set.state = state;
  session.pending = session.pending.then(async () => {
    if (session.failed) return;
    try {
      const snapshot = {
        ...session.set,
        meta: {
          ...session.set.meta,
          questions: state.matches.length,
          single: state.singlePages.length > 0,
        },
        state,
      };
      session.set.meta.version = await saveStudy(snapshot);
      session.set.meta.questions = snapshot.meta.questions;
      if (session.generation === generation) session.dirty = false;
    } catch (error) {
      session.failed =
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "Device storage is full. Export a backup or free space and retry."
          : error instanceof Error
            ? error.message
            : "Device storage is unavailable. Export a backup or retry.";
    }
    if (session === currentStudy) updateSaveStatus();
  });
  return session.pending;
}
async function leaveStudy() {
  await flushStudy();
  return (
    !currentStudy?.failed ||
    confirm(
      "This session has unsaved changes. Export a backup to keep them. Leave this session?",
    )
  );
}
async function downloadStudy(set: StudySet) {
  const blob = await exportStudy(set);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${set.meta.title.replace(/[^\p{L}\p{N} _-]/gu, "_").slice(0, 80) || "Study set"}.pairleaf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
let libraryBusy = false;
async function libraryAction(action: () => Promise<void>) {
  if (libraryBusy) return;
  libraryBusy = true;
  for (const button of el("library-dialog").querySelectorAll<HTMLButtonElement>(
    "button",
  ))
    button.disabled = true;
  el("library-message").textContent = "Working…";
  try {
    await action();
  } catch (error) {
    el("library-message").textContent =
      error instanceof Error
        ? error.message
        : "Could not access the library. Try again.";
  } finally {
    libraryBusy = false;
    for (const button of el(
      "library-dialog",
    ).querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = false;
  }
}
async function refreshLibrary() {
  const entries = await listStudies();
  const list = el("library-list");
  list.replaceChildren();
  el("library-message").textContent = entries.length
    ? ""
    : "Your saved PDFs will appear here.";
  for (const meta of entries) {
    const row = document.createElement("article");
    row.className = "library-entry";
    const open = document.createElement("button");
    open.className = "library-book";
    const title = document.createElement("strong");
    title.textContent = meta.title;
    const detail = document.createElement("span");
    detail.textContent = `${meta.single ? "One PDF" : "PDF pair"} · ${meta.questions} questions`;
    open.append(title, detail);
    open.onclick = () =>
      void libraryAction(async () => {
        if (!(await leaveStudy())) {
          el("library-message").textContent = "";
          return;
        }
        await openStudy(await readStudy(meta.id));
      });
    const actions = document.createElement("div");
    actions.className = "library-entry-actions";
    const add = (label: string, action: () => Promise<void>) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.setAttribute("aria-label", `${label} ${meta.title}`);
      button.onclick = () => void libraryAction(action);
      actions.append(button);
    };
    add("Rename", async () => {
      const title = prompt("Study set name", meta.title)?.trim();
      if (title) {
        if (title.length > 200)
          throw new Error("Use a name of 200 characters or fewer.");
        if (currentStudy?.set.meta.id === meta.id) {
          currentStudy.set.meta.title = title;
          scheduleStudy();
          await flushStudy();
        } else await renameStudy(meta.id, title);
      }
      await refreshLibrary();
    });
    add("Export", async () => {
      const set =
        currentStudy?.set.meta.id === meta.id
          ? { ...currentStudy.set, state: studyState() }
          : await readStudy(meta.id);
      await downloadStudy(set);
      el("library-message").textContent = "Backup download started.";
    });
    add("Delete", async () => {
      if (
        confirm(`Delete “${meta.title}” and its saved PDFs from this device?`)
      ) {
        if (currentStudy?.set.meta.id === meta.id) {
          await flushStudy();
          await deleteStudy(meta.id);
          // Detach before reset so an unsaved/deleted session cannot be recreated.
          currentStudy = undefined;
          reset();
        } else await deleteStudy(meta.id);
      }
      await refreshLibrary();
    });
    row.append(open, actions);
    list.append(row);
  }
}
async function openStudy(set: StudySet) {
  validateState(set.state);
  reset();
  const token = revision;
  const cancelled = () => token !== revision;
  try {
    const qb = new Uint8Array(await set.files.questions.arrayBuffer());
    const sb = set.files.solutions
      ? new Uint8Array(await set.files.solutions.arrayBuffer())
      : undefined;
    if (cancelled()) return;
    const qt = openPdf(qb),
      st = sb ? openPdf(sb) : qt;
    tasks = sb ? [qt, st] : [qt];
    for (const task of tasks)
      task.onPassword = () => {
        void task.destroy();
      };
    const docs = await Promise.all([qt.promise, st.promise]);
    if (cancelled()) return;
    [qdoc, sdoc] = docs;
    const state = set.state;
    // Older builds captured unsubmitted checkbox edits. The successful run's
    // fingerprint, not that checkbox, identifies saved OCR source regions.
    const recognizedScan = state.fingerprint.includes(":ocr-v1:");
    const recognitionChanged = state.ocr.enabled !== recognizedScan;
    state.ocr = { ...state.ocr, enabled: recognizedScan };
    if (
      state.qpages.some((p) => p.page > qdoc!.numPages) ||
      state.sources.some((s) =>
        s.regions.some((r) => r.page > sdoc!.numPages),
      ) ||
      state.matches.some((m) =>
        m.solutions.some((s) => s.regions.some((r) => r.page > sdoc!.numPages)),
      )
    )
      throw new Error("Saved source pages do not match these PDFs.");
    qpages = state.qpages;
    matches = splitForReview(state.matches);
    sourceSolutions = state.sources;
    fingerprint = state.fingerprint;
    el("report-scope").textContent = state.reportScope.replace(
      " AI checks extracted text against up to 12 candidate solutions per question.",
      "",
    );
    singlePages = state.singlePages;
    singleName = state.questionName;
    singleFingerprint = state.singleFingerprint;
    answerRange = state.answerRange;
    zoom = state.zoom;
    el<HTMLSelectElement>("zoom").value = String(zoom);
    el<HTMLSelectElement>("solution-zoom").value = state.solutionZoom;
    for (const name of ["question", "solution"]) {
      const value =
        name === "question" ? state.questionName : state.solutionName;
      el(`${name}-name`).textContent = value;
      el(`${name}-name`).title = value;
    }
    const mode = document.querySelector<HTMLInputElement>(
      `input[name="mode"][value="${singlePages.length ? "single" : "separate"}"]`,
    )!;
    mode.checked = true;
    updateMode();
    if (answerRange && !state.ocr.enabled) {
      el("range-open").hidden = false;
      el("range-open").textContent =
        `Answer pages ${answerRange.start}–${answerRange.end}`;
    }
    el<HTMLDialogElement>("library-dialog").close();
    mountReader(false, state.position);
    const target = el("pages").querySelector<HTMLElement>(
      `[data-page="${state.position.page}"]`,
    );
    if (target)
      qscroll.scrollTop = target.offsetTop + state.position.offset * scale;
    el<HTMLInputElement>("page-number").value = String(state.position.page);
    importedFiles = set.files;
    currentStudy = {
      set,
      pending: Promise.resolve(),
      generation: 0,
      dirty: false,
      failed: "",
    };
    updateSaveStatus();
    if (
      set.meta.version === 0 ||
      recognitionChanged ||
      matches.length !== state.matches.length ||
      matches.some((match, index) => match !== state.matches[index])
    ) {
      scheduleStudy();
      await flushStudy();
    }
  } catch (error) {
    if (!cancelled()) {
      reset();
      el<HTMLDialogElement>("library-dialog").showModal();
    }
    throw error;
  }
}
function showLibrary() {
  el<HTMLDialogElement>("library-dialog").showModal();
  void libraryAction(async () => {
    await flushStudy();
    await refreshLibrary();
  });
}
el("library-open").onclick = showLibrary;
el("rail-library").onclick = showLibrary;
el("library-close").onclick = () =>
  el<HTMLDialogElement>("library-dialog").close();
el("library-refresh").onclick = () => void libraryAction(refreshLibrary);
el("library-new").onclick = replaceStudy;
el("save-retry").onclick = () => {
  if (!currentStudy) return;
  currentStudy.failed = "";
  scheduleStudy();
  void flushStudy();
};
el("study-export").onclick = async () => {
  if (!currentStudy) return;
  const button = el<HTMLButtonElement>("study-export");
  button.disabled = true;
  try {
    await downloadStudy({ ...currentStudy.set, state: studyState() });
  } catch (error) {
    el("save-status").textContent =
      error instanceof Error ? error.message : "Backup failed. Try again.";
  } finally {
    button.disabled = false;
  }
};
el("backup-import").onclick = () => el<HTMLInputElement>("backup-file").click();
el<HTMLInputElement>("backup-file").onchange = () => {
  const input = el<HTMLInputElement>("backup-file"),
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  void libraryAction(async () => {
    const set = await importStudy(file);
    if (!(await leaveStudy())) {
      el("library-message").textContent = "";
      return;
    }
    await openStudy(set);
  });
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) void flushStudy();
});
