# Validation results

## Stage 3 review and stage 4 readiness — November 14, 2026

Review found and fixed these concrete issues before the user's commit:

- **Unsafe questions could reveal automatically.** A unique question carrying a parser boundary issue was still marked matched when its solution was safe. Fresh matching, cached choices, and legacy record normalization now keep it unsafe and unconfirmed. A browser migration case verifies that an old matched/confirmed record is downgraded and persisted immediately on open, without scrolling or editing.
- **Crop padding could cross narrow formula gaps.** Fixed padding plus a tolerance repeatedly expanded a boundary into the preceding question. Strict glyph intersections and padding bounded by real whitespace preserve separation. This recovered the false flags on course questions 5.2.3 and 7.3.3 while retaining the unsafe-boundary checks. Actual source excerpts on PDF pages 236 and 323 were visually checked; radicals and denominators are preserved. Private evidence: `output/review-crop/`.
- **Cancelled OCR edits could disable range correction after upgrade.** Stage 2 recorded the checkbox even when its edits were cancelled. Successful recognition is now identified by the fingerprint marker. Tests cover clean-text sets with a stale true flag and OCR sets with a stale false flag, reopening/exporting both while preserving page/column settings and PDF checksums.
- **The modern PDF.js build did not honor the declared older-Chrome support.** Removing newer JavaScript built-ins reproduced a render failure. Matching legacy main/worker builds now supply compatibility fallbacks. The new offline browser check renders both question and answer with those APIs removed. Mozilla documents [legacy browser support](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions); this simulation is not an actual Chrome 130 run or complete minimum-version certification.
- **The existing ZIP was stale, and packaging did not rebuild/audit it.** The old archive still contained localhost permission and OCR assets. The packager now builds and audits `dist`, derives the version from the manifest, checks archive contents against build inputs, excludes private files, and verifies both archives before replacing local candidates. The source ZIP also includes the previously omitted handoff.

Validation after the runtime fixes: **33 unit tests**, TypeScript/production build and artifact audit pass. Offline interface, single-PDF, library/migration, compatibility, and full course checks pass with no unexpected network requests or browser errors. Fresh course analysis reports **236 matched / 236 questions**, and the expanded browser regression verifies **14 source reveals**, including the two corrected questions. The build is approximately **5.0 MiB** unpacked. The new compatibility and migration tests were first reproduced failing against the prior build.

The packaging test deliberately put a localhost permission and an OCR sentinel file into stale `dist` output. Running the packager rebuilt and removed both, verified the extension and source ZIPs, and refreshed the local candidates. The extracted extension ZIP then passed the full 10-case library suite (both PDF modes, backups, failures, and migrations) and the compatibility rendering check in fresh offline Chrome profiles. No external requests or browser errors occurred.

Stage 4 is not a public-release approval: real non-mathematics benchmark material, final installation/privacy statements, icons, store images/listing, developer registration, and minimum-browser coverage remain gates in PLAN.md. The README's obsolete feature and storage statements must be corrected before publication; stage 5 records the requested broader presentation cleanup. Final publication candidates need installation checks again after release assets change. No commit, merge, push, or publication was performed.

## Local MVP build — November 14, 2026

Stage 3 removes the AI/helper setup, run/status controls, and OCR form from the reader. The packaged extension has no host permissions and its connection policy permits only its own origin. Root dependencies now contain PDF.js only; the Tesseract engine, English data, and associated assets/notices are absent from `dist`. PDF.js's own fonts, CMaps, worker, and image-decoding WASM remain. The final unpacked build measures **4.9 MiB**.

Manual source review, preview, confirmation, and file fingerprints are independent of AI in `src/review.ts`. Duplicate question labels become separate unresolved entries, so users can correct each one locally. Question counts now reflect these individual entries. Uncertain question bounds still block confirmation. The old recognition code is preserved under `experiments/`, with the integrated prototype available at `bbda4ef`.

Existing library records and version-1 `.pairleaf` backups retain original PDF bytes, source regions, and review status. A compatibility browser case imports saved OCR settings and an unconfirmed source proposal, previews its two original regions, confirms it locally, reloads, and exports with the same PDF checksums and OCR settings. Saved OCR answer ranges cannot be edited in this build; new scans require a future OCR release.

Validation passed:

