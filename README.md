# Pairleaf

Read questions from a textbook or PDF pair and reveal their existing solutions beside them. Matching runs locally by default. Optional AI compares question and solution excerpts when numbering or wording differs, and checks existing assignments for contradictions.

## Install or update

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select this project's **`dist`** folder, containing `manifest.json`. If Pairleaf is already installed from that folder, click **Reload** on its card instead.
3. Open a new Pairleaf tab from Chrome's Extensions menu.
4. Select or drop the **Questions PDF** and **Solutions PDF**, then click **Pair PDFs**.

The build is included locally. `release/Pairleaf-0.1.0.zip` is the portable extension; extract it before loading. Keep the installed folder in place. Local matching and reading need no helper, key, or internet connection. Choose **Answers in this PDF** for a textbook with an answer section.

## Use one PDF

Select **Answers in this PDF**, choose your **Textbook PDF**, and click **Open PDF**. Pairleaf looks for an answer-section heading and suggests its first and last PDF pages. Confirm or correct the numbers, optionally preview either boundary page, then click **Use pages**. If detection finds no heading, enter the range yourself. Use actual PDF page numbers rather than printed book numbers.

The reader indexes questions before the answer section and takes solutions only from the selected range. Repeated exercise labels are distinguished by chapter context. **Answer pages** reopens the editor while reading. Applying a correction rebuilds matches; cancelling keeps the current reader. Saved match choices are scoped to the file and selected range.

The text profile supports one contiguous answer section on separate pages in clean, selectable-text, single-column PDFs. Scanned books can use the limited OCR profile below. Full PDF storage and automatic reopening are the next planned local-library step.

## Try the Haese textbook with local OCR

Reload the extension and open a new Pairleaf tab. Choose **Answers in this PDF** and the supplied _Mathematics - Core Topics HL 1 - Haese 2019.pdf_. Click **Open PDF**, then enter:

| Setting                            | Value         |
| ---------------------------------- | ------------- |
| Answer pages, first / last         | **485 / 486** |
| Read scanned pages with OCR        | **Checked**   |
| Questions from page / through page | **22 / 27**   |
| Question columns                   | **One**       |
| Answer columns                     | **Two**       |

Click **Use pages**. These are PDF page numbers, one above the printed numbers in this book. The checked range contains 19 questions in Exercise 1A and five in 1B. Open **Review matches**, use **Review solution → Preview answer**, then **Confirm choice** after checking the source. OCR proposals require confirmation even when the numbers agree. The six-part graph answer for 1B/1 appears in two original source regions.

Recognition runs entirely on the device with bundled Tesseract.js and English language data. It needs no terminal, connection code, API key, or credits. Progress shows the current page; **Cancel** stops recognition and preserves an already-open reader. The checked eight-page batch took about 14–15 seconds on this machine; other devices and documents will differ. Confirmed choices restore when the same file, ranges, and column settings are processed again. OCR output itself is not yet saved across reloads.

This first profile expects upright printed English exercises with headings such as **Exercise 1A**, blue/cyan integer question numbers, and one or two equal-width columns. Include the exercise heading and all answer continuation pages. A missing label can produce an incomplete or overlong crop; detected numbering gaps block direct matching. Formulas and graphs are shown as original PDF images, not reconstructed from OCR text. Review sets, black labels, uneven columns, handwriting, and full-book coverage remain unverified or unsupported. Automatic answer-section detection still relies on selectable text; for this scan, enter the range manually. Start with the tested range above rather than all 549 pages.

## Use AI matching

Your API key belongs in this project's ignored `.env.local` as `OPENAI_API_KEY=...`. The key is already configured on this machine. With Node.js 24 installed, open a VS Code terminal in this directory and run:

```powershell
npm.cmd run ai
```

Keep that terminal open. It prints a temporary **connection code**, separate from the API key. After pairing your PDFs, choose **AI matching**, paste that code, then **Check matches**. Restarting the helper creates a new code. Stop it with Ctrl+C.

The helper sends extracted question text and up to 12 candidate solution excerpts per question to OpenAI using `gpt-6-luna`. The current assignment is included among those candidates, so AI checks existing matches as well as unresolved questions. Images and whole PDF files are not sent. Each excerpt is capped at approximately 12,000 characters; shortened excerpts require review. Candidate retrieval uses shared terms and identifiers, so a relevant source can be missed in a large or differently worded document.

New, changed, and uncertain assignments appear as **Suggested**. An existing assignment remains matched only when the model supports it and the selected excerpts are complete. Open **Review solution**, inspect the proposed source, optionally choose another source or **No matching solution**, and **Confirm choice**. Answer content appears after **Preview answer** or a normal reveal action. The model is instructed to keep its correspondence explanation free of answer values and solution steps; its explanation is still model output.

The API matches existing source regions; it does not generate solutions or verify their correctness. Uncertain layout boundaries are skipped. Cancelling or failing a run keeps the prior matches. Requests that already reached the provider may still incur usage.

The helper records estimated usage in `tmp/ai-usage.json` and stops conservatively before the agreed $10 experimental ceiling. It reserves a buffered amount before each request; failed or interrupted calls retain that reservation. Identical requests are cached until the helper exits. This ledger is an estimate, not a billing receipt or an account-wide spending control. Preserve it across restarts. A lock prevents the helper and evaluation scripts from running concurrently; after a forced crash, verify the old process has stopped before removing `tmp/ai-helper.lock`.

