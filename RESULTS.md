# Validation results

## AI-assisted matching — November 8, 2026

The personal paired-PDF workflow is implemented: ordinary numbered headings and context, bounded source text, candidate ranking, optional OpenAI checks through a local authenticated helper, source suggestions, explicit preview, manual correction, and locally persisted confirmations. Single-PDF import and scanned-textbook recognition remain pending. No Git commits or pushes were performed.

Validation passed after the final parser and matching changes:

- **17 unit tests** and TypeScript/production build. New cases cover ordinary numbering, repeated exercise context, semantic ranking, contradictions, uncertain or missing matches, and restoration of safe source choices.
- **Two helper tests** cover invalid source references, persistent usage, caching, the budget ceiling, connection codes, origin binding, and request size limits. No real provider is used by these tests.
- **Packaged Chrome AI workflow:** all existing and unresolved synthetic questions are checked; contradicted number matches become suggestions; preview renders the original source; confirmation assigns a different-number answer; choices survive reload; changed PDF bytes invalidate choices; cancellation preserves previous matches. No uncaught page errors or unexpected external requests were observed.
- **M116 local regression:** eight questions and eight solutions detected, with five source regions retained for answer 8.
- **Original course-pair regression:** 236 matches, 12 sampled source reveals, zoom and margin alignment, preserved reading positions, error recovery, and cancellation still pass offline. The interface suite also passes keyboard, file-drop, dialog, and mobile checks. The new review/preview screenshot was inspected.

Two small live evaluations used the saved key and the same provider adapter as the helper:

| Evaluation | Source correspondence | Review behavior | Estimated usage cost |
| --- | --- | --- | ---: |
| Six invented cases across biology, geography, mathematics, and history | 6/6 expected selections, including two absent answers | Changed/uncertain choices require confirmation in the UI | $0.0002846 |
| Extracted M116 question/solution text | 8/8 expected selections | All eight existing assignments supported; no review required | $0.0041246 |

The M116 model calls took approximately 11.8 seconds in total, around 1.3–1.7 seconds per question. All eight source candidates were available to each call; the fifth-page answer to question 8 remained below the excerpt cap. This measures text correspondence, not a complete visual crop audit. Failed connection attempts retained conservative reservations, bringing the local ledger to **$0.0090589 of $10**. These are token-rate estimates rather than a provider billing receipt.

Six synthetic cases and one same-number mathematics pair do not establish broad cross-subject accuracy. Real non-mathematics documents, changed-order large documents, single-PDF arrangements, ambiguous examples, crop-completeness audits, and confirmations per 100 questions still need a checked release benchmark. AI sees text, not diagrams, and retrieval can omit the correct source when it falls outside the top 12 candidates. No claim of universal accuracy or public-release readiness is made.

Reproduce with `npm.cmd run check`, `npm.cmd run test:helper`, `npm.cmd run test:ai-browser`, and the browser commands in [README.md](README.md#develop-and-validate). Paid evaluations are separate commands there. Reports live in ignored `output/ai-evaluation.json`, `output/ai-m116-evaluation.json`, and `output/ai-interface/`; private documents and screenshots are excluded from release artifacts.

## Interface redesign — November 8, 2026

The rebuilt extension passed all 13 unit tests, TypeScript checking, and the production build. The full offline Chrome acceptance suite passed again with 236 matches, 12 sampled source-region reveals, preserved question positions, zoom alignment, no overlapping reveal buttons, replacement/error recovery, and cancellation. No external requests or uncaught page errors were recorded.

The new `npm run test:interface` suite also passed: file-picker keyboard focus, invalid/valid drag-and-drop, combobox filtering and arrow/Enter navigation, hidden answers during navigation/review, Escape and dialog focus restoration, and answer opening/closing at desktop, 1024px, and 390px widths. Outer-page overflow was checked at the latter two widths. Screenshots of import, actual PDF reading, synthetic review, and mobile reading were inspected. Local screenshots/results are in `output/interface/`.

An initial Chrome check caught a redundant resize redraw removing a reveal button during navigation. The observer now redraws only when the pane width changes; the rerun passed. PDFs remain canvas-rendered; keyboard-accessible controls do not add screen-reader access to PDF text. Small-screen full-page fits can require zooming.

This earlier delivery changed the interface. The later AI delivery above adds manual confirmation/correction. Single-PDF matching remains unavailable and is not covered by these passing checks.

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