- A clean locked dependency install, **30 unit tests**, TypeScript checking, and the production build. Three new local-review tests cover independent duplicate choices, unsafe boundaries, and compatible fingerprints that invalidate when PDF bytes change. Existing pure AI/OCR logic tests remain as checks on the deferred source modules.
- The build artifact check verifies the actual manifest, local connection policy, absence of helper/OCR code and assets, and presence of PDF rendering assets.
- Offline Chrome **interface**, **single-PDF**, **library/backup**, and **course-pair** suites pass. The course pair restores from the library, retains **236 matches and 12 sampled source reveals**, and exercises manual correction of one repeated-number question while leaving the other unresolved. The library suite also covers full browser restart, storage failures, corruption, and legacy backups.
- Desktop and 390px interface screenshots were inspected. No uncaught page errors or external HTTP(S) requests occurred in the completed browser suites. No paid API calls were made.

The interface fixture's expected question total changed from four grouped identifiers to five individual questions; it passed after that assertion was updated. New-scanned-document support and broad cross-subject accuracy remain outside this gate. Stage 4 still requires the agreed release benchmark and publishing materials. This branch has not been committed, pushed, or released.

## Study library and backups — November 14, 2026

MVP stages 1 and 2 add automatic local saving for PDF pairs and single-PDF study sets. The library reopens the original PDFs with saved question/source regions, pending and confirmed matches, answer ranges, reading position, and zoom. Rename and delete operate on saved sets. Reopening skips text extraction, OCR, and AI matching. The existing experimental OCR settings are included in state; broad OCR support is still outside the selectable-text MVP.

Files, metadata, and state commit together in IndexedDB. Status changes to **Saved on this device** only after the transaction completes. An interrupted write creates no partial entry; an update failure preserves the last complete saved version. A stale reader cannot overwrite a version changed or deleted in another tab. The reader remains usable after failure, with explicit retry and export available. Leaving unsaved work prompts once and can be cancelled.

The `.pairleaf` format contains original PDF bytes and versioned reader metadata with SHA-256 checksums. Import validates the file structure, state, checksums, and PDFs before saving a new study set. Backups contain source PDFs rather than links to the original file paths. They are portable copies, not annotated replacement PDFs.

Verification:

- **27 unit tests**, TypeScript checking, and the production build pass.
- **Offline Chrome library suite:** full Chrome process restart restores a paired study, a manually corrected answer, zoom, and reading position; export/delete/import restores the set; single-PDF range correction and a two-page original answer survive reopening. It also checks concurrent deletion, interrupted transactions, injected storage exhaustion, preserved previous state, recovery/export, corrupt-PDF rejection, and a 390px layout. No uncaught page errors or external HTTP(S) requests occurred.
- Existing single-PDF, interface, and mock-AI browser suites passed during this implementation. The mock suite makes no paid API calls.
- The real course-note regression retains **236 matched questions and 12 sampled reveals**, with exact source-region, scroll, zoom, cancellation, and error-recovery checks. It now reopens the pair from the library after a reload before running those reveal checks.
- Desktop and mobile library screenshots were visually inspected. Evidence is private in `output/library/`; the reproducible test is `npm.cmd run test:library` after building. The library fixtures use invented biology questions, not a real cross-subject accuracy benchmark.

Limits: storage belongs to the current Chrome profile and extension installation. Clearing extension data or uninstalling can remove the library; export backups before moving or reinstalling. Import creates a separate copy, and raw-PDF reimport also creates a new study set. Disk capacity remains browser/device dependent. Backup metadata is limited to 32 MiB of extracted text/state (PDF bytes are separate); exceptionally large metadata is rejected with an error. Export hashing still needs memory for each PDF. The forced interruption test verifies transaction rollback, not physical power-loss durability. AI/OCR controls were still present at this milestone; the stage 3 entry above records their removal.

## Local OCR — November 8, 2026

Implemented a local scanned-exercise profile using bundled Tesseract.js, English data, original PDF rendering, blue margin-label detection, and a small digit-template bank learned from reliably recognized labels in the document. The parser uses exercise context, column order, visual whitespace boundaries, and horizontal splitting for answers sharing a row. OCR never rewrites the source formulas or diagrams. All proposed assignments require confirmation.

The actual packaged extension was tested offline in Chrome against the supplied Haese textbook:

