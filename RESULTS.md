# Validation results

## Local file update — November 15, 2026

New study entries store file handles and SHA-256 references rather than PDF blobs. Older saved copies remain readable until verified relinking or deletion. Imports link to a complete backup file; subsequent progress remains in Chrome until exported again.

On Windows, all 38 unit tests, the production build/audit, interface checks, single-PDF checks, the compatibility probe, ten library cases, and the actual Chrome 130 suite passed. Seven additional file-access scenarios cover real external PDF drops, restart/repermission, declined access, same-name/same-size content changes, moved files, cancelled choices, legacy migration and rollback, competing tabs, and reopening a backup without the originals. No uncaught page errors or external HTTP(S) requests occurred in completed browser checks. The recovery dialog also fits 320px.

The browser tests use trusted CDP drops of actual filesystem files. They automate chooser results using those genuine handles rather than driving the native OS chooser. Chrome 130 required renewed access after restart in the isolated profile, so unconditional one-click reopening is not claimed. Denial handling is simulated; the granted permission path calls the real handle API.

On November 15, 2026, the owner reported that the manual checklist passed: selecting PDFs through Chrome's native picker, pairing and revealing solutions, saving 125% zoom, reopening after closing Chrome, and cancelling file selection without losing the study. The checklist included allowing access or locating the originals if Chrome requested it; the owner did not specify which reopening path appeared. This is owner-reported validation, separate from the automated checks.

The freshly extracted extension ZIP passed the ten-case library suite, seven file-access scenarios, compatibility probe, and actual Chrome 130 suite. An initial Chrome 130 run during parallel browser startup timed out waiting for its extension worker; the isolated rerun passed.

Store screenshots were recaptured from the current build with invented material and inspected. Privacy/store copy describes file references, remaining extracted data in Chrome, legacy PDF copies, and unencrypted backups. This storage change does not establish a Chrome Web Store policy exemption. The policy is now hosted publicly; account declarations and the storage/security interpretation remain pending.

## Privacy hosting and disclosure preparation

On November 15, 2026, the standalone policy was published through OpenAI Sites at https://pairleaf-privacy.swoony-bean-3091.chatgpt.site/ . An anonymous HTTPS request returned 200 with the policy, approved contact, canonical link, and encryption disclosures. Its generated HTML and styling match the response after excluding the hosting provider’s Cloudflare abuse-protection script. The policy now distinguishes those website requests from offline extension processing. Site identity/version are recorded in site/deployment.json.

The source and bundled policy are generated from the same PRIVACY.md. Store fields are prepared in store/DISCLOSURES.md against Google’s published form and current code; category mapping is identified as an interpretation, pending the actual live draft. The owner confirmed there is no store draft yet. No dashboard certification, support inquiry, or store submission has been sent. The browser-control tool could not confidently identify Chrome’s current URL, so desktop inspection stopped.

## Prior reader and store-preparation baseline

Checked November 14, 2026 on Windows with Chrome 157.0.8103.51 and Chrome for Testing 130.0.6723.116. These results cover the documents and fixtures below; they do not establish accuracy on arbitrary textbooks or across subjects.

| Check                      | Result                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                 | 38 passed, including local matching/review, source-boundary regressions, and retained experimental logic tests.                                          |
| Production build           | TypeScript, Vite build, and packaged-asset audit passed; approximately 5.0 MiB unpacked.                                                                 |
| Interface                  | File selection/drop, keyboard navigation, hidden-until-reveal answers, review, and desktop/390px layouts passed offline.                                 |
| Single PDF                 | Answer detection, range correction, fallback, repeated chapter labels, continuation pages, cancellation, and mobile previews passed.                     |
| Library and backups        | 10 browser cases passed: restart, corrected matches/position, export/import, concurrent deletion, save failures, corrupt backups, and legacy migrations. |
| Course document pair       | 419 question pages and 159 solution pages yielded 236 matched questions; 14 sampled reveals passed source-region and reading-position checks.            |
| Compatibility probe        | Question and solution rendered after removing selected newer JavaScript built-ins from current Chrome.                                                   |
| Extracted release ZIP      | Fresh packaging audit, library suite, and compatibility probe passed in isolated offline Chrome profiles.                                                |
| Network and browser errors | No external HTTP(S) requests or uncaught page errors in completed browser checks.                                                                        |

The course regression checks source regions, zoom, scroll preservation, neighboring-heading exclusion, cancellation, error recovery, and canvas release. Fourteen sampled reveals do not constitute a complete visual audit of all 236 answers. Small invented fixtures used by the other suites exercise behavior, not broad recognition accuracy.

## Review fixes covered by regression checks

- Questions with unsafe boundaries remain unconfirmed even when a same-number solution exists. Opening an older confirmed record downgrades and saves it immediately.
- Crop padding respects whitespace and strict glyph boundaries. Source checks on questions 5.2.3 and 7.3.3 preserve formulas without crossing into the preceding question.
- Legacy OCR provenance is derived from the document fingerprint. Cancelled checkbox edits cannot incorrectly disable range correction on a selectable-text study.
- Matching legacy PDF.js main and worker builds supply compatibility fallbacks.
- Packaging always rebuilds and audits the extension, then verifies both ZIPs before replacing candidates. A stale build containing helper permissions and an OCR sentinel was replaced by the checked local build.