## Read, review, and remember choices

- **Find a question** filters identifiers; use arrows and Enter or select a result. Navigation keeps answers hidden.
- **Show solution** follows the question in the page margin. Original solution crops appear in order in the adjoining pane, including continuation pages. The question's reading position stays fixed.
- Question and answer zoom are independent. On narrow screens the answer occupies a lower pane. Close it with **×** or **Escape**.
- **Review matches** lists source pages, missing answers, duplicate identifiers, layout issues, and AI suggestions. **Review solution** supports manual correction for individually identified questions with safe boundaries, even without running AI.
- Confirmed choices are saved locally against hashes of both complete PDF files. Reimporting the same files restores them; editing either file creates a different pair. AI suggestions are session-only. A new AI run can dispute a saved choice and return it to review.
- **Change PDFs** clears the current reader; **Cancel** stops local extraction. Reloading requires selecting the files again. One pair is held per reader tab.

PDF bytes and extracted text stay in reader memory until the tab closes or changes documents, except for excerpts you explicitly send through AI matching. Saved choices contain source identifiers and document hashes, not PDF text. The helper holds the API key; it is never sent to the browser. Its random connection code and origin checks restrict access to the paired extension or local development page.

## Supported documents and limits

The personal build supports upright, selectable-text, single-column PDFs with consistently positioned headings such as `1.1.1`, `1.`, `1)`, or `Question 1`. It prefers the original dotted-identifier profile when present. Ordinary numbering can include chapter, section, exercise, and review-set context. Subparts stay with the whole numbered question. Mixed numbering styles and unusual layouts can need a new parsing profile.

For course notes with headings like **Section 1.1 Problems**, the original profile indexes those lists rather than definitions, examples, prose references, and contents entries. The parser uses conventional margins and text geometry to bound source regions. Multiple numbered columns, image-only continuations, and boundaries spanning more than 12 pages require source review. Detection cannot prove completeness on an arbitrary PDF.

Scan support is limited to the OCR profile above. Handwriting, rotated or password-protected PDFs, and semantic recognition of formulas or diagrams remain future work. Diagrams are preserved in original source crops, but optional cloud AI receives only extracted text, which can be especially inaccurate after OCR. It can miss a correspondence or suggest an incorrect one. The small checked examples do not establish broad cross-subject accuracy or the planned review-burden target. See [RESULTS.md](RESULTS.md).

Pages render near the viewport, with bounded concurrent jobs and release of distant canvases. Controls and reports are keyboard accessible. PDF text selection, active links, printing, and screen-reader access to the full PDF text are not implemented. The original documents remain unchanged.

## Develop and validate

Use Node.js 24 and npm in this directory:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run test:helper
npm.cmd run test:interface
npm.cmd run test:ai-browser
npm.cmd run test:single
npm.cmd run test:ocr
```

`check` runs unit tests, TypeScript checking, and the production build, including local PDF.js and OCR workers, WASM, fonts, CMaps, and English data. Reload the extension and open a new reader tab after rebuilding. `npm.cmd run dev` serves the interface at `http://127.0.0.1:5181`; the packaged extension is the supported runtime. `test:ocr` expects the supplied Haese PDF in Downloads, or accepts its path as an argument. It runs offline and saves private source-crop evidence under `output/ocr/`.

Browser tests use isolated Chrome profiles. `test:ai-browser` uses a fake model provider and the locally supplied M116 files; it makes no paid API requests. The full course-pair regression accepts paths to those specific validation documents:

```powershell
npm.cmd run test:browser -- "C:\path\MATH115F26CourseNotes.pdf" "C:\path\MATH115F26SolutionstoEndofSectionProblems.pdf"
```

The following evaluations make paid requests with the saved key and shared usage ledger. Close the helper first. The first uses six invented cases; the second expects the supplied eight-question M116 pair:

```powershell
npm.cmd run evaluate:ai
npm.cmd run evaluate:m116 -- "C:\path\M116P7.pdf" "C:\path\M116P7sol.pdf"
```

`output/` holds private screenshots and evaluation reports; `tmp/` holds usage, locks, extraction data, and disposable browser profiles. These directories, `.env*`, PDFs, build archives, and dependencies are ignored. Release packaging uses an explicit allowlist and excludes keys, private documents, and validation evidence. The source ZIP includes the helper; an extension ZIP alone cannot run AI without it.

## Code and permissions

`src/parser.ts` detects and bounds selectable-text sources; `src/ocr*.ts` handles local image recognition and scanned exercise layout. `src/matching.ts` joins identifiers; `src/ai.ts` ranks candidates, validates source choices, and restores corrections. `server/` implements the authenticated loopback helper, provider call, and usage ceiling. The reader and original-PDF rendering live in `src/main.ts`, `src/ui.ts`, `src/style.css`, and `src/rendering.ts`.

The Manifest V3 package allows a loopback host and restricts connections to itself and the helper on `127.0.0.1:5182`. Only the Node helper contacts OpenAI. There are no content scripts or analytics. PDF scripts, annotations, and links are not executed by the canvas viewer. PDF.js licenses and assets are bundled; see `THIRD_PARTY_NOTICES.txt`.

This is a personal/tester build. Public authentication, hosting, billing, and Web Store distribution remain in [PLAN.md](PLAN.md).