| Measure                                             | Result                                  |
| --------------------------------------------------- | --------------------------------------- |
| PDF question pages                                  | 22–27, one column                       |
| PDF answer pages                                    | 485–486, two columns                    |
| Expected questions                                  | 19 in Exercise 1A; 5 in Exercise 1B     |
| Detected questions / corresponding source proposals | 24 / 24                                 |
| Automatic assignments                               | 0; all 24 require confirmation          |
| Source regions                                      | 25; 1B/1 spans both columns of page 485 |
| Recognition time, including worker startup          | About 14–15 seconds on this machine     |
| Uncaught browser errors / HTTP(S) requests          | 0 / 0                                   |
| Paid API usage                                      | None                                    |

All 24 answers were captured from the actual rendered canvases and inspected against the source pages. The check includes fractions, superscripts, prose, all six graphs for 1B/1, all six graphs for 1B/2, and separate crops for same-row answers 1A/18 and 1A/19. Initial recognition omitted some labels and confused graph markings with numbers; margin geometry and matching printed digit shapes recovered those labels. A crop check also exposed fraction clipping and neighboring numerator pixels; whitespace boundaries now account for words extending above the question label.

The offline browser check confirms the 24 expected identifiers, source-region counts, preview and confirmation, two-region reveal, cancellation during recognition, immediate retry, restoration of all 24 confirmed choices, and a 390px OCR dialog. Twenty-seven unit tests, TypeScript/build, the existing single-PDF/interface/mock-AI suites, and the original 236-question/12-reveal course-pair regression pass. Private evidence is in `output/ocr/`, including `probe.json`, setup screenshots, and the original-source canvas captures. Reproduce with `npm.cmd run test:ocr` after building.

This is a checked two-exercise subset. The remaining chapters, review sets, automatic answer-section detection on scans, handwriting, black or differently colored labels, uneven columns, and general OCR reliability are unverified or unsupported. A numbering gap flags the preceding source as uncertain, but missed boundaries cannot always be detected. Mathematical OCR text is imperfect; optional cloud AI still receives text rather than source images. The review burden here is **100 confirmations per 100 questions**, above the planned target of at most 10. A 24/24 proposal result does not establish full-book accuracy.

At this milestone, OCR ran again on raw-PDF reimport and only confirmed source choices persisted. The November 14 library delivery above adds stored PDFs, settings, and recognized source regions for reopening saved sets.

## Single-PDF mode — November 8, 2026

Single-PDF import now detects a proposed answer section from standalone text headings, bounds it before a recognized index or reference section, and offers editable PDF page numbers. Boundary-page previews are explicit. The reader indexes the question pages preceding the selected range. Applying a corrected range rebuilds source matches, while cancellation retains the existing reader. Chapter/exercise context distinguishes repeated question numbers, and solution crops keep their original PDF page numbers.

Twenty unit tests and the production build pass. The new offline `npm.cmd run test:single` Chrome check covers automatic detection, index exclusion, manual fallback, invalid ranges, range correction after import, cancellation, repeated exercise numbers across chapters, multi-page answer regions, mode switching, and 390px layout. Desktop and mobile preview screenshots were inspected. The existing interface suite, 236-question/12-reveal course-pair regression, and AI workflow checks also pass. AI tests use a fake provider and incur no API usage.

At this text-only milestone, the supplied Haese PDF loaded all 549 pages but its hidden text provided no recognized answer-section heading; entering PDF pages 485–546 produced the unsupported-heading/OCR message. The later local OCR delivery above adds a checked subset of this book. The automated text-mode fixtures use invented selectable text, and broader real-textbook accuracy remains unmeasured.

Single-PDF mode supports one contiguous answer range on separate pages. At this milestone, files and the range needed to be selected again after reloading; confirmed choices restored for the same file and range. The November 14 library delivery above removes that requirement for saved sets. Evidence is local in ignored `output/single-pdf/`.

## AI-assisted matching — November 8, 2026

The personal paired-PDF workflow is implemented: ordinary numbered headings and context, bounded source text, candidate ranking, optional OpenAI checks through a local authenticated helper, source suggestions, explicit preview, manual correction, and locally persisted confirmations. Later deliveries above add clean-text single-PDF import and a limited local OCR profile.

Validation passed after the final parser and matching changes:

