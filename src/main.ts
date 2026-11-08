import "./style.css";
import { markup } from "./ui";
import {
  openPdf,
  extractPages,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
} from "./pdf";
import { analyze } from "./parser";
import { matchDocuments } from "./matching";
import { CanvasPool } from "./rendering";
import type { Match, PageText, Solution } from "./model";
import {
  applySuggestion,
  checkQuestion,
  pairFingerprint,
  rankCandidates,
  restoreChoices,
  sourceKey,
} from "./ai";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = markup;
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
let aiController: AbortController | undefined;
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
  revision++;
  aiController?.abort();
  aiController = undefined;
  previewPool?.destroy();
  sourceSolutions = [];
  fingerprint = "";
  reviewMatch = undefined;
  el<HTMLDialogElement>("match-review").close();
  el<HTMLDialogElement>("ai-setup").close();
  el("ai-status").hidden = true;
  el("ai-progress").textContent = "";
  el<HTMLButtonElement>("ai-run").disabled = false;
  el("ai-cancel").hidden = true;
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
  el<HTMLInputElement>("solutions-file").disabled = false;
}
async function pair(event: SubmitEvent) {
  event.preventDefault();
  const qfile = el<HTMLInputElement>("questions-file").files?.[0],
    sfile = el<HTMLInputElement>("solutions-file").files?.[0];
  if (!qfile || !sfile) return;
  reset();
  const token = revision;
  el<HTMLButtonElement>("pair").disabled = true;
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
    if (!/\.pdf$/i.test(qfile.name) || !/\.pdf$/i.test(sfile.name))
      throw new Error("Choose two PDF files.");
    const [qb, sb] = await Promise.all([
      qfile.arrayBuffer(),
      sfile.arrayBuffer(),
    ]);
    if (cancelled()) return;
    fingerprint = await pairFingerprint(qb, sb);
    if (cancelled()) return;
    const qt = openPdf(new Uint8Array(qb)),
      st = openPdf(new Uint8Array(sb));
    tasks = [qt, st];
    for (const task of tasks)
      task.onPassword = () => {
        void task.destroy();
      };
    const docs = await Promise.all([qt.promise, st.promise]);
    if (cancelled()) return;
    [qdoc, sdoc] = docs;
    const total = qdoc.numPages + sdoc.numPages;
    qpages = await extractPages(
      qdoc,
      (n) =>
        update(
          `Reading questions · page ${n} of ${qdoc!.numPages}`,
          (n / total) * 90,
        ),
      cancelled,
    );
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
    const qa = analyze(qpages, "questions"),
      sa = analyze(spages, "solutions");
    if (!qa.headings.length || !sa.headings.length)
      throw new Error(
        [...qa.warnings, ...sa.warnings].find((w) =>
          w.startsWith("No supported"),
        )!,
      );
    matches = matchDocuments(qa.headings, sa.solutions);
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
    if (cancelled()) return;
    const ready = matches.filter((m) => m.status === "matched").length;
    el("match-count").textContent =
      `${ready} matched / ${matches.length} questions`;
    const counts = ["missing", "ambiguous", "unsafe"]
      .map(
        (status) =>
          `${matches.filter((m) => m.status === status).length} ${status === "unsafe" ? "uncertain boundaries" : status}`,
      )
      .join(" · ");
    const extra = sa.headings.filter(
      (s) => !qa.headings.some((q) => q.id === s.id),
    );
    el("report-summary").textContent =
      `${ready} matched. ${counts.replaceAll(" · ", ", ")}.`;
    el("report-scope").textContent =
      qa.warnings.join(" ") +
      ` ${qa.headings.length} question headings and ${sa.headings.length} solution headings detected. ${extra.length} solution headings have no corresponding question. Local matching uses numbers in single-column PDFs. AI checks extracted text against up to 12 candidate solutions per question. Undetected questions are not included in the counts.`;
    el("question-name").textContent = qfile.name;
    el("question-name").title = qfile.name;
    el("solution-name").textContent = sfile.name;
    el("solution-name").title = sfile.name;
    el("page-total").textContent = `/ ${qpages.length}`;
    el<HTMLInputElement>("page-number").max = String(qpages.length);
    el<HTMLInputElement>("problem").value = "";
    zoom = 1;
    el<HTMLSelectElement>("zoom").value = "1";
    el("setup").hidden = true;
    el("reader").hidden = false;
    el("workspace-name").textContent = "Reading desk";
    el<HTMLButtonElement>("rail-find").disabled = false;
    el<HTMLButtonElement>("rail-review").disabled = false;
    el("rail-files").removeAttribute("aria-current");
    renderQuestions();
    goTo(matches[0].questions[0].page, matches[0].questions[0].y);
    renderReport();
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
      el<HTMLInputElement>("solutions-file").disabled = false;
    }
  }
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
  const n = Math.max(1, Math.min(qpages.length, Math.round(page) || 1));
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
      " Run AI matching to separate duplicate questions. Uncertain question boundaries must be checked in the source PDF.";
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
    el("ai-status").hidden = false;
    el("ai-status").textContent =
      "Choice applied for this session. Local storage could not save it.";
  }
  el<HTMLDialogElement>("match-review").close();
  refreshMatches();
  el("report-close").focus();
};
el("review-close").onclick = () =>
  el<HTMLDialogElement>("match-review").close();
