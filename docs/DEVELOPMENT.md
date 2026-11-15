# Development

## Build and run

Use Node.js 24 and npm. From the project root:

```sh
npm ci
npm run check
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`. Load the generated `dist` folder at `chrome://extensions` with **Load unpacked**. After rebuilding, reload the extension and open a fresh reader tab. These are development commands; an installed extension runs without a terminal.

`npm run dev` serves the interface at `http://127.0.0.1:5181`. The packaged extension is the supported runtime and should be used for acceptance checks.

## Validate

After building, use installed Google Chrome for the self-contained browser suites:

```sh
npm run test:interface
npm run test:single
npm run test:library
npm run test:compat
```

They use invented PDFs, isolated profiles, and offline extension sessions. Reports and screenshots go to ignored `output/`; disposable profiles go to `tmp/`. The compatibility check removes selected newer built-ins from current Chrome. It does not replace testing the declared minimum browser version.

The course regression is specific to the previously checked MATH115F26 course-note and end-of-section solution PDFs, which are not distributed here. With authorized local copies, regenerate the extraction and analysis before running it:

```sh
node scripts/raw-inspect.mjs "questions.pdf" "solutions.pdf"
npm run inspect
npm run test:browser -- "questions.pdf" "solutions.pdf"
```

That suite has document-specific expected questions, counts, and source locations; it is not a general validator for arbitrary PDFs. Current evidence and limits are in [RESULTS.md](../RESULTS.md).

## Package a candidate

With development dependencies installed and Python 3 available:

```sh
python scripts/release.py
```

The script rebuilds and audits `dist`, checks package/manifest versions, verifies both ZIPs against their inputs, and replaces the local candidates under `release/`. It does not publish them. The extension ZIP contains the runnable build; the source ZIP includes development and experimental modules.

Extract the extension ZIP to a persistent folder and load it in Chrome. For automated verification of an extracted candidate, the library and compatibility scripts accept its absolute path in `PAIRLEAF_EXTENSION_DIR`. Test the final candidate again after release assets change.

Private documents, backups, environment files, dependencies, usage records, and local test evidence stay outside source/release archives. The release script enforces an explicit source list and excludes private file types and directories. Preserve dependency notices when changing packaged assets.

## Code map

| Area                                          | Files                                            |
| --------------------------------------------- | ------------------------------------------------ |
| Selectable-text extraction, regions, matching | `src/pdf.ts`, `src/parser.ts`, `src/matching.ts` |
| Textbook answer range                         | `src/single.ts`                                  |
| Confirmation and document fingerprints        | `src/review.ts`                                  |
| Library transactions and backup validation    | `src/library.ts`, `src/backup.ts`                |
| Reader integration and rendering              | `src/main.ts`, `src/rendering.ts`                |
| Controls and presentation                     | `src/ui.ts`, `src/style.css`                     |
| Extension entry and policy                    | `public/background.js`, `public/manifest.json`   |

PDF.js uses matching legacy main and worker builds. Keep those versions aligned. Its worker, fonts, CMaps, and image-decoding WASM are packaged locally.

Library updates use optimistic versions to prevent one tab overwriting changes made by another. Files, metadata, and reader state commit atomically. Older records are normalized on open; recognized OCR provenance comes from the fingerprint because a cancelled settings edit could leave an incorrect checkbox flag. Stored OCR regions remain readable, but their ranges cannot be recomputed by the current build. Reimport original PDFs to apply newer parsing rules to an older study set.

Deferred engines and their revision/compatibility notes live in [Recognition experiments](../experiments/README.md). Historical AI/OCR browser scripts target that prototype, not the current interface. They are not part of the local release validation flow.

## Presentation

Keep controls concise and in sentence case. Give the PDFs most of the screen; preserve the white pages, violet margin markers, and compact reading controls. Original interaction references: [Kibo UI](https://www.kibo-ui.com/components/avatar-stack) and [shadcn scroll-fade](https://ui.shadcn.com/docs/utils/scroll-fade).

The README screenshot must show the actual build with shareable example documents. After building, run `node scripts/capture-screenshot.mjs` to regenerate it, then inspect the image before publishing.