- **17 unit tests** and TypeScript/production build. New cases cover ordinary numbering, repeated exercise context, semantic ranking, contradictions, uncertain or missing matches, and restoration of safe source choices.
- **Two helper tests** cover invalid source references, persistent usage, caching, the budget ceiling, connection codes, origin binding, and request size limits. No real provider is used by these tests.
- **Packaged Chrome AI workflow:** all existing and unresolved synthetic questions are checked; contradicted number matches become suggestions; preview renders the original source; confirmation assigns a different-number answer; choices survive reload; changed PDF bytes invalidate choices; cancellation preserves previous matches. No uncaught page errors or unexpected external requests were observed.
- **M116 local regression:** eight questions and eight solutions detected, with five source regions retained for answer 8.
- **Original course-pair regression:** 236 matches, 12 sampled source reveals, zoom and margin alignment, preserved reading positions, error recovery, and cancellation still pass offline. The interface suite also passes keyboard, file-drop, dialog, and mobile checks. The new review/preview screenshot was inspected.

Two small live evaluations used the saved key and the same provider adapter as the helper:

| Evaluation                                                             | Source correspondence                                 | Review behavior                                              | Estimated usage cost |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ | -------------------: |
| Six invented cases across biology, geography, mathematics, and history | 6/6 expected selections, including two absent answers | Changed/uncertain choices require confirmation in the UI     |           $0.0002846 |
| Extracted M116 question/solution text                                  | 8/8 expected selections                               | All eight existing assignments supported; no review required |           $0.0041246 |

The M116 model calls took approximately 11.8 seconds in total, around 1.3–1.7 seconds per question. All eight source candidates were available to each call; the fifth-page answer to question 8 remained below the excerpt cap. This measures text correspondence, not a complete visual crop audit. Failed connection attempts retained conservative reservations, bringing the local ledger to **$0.0090589 of $10**. These are token-rate estimates rather than a provider billing receipt.

Six synthetic cases and one same-number mathematics pair do not establish broad cross-subject accuracy. Real non-mathematics documents, changed-order large documents, single-PDF arrangements, ambiguous examples, crop-completeness audits, and confirmations per 100 questions still need a checked release benchmark. AI sees text, not diagrams, and retrieval can omit the correct source when it falls outside the top 12 candidates. No claim of universal accuracy or public-release readiness is made.