el("match-review").addEventListener("close", clearPreview);
el("ai-open").onclick = () => el<HTMLDialogElement>("ai-setup").showModal();
el("ai-close").onclick = () => el<HTMLDialogElement>("ai-setup").close();
el("ai-setup").addEventListener("close", () => aiController?.abort());
el("ai-cancel").onclick = () => aiController?.abort();
el("ai-run").onclick = async () => {
  const code = el<HTMLInputElement>("helper-code").value.trim();
  if (!code) {
    el("ai-progress").textContent = "Enter the helper connection code.";
    return;
  }
  const controller = new AbortController();
  aiController = controller;
  const token = revision;
  el<HTMLButtonElement>("ai-run").disabled = true;
  el("ai-cancel").hidden = false;
  const results: Match[] = [];
  const total = matches.reduce((sum, match) => sum + match.questions.length, 0);
  let checked = 0,
    skipped = 0,
    usage = 0;
  try {
    for (const match of matches)
      for (const [index, question] of match.questions.entries()) {
        if (controller.signal.aborted)
          throw new DOMException("Stopped", "AbortError");
        const displayId =
          match.questions.length > 1 ? `${match.id} (${index + 1})` : match.id;
        const ranked = rankCandidates(question, sourceSolutions);
        const candidates = [
          ...new Map(
            [
              ...match.solutions.filter((s) => !s.issue && s.text?.trim()),
              ...ranked,
            ].map((s) => [sourceKey(s), s]),
          ).values(),
        ].slice(0, 12);
        if (question.issue || !question.text?.trim() || !candidates.length) {
          results.push({ ...match, id: displayId, questions: [question] });
          skipped++;
          continue;
        }
        el("ai-progress").textContent =
          `Checking question ${checked + skipped + 1} of ${total}…`;
        const result = await checkQuestion(
          question,
          candidates,
          code,
          controller.signal,
        );
        results.push(
          applySuggestion(match, question, result, candidates, displayId),
        );
        usage = result.usedUSD;
        checked++;
      }
    if (token !== revision || controller.signal.aborted) return;
    try {
      const choices = JSON.parse(localStorage.getItem(fingerprint) ?? "{}");
      for (const result of results)
        if (!result.confirmed) delete choices[sourceKey(result.questions[0])];
      localStorage.setItem(fingerprint, JSON.stringify(choices));
    } catch {
      /* Results remain available in this session if local storage is unavailable. */
    }
    matches = results;
    refreshMatches();
    el("ai-status").hidden = false;
    el("ai-status").textContent =
      `AI checked ${checked} questions. ${skipped ? `${skipped} need source-boundary review. ` : ""}Helper usage $${usage.toFixed(4)} of $10.`;
    aiController = undefined;
    el<HTMLDialogElement>("ai-setup").close();
    el<HTMLSelectElement>("report-filter").value = "issues";
    renderReport();
    el<HTMLDialogElement>("report").showModal();
  } catch (error) {
    if (token === revision)
      el("ai-progress").textContent = controller.signal.aborted
        ? "Check stopped. Previous matches kept."
        : error instanceof Error
          ? error.message
          : "AI check failed. Try again.";
  } finally {
    if (token === revision) {
      aiController = undefined;
      el<HTMLButtonElement>("ai-run").disabled = false;
      el("ai-cancel").hidden = true;
    }
  }
};
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
el("replace").onclick = () => {
  reset();
  el<HTMLInputElement>("questions-file").value = "";
  el<HTMLInputElement>("solutions-file").value = "";
  updateFiles();
  el("questions-file").focus();
};
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
};
el("solution-zoom").onchange = () => {
  const m = matches.find((m) => m.id === activeId);
  if (m) showSolution(m, true);
};
let scrollTick = false;
qscroll.addEventListener("scroll", () => {
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
window.addEventListener("beforeunload", () => {
  for (const t of tasks) void t.destroy();
});
