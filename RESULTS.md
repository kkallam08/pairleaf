# Validation results

## Current local build

Checked November 14, 2026 on Chrome 157.0.8103.51. These results cover the documents and fixtures below; they do not establish accuracy on arbitrary textbooks or across subjects.

| Check                      | Result                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                 | 33 passed, including local matching/review and retained experimental logic tests.                                                                        |
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

The manifest declares Chrome 130 as the minimum. Current-Chrome testing and a missing-builtins probe are not an actual Chrome 130 certification; minimum-version coverage remains a release gate.

The library depends on available browser storage. A failed update preserves the previous complete save and leaves retry/export available. Transaction rollback testing does not demonstrate physical power-loss durability. Backup metadata is limited to 32 MiB, separately from PDF bytes; export checksums still require memory for each PDF.

The current build processes selectable text only. Saved recognition results from older versions can be reopened, reviewed, and exported without loading recognition engines. Their source regions are retained, and scanned answer ranges cannot be recomputed.

Real non-mathematics benchmarks, broader textbook coverage, and a full crop audit remain open. See [Supported PDFs](README.md#supported-pdfs).

## Public documentation and presentation

The current README, privacy document, release notes, and developer guide were checked against the implementation. Relative documentation links and heading anchors resolve. The extension title and description cover both import modes. The representative screenshot was captured from the actual extension using invented algebra practice PDFs; all three questions matched, the original solution rendered, and the study saved offline with no browser errors or external requests. The image was visually inspected.

After these changes, all 33 unit tests and the production build/artifact audit passed. Release packaging includes the public documents and screenshot in the source ZIP, while keeping personal planning notes, private documents, and local evidence excluded. Public distribution is still being prepared.

## Reproduce

[Development](docs/DEVELOPMENT.md#validate) lists the current commands and fixture requirements. Browser suites create isolated profiles and store reports/screenshots in ignored `output/`; personal documents and their source crops are excluded from release packages. The public screenshot uses invented practice material.