Reproduce with `npm.cmd run check`, `npm.cmd run test:helper`, `npm.cmd run test:ai-browser`, and the browser commands in [README.md](README.md#develop-and-validate). Paid evaluations are separate commands there. Reports live in ignored `output/ai-evaluation.json`, `output/ai-m116-evaluation.json`, and `output/ai-interface/`; private documents and screenshots are excluded from release artifacts.

## Interface redesign — November 8, 2026

The rebuilt extension passed all 13 unit tests, TypeScript checking, and the production build. The full offline Chrome acceptance suite passed again with 236 matches, 12 sampled source-region reveals, preserved question positions, zoom alignment, no overlapping reveal buttons, replacement/error recovery, and cancellation. No external requests or uncaught page errors were recorded.

The new `npm run test:interface` suite also passed: file-picker keyboard focus, invalid/valid drag-and-drop, combobox filtering and arrow/Enter navigation, hidden answers during navigation/review, Escape and dialog focus restoration, and answer opening/closing at desktop, 1024px, and 390px widths. Outer-page overflow was checked at the latter two widths. Screenshots of import, actual PDF reading, synthetic review, and mobile reading were inspected. Local screenshots/results are in `output/interface/`.

An initial Chrome check caught a redundant resize redraw removing a reveal button during navigation. The observer now redraws only when the pane width changes; the rerun passed. PDFs remain canvas-rendered; keyboard-accessible controls do not add screen-reader access to PDF text. Small-screen full-page fits can require zooming.

This earlier delivery changed the interface. The later AI delivery above adds manual confirmation/correction. Single-PDF behavior is covered by the later delivery above.

## Original document validation

Validated locally on November 7, 2026, using Chrome 156.0.8078.81 on Windows, the actual Manifest V3 `dist` package, and the two supplied PDFs. The source documents were read without modification and are excluded from source and release artifacts.

## Full-document automated scan

| Measure                                   | Result |
| ----------------------------------------- | -----: |
| Question PDF pages                        |    419 |
| Solutions PDF pages                       |    159 |
| Detected end-of-section question headings |    236 |
| Detected solution headings                |    236 |
| Unique matches                            |    236 |
| Missing matches                           |      0 |
| Ambiguous identifiers                     |      0 |
| Flagged solution boundaries in this pair  |      0 |
| Extra solutions without a question        |      0 |
| Solutions spanning multiple pages         |     76 |

The notes contain end-of-section problem lists separately from definitions, examples, and in-section exercises. Their appendix for exercise answers is outside the selected matching scope. All matching was automatic from positioned headings, without document-specific mappings.

## Automated checks

- **13 synthetic unit tests passed:** identifier extraction, punctuation and labels, inline and wrapped references, contents/header rejection, problem-list scope, duplicate identifiers on either side, missing matches, multi-page regions, section boundaries, tall matrices, vector accents, excessive/uncertain boundaries, textless graphics, and the toolbar action's tab-opening handler.
- **TypeScript and production build passed.** PDF.js, its worker, fonts, CMaps, and WASM assets are in the packaged extension. Dependency audit reported zero known vulnerabilities at build time.
- The real extension paired the supplied PDFs with **Chrome network access disabled**. No HTTP/HTTPS requests and no uncaught page errors were recorded by the acceptance script.
- The 12 sample reveals used the expected ordered source regions, excluded other detected solution headings, and left the question pane's scroll offset exactly unchanged.
- Margin-button alignment passed at 75%, fit, 125%, and 200%, and at viewport widths 1280, 1600, and 1800. All question buttons were checked for overlaps at those zoom levels. Separate solution zoom preserved question position.
- Distant question canvases were released: only **2 question canvases** remained around page 419 in the measured test.
- Closing cleared solution canvases. Changing the pair cleared all old matches and page elements. Invalid files produced recoverable errors; selecting the supplied pair again succeeded. A textless synthetic PDF showed the OCR limitation. Synthetic duplicates and missing identifiers appeared in the report without allowing ambiguous reveals. Cancelling returned to selection.

The toolbar listener is covered by a synthetic test; the automated browser suite opens the extension reader URL directly. Manual installation into the user's everyday Chrome profile was not performed.

## Visual review

Actual Chrome screenshots of question pages and cropped solution canvases were inspected, not just extracted text. The following 12 samples span the beginning, middle, and end of the documents. All continuation crops were inspected for the sampled multi-page solutions.

| Identifier | Question page | Solution pages | Visual coverage                                             | Final result |
| ---------- | ------------: | -------------- | ----------------------------------------------------------- | ------------ |
| 1.1.1      |            22 | 5              | Five subparts, vector arithmetic                            | Pass         |
| 1.1.2      |            22 | 5–6            | Four subparts, matrices and cross-page continuation         | Pass         |
| 1.3.10     |            41 | 16–18          | Five subparts across three pages, norms and plotted diagram | Pass         |
| 2.2.1      |            88 | 39–40          | Six systems, row reductions and final subpart               | Pass         |
| 3.1.2      |           111 | 57             | Both matrix arithmetic subparts                             | Pass         |
| 3.5.1      |           143 | 69–70          | Six matrix inversions, continued elimination                | Pass         |
| 4.3.1      |           182 | 81–82          | Five dependence cases and final explanation                 | Pass         |
| 5.1.8      |           226 | 106            | Complete argument before the next section                   | Pass         |
| 6.4.1      |           291 | 124            | Both determinant/cross-product methods                      | Pass         |
| 7.3.1      |           323 | 138            | Four complex-number answers and superscripts                | Pass         |
| 8.4.6      |           371 | 155            | Diagonal-matrix proof; neighboring answers excluded         | Pass         |
| 8.5.1      |           375 | 157            | Matrix inversion and full power formula                     | Pass         |

An initial crop after 1.1.2 included a tiny accent from the next answer because one TeX font reported zero ascent. Adding explicit accent padding fixed it; the crop and full browser checks were rerun. The final inspected samples have no observed missing subparts, clipped matrices/diagrams, or neighboring answers. There are **no unresolved failures in these samples**.

## Limits of this evidence

Only these 12 answers were visually audited in full; all 236 answers were not individually inspected. Automated region checks cannot prove every mathematical glyph or arbitrary diagram is present. This result establishes coverage for the supplied pair under the documented layout profile, not all text-based PDFs. Scanned, rotated, encrypted, multi-column, and unusually arranged PDFs remain outside the supported profile. The later AI delivery adds ordinary numbering and saved-choice reload testing. Screen-reader access to the PDF's contents and text selection are not implemented. No Web Store or other-browser validation was performed.

Private evidence is saved locally under ignored `output/` (screenshots and `browser-results.json`) and `tmp/analysis.json`. It is not included in the extension ZIP or source package.
