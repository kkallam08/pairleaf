const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const documentIcon = icon(
  '<path d="M14 3H5v18h14V8z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>',
);
const folder = icon('<path d="M3 7V5h6l2 2h10v13H3z"/><path d="M3 10h18"/>');
const search = icon(
  '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
);
const review = icon(
  '<path d="M9 5h12M9 12h12M9 19h12m-18-14 1 1 2-2m-3 8 1 1 2-2m-3 8 1 1 2-2"/>',
);
const close = icon('<path d="m6 6 12 12M6 18 18 6"/>');
const mark =
  '<svg viewBox="0 0 28 32" fill="none" aria-hidden="true"><path d="M2 3h14v23H2z" fill="currentColor" opacity=".25"/><path d="M11 8h14v23H11z" fill="currentColor"/><path d="M15 14h6m-6 4h6m-6 4h3" stroke="white" stroke-width="1.5"/></svg>';
const fileField = (
  id: string,
  label: string,
) => `<label class="file-field" id="${id}-drop">
  <span class="file-heading">${documentIcon}<span>${label}</span></span>
  <input id="${id}-file" type="file" accept=".pdf,application/pdf" aria-label="${label}" required>
  <span class="file-selection" id="${id}-selection">Choose PDF</span><span class="file-detail" id="${id}-detail">or drop it here</span>
  <span class="file-change" aria-hidden="true">Browse files</span>
</label>`;

export const markup = `
<header class="masthead"><span class="brand">${mark}Pairleaf</span><span id="workspace-name">New pair</span><span class="local-badge">Files stay on this device</span></header>
<div class="workspace">
  <nav class="tool-rail" aria-label="Workspace tools">
    <button id="rail-files" class="rail-button" aria-label="Open PDFs" title="Open PDFs" aria-current="page">${folder}</button>
    <button id="rail-find" class="rail-button" aria-label="Find a question" title="Find a question" disabled>${search}</button>
    <button id="rail-review" class="rail-button" aria-label="Review matches" title="Review matches" disabled>${review}</button>
  </nav>
  <main>
    <section id="setup" class="setup" aria-labelledby="setup-title">
      <h1 id="setup-title">Open your PDFs</h1>
      <form id="pair-form">
        <fieldset class="mode-choice"><legend class="sr-only">Document arrangement</legend>
          <label class="mode-option"><input type="radio" name="mode" value="separate" checked><span>Separate PDFs</span></label>
          <label class="mode-option pending"><input type="radio" name="mode" value="single" disabled aria-describedby="single-mode-note"><span>Answers in this PDF<small id="single-mode-note">Coming in the matching update</small></span></label>
        </fieldset>
        <div class="file-grid">${fileField("questions", "Questions PDF")}${fileField("solutions", "Solutions PDF")}</div>
        <div class="pair-actions"><p class="quiet">Matching question numbers, such as <strong>1.1.1</strong>.</p><button id="cancel" type="button" hidden>Cancel</button><button id="pair" class="primary" type="submit">Pair PDFs</button></div>
      </form>
      <div id="progress-wrap" hidden><progress id="progress" max="100" value="0"></progress><p id="progress-text" role="status" aria-live="polite"></p></div>
      <p id="error" role="alert" hidden></p>
    </section>
    <section id="reader" hidden aria-label="Paired PDF reader">
      <div class="pair-bar"><strong id="match-count"></strong><button id="report-open" class="text-button">Review matches</button><button id="replace">Change PDFs</button></div>
      <div class="reading-grid">
        <section class="question-column" aria-label="Questions">
          <div class="document-tab"><span class="tab-mark" aria-hidden="true"></span><strong>Questions</strong><span id="question-name"></span></div>
          <div class="reader-toolbar">
            <div class="question-finder">${search}<input id="problem" type="text" role="combobox" aria-label="Find problem" aria-autocomplete="list" aria-controls="problem-list" aria-expanded="false" autocomplete="off" placeholder="Find a question"><ul id="problem-list" role="listbox" aria-label="Questions" hidden></ul><span id="find-status" class="sr-only" role="status"></span></div>
            <div class="page-controls"><button id="prev-page" aria-label="Previous page">‹</button><label class="sr-only" for="page-number">Question page</label><input id="page-number" type="number" min="1" value="1"><span id="page-total"></span><button id="next-page" aria-label="Next page">›</button><select id="zoom" aria-label="Question zoom"><option value="0.75">75%</option><option value="1" selected>Fit width</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></div>
          </div>
          <div id="question-scroll" class="question-scroll" tabindex="0" aria-label="Question pages"><div id="pages"></div></div>
        </section>
        <aside class="solution-column" aria-label="Solution panel">
          <div class="document-tab"><span class="tab-mark" aria-hidden="true"></span><strong>Solutions</strong><span id="solution-name"></span></div>
          <div class="solution-toolbar"><div class="solution-heading"><strong id="solution-title">Solution</strong><span id="solution-meta"></span></div><div class="solution-controls"><select id="solution-zoom" aria-label="Solution zoom" hidden><option value="1">Fit width</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select><button id="close-solution" aria-label="Close solution" title="Close solution" hidden>${close}</button></div></div>
          <div id="solution-scroll" tabindex="0" aria-label="Solution pages"><div id="solution-empty"><span class="empty-tab" aria-hidden="true">${documentIcon}</span><p>Select <strong>Show solution</strong><br>beside a question.</p></div><div id="solution-pages"></div></div>
        </aside>
      </div>
    </section>
  </main>
</div>
<dialog id="report" aria-labelledby="report-title"><div class="dialog-heading"><h2 id="report-title">Review matches</h2><button id="report-close" aria-label="Close matching report">${close}</button></div><p id="report-summary"></p><div class="report-tools"><label>Show <select id="report-filter"><option value="issues">Needs attention</option><option value="all">All questions</option></select></label><span>Answers hidden</span></div><div id="report-list" tabindex="0" aria-label="Match results"></div><details class="report-details"><summary>Matching details</summary><p id="report-scope" class="quiet"></p></details></dialog>`;