## Limits and release coverage

The declared Chrome 130 minimum was checked using the actual official Chrome for Testing 130.0.6723.116 binary in an isolated Windows profile. Pairing, source reveal, review confirmation, restart/restoration, backup export/delete/import, single-PDF detection, range correction, and multi-page reveal passed offline. This verifies that Windows configuration, not every operating system or PDF layout. The missing-builtins probe remains a separate compatibility check.

The library depends on available browser storage. A failed update preserves the previous complete save and leaves retry/export available. Transaction rollback testing does not demonstrate physical power-loss durability. Backup metadata is limited to 32 MiB, separately from PDF bytes; export checksums still require memory for each PDF.

The current build processes selectable text only. Saved recognition results from older versions can be reopened, reviewed, and exported without loading recognition engines. Their source regions are retained, and scanned answer ranges cannot be recomputed.

Broader textbook coverage and a full visual audit of the large course pair remain open. See [Supported PDFs](docs/SUPPORTED_PDFS.md).

## Public documentation and presentation

The current README, privacy document, release notes, and developer guide were checked against the implementation. Relative documentation links and heading anchors resolve. The extension title and description cover both import modes. The representative screenshot was captured from the actual extension using invented algebra practice PDFs; all three questions matched, the original solution rendered, and the study saved offline with no browser errors or external requests. The image was visually inspected.

After these changes, all 38 unit tests and the production build/artifact audit passed. Release packaging includes the public documents and screenshot in the source ZIP, while keeping personal planning notes, private documents, and local evidence excluded. Public distribution is still being prepared.

## Store candidate checks

The extension now includes 16/32/48/128px icons and a self-contained privacy page. Store assets include a matching 128px icon and three 1280×800 RGB screenshots of the actual reader, answer-range preview, and library. Invented reviewer PDFs are generated locally by the capture script. Image dimensions, icon bytes, screenshots, disclosure text, and desktop/mobile privacy-page layout were checked. The policy uses the approved public contact and is generated from one Markdown source; hosting remains a separate step.

The real-document check adds the following small non-mathematics benchmark:

| Source                                                                                                                                          | Mode                                | Checked result                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| [BBC Learning English: Survival English](https://downloads.bbc.co.uk/worldservice/learningenglish/quiznet/pdfs/26_phrases_survival_english.pdf) | One PDF; detected answer page 3     | 6/6 questions detected; 6 correct source assignments.                                       |
| [BBC Learning English: Habits](https://downloads.bbc.co.uk/rmhttp/worldservice/learningenglish/quiznet/pdfs/qnet_250_habits.pdf)                | One PDF; detected answer pages 2–3  | 6/6 questions detected; 6 correct source assignments.                                       |
| [MIT 7.013: Recitation 2](https://ocw.mit.edu/courses/7-013-introductory-biology-spring-2013/pages/recitations/)                                | Separate question and solution PDFs | 6/6 questions detected; 6 correct source assignments, including diagrams and continuations. |

Across these examples: 18 expected questions, 18 automatic source assignments, zero wrong assignments, zero unresolved questions, and zero confirmations required. All 22 rendered source regions were visually compared with the originals: answer text, molecular diagrams, and the classification table are complete, with no neighboring-answer contamination. These small same-number examples do not establish general recognition accuracy or typical review burden.

The visual audit exposed two boundary defects and verified their fixes. A body line crossing the fixed top margin was clipped, and one near-top question was omitted. A conservative body-line check now recovers it without treating repeated running headers as questions. A molecular diagram extending below the old 95% page cutoff was also clipped. Continuation regions now preserve page edges; explicit next-heading/section boundaries still separate answers. Meaningful regression tests cover both defects and neighboring-answer exclusion.

Page edges can retain headers, footers, blank strips, a quiz link, or final publisher attribution. MIT's final answer includes its attribution page; BBC Habits answer 5 includes a blank leading strip from the next page. These are excess content rather than missing answers or wrong assignments. Older saved sets keep their existing regions; reimport the original PDFs to use the improved parser.

The benchmark script pins public source URLs and hashes in `tests/document-benchmark.json`. Downloaded PDFs, extracted text, and original-source screenshots remain ignored and excluded from archives. Current browser checks produced no external HTTP(S) requests or uncaught errors. The final extracted release candidate passed the actual Chrome 130 check, all ten library cases, and the missing-builtins compatibility probe. Its setup Privacy link opens the bundled policy offline; desktop, 390px, and 320px checks found no overflow, CSP errors, or external requests. Privacy-page CSS line endings are normalized before hashing so fresh Windows checkouts retain their styling.

At that preparation baseline the privacy page was local only; its subsequent publication is recorded above. Developer-account setup, final dashboard declarations, and the storage-policy question recorded in [Submission](store/SUBMISSION.md) remain before submission. No store upload or acceptance is implied by these checks.

## Reproduce

[Development](docs/DEVELOPMENT.md#validate) lists the current commands and fixture requirements. Browser suites create isolated profiles and store reports/screenshots in ignored `output/`; personal documents and their source crops are excluded from release packages. The public screenshot uses invented practice material.
