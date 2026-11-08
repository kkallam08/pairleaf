# Pairleaf

A local Chrome extension that pairs a questions PDF with a solutions PDF. Read the original question pages and reveal one complete numbered solution, including its subparts, in a separate panel.

## Install the finished build

1. In Chrome, open `chrome://extensions`.
2. Turn on **Developer mode**, then choose **Load unpacked**.
3. Select this project's **`dist`** folder. Select the folder containing `manifest.json`, not the project root or a ZIP file.
4. Open Chrome's Extensions menu and click **Pairleaf - paired PDF study reader**. Pin it if you want a toolbar shortcut.
5. Select **Questions PDF** and **Solutions PDF**, then click **Pair PDFs**.

The unpacked build is already included locally. A portable ZIP is in `release/Pairleaf-0.1.0.zip`; extract it first and load its extracted folder. No development server, account, key, backend, or internet connection is needed to use the installed extension. Keep the installed folder in place; Chrome loads it from that location.

## Read and reveal

- Select files with the native file picker or drop one PDF into each file area. **Answers in this PDF** is visibly unavailable until the matching update implements that mode.
- The initial view jumps to the first detected problem. **Find a question** filters identifiers as you type; use the arrow keys and Enter, or select a result. Navigation keeps answers hidden. Page controls navigate the complete question document.
- **Show solution** sits outside the original PDF page and follows the problem's position at every zoom. At smaller scales, tightly spaced buttons use a second margin lane so they remain clickable.
- The right panel shows cropped original solution pages in order. Page labels identify continuations. Opening a different answer replaces the current answer without scrolling the question pane.
- Use the two independent zoom controls to enlarge questions or solutions. Large zoom levels allow horizontal scrolling. Percentages are relative to each pane's fit scale. On very small screens, revealing an answer opens a lower pane; closing it restores the full reading area. Enlarge the PDF when its full-page fit is too small to read.
- Close an answer with **×** or **Escape**. Closing returns keyboard focus to its reveal button without moving the document.
- **Review matches** lists identifiers, question and solution page numbers, missing matches, duplicate identifiers, and uncertain boundaries. Additional detection details are collapsed. It contains no solution text. Duplicate or uncertain entries never have an enabled reveal action; confirmation and correction remain planned work.
- **Change PDFs** clears the current documents, matches, and rendered answers. Select a new pair. **Cancel** stops a scan; invalid or unsupported PDFs leave file selection available.

PDF bytes and extracted text live in the reader's memory. Closing or reloading that tab requires selecting the files again. One pair is held per reader tab. Files are never uploaded or added to the extension package.

## Supported documents and limits

This is a deliberately narrow MVP for **upright, text-based, single-column PDFs with explicit dotted identifiers**, such as `1.1.1` or `12.4.16`. The identifiers must be actual left-aligned problem headings, consistently positioned, with recognizable section transitions and conventional page margins. A trailing period and the words Problem, Question, or Solution are supported. Numbered subparts stay with their parent problem.

When question pages contain headings like **Section 1.1 Problems**, only those problem lists are indexed. Definitions, examples, prose references, contents entries, running headers, and in-section exercises are excluded. Otherwise the parser infers a consistent problem-label lane from the document. It does not use the supplied filenames, a mapping table, semantic inference, or an AI service.

The implementation uses a conservative layout profile, not a universal PDF understanding system. It assumes page-body content is between 5.5% and 95% of page height, uses extracted glyph geometry with accent padding to separate answers, and clips small horizontal paper margins. Changed layouts, multi-column pages, irregular typography, mislabelled identifiers, or artwork outside the body may require a new parsing profile. Counts refer to **detected headings**, not independently established completeness for every possible PDF. Do not treat successful matching on the supplied course PDFs as evidence that all PDFs are supported.

Scans/OCR, rotated or password-protected PDFs, image-only solution continuations, plain integer-only numbering, general semantic matching, manual pairing, hints, AI answers, and persistence across reloads are outside this release. Textless artwork inside a continuation and boundaries spanning more than 12 pages are flagged for source review. A genuinely blank page is skipped. The original PDF remains unchanged, including any mistakes in its mathematics.

Pages are rendered when near a pane's viewport, with two concurrent jobs per pane, cancellation when leaving view, a pixel cap per canvas, and release of distant bitmaps. Extracted positions remain in memory for matching and navigation. The question pages are canvas renderings; PDF text selection, link activation, printing, and screen-reader access to the full PDF text are not implemented. Controls and reports are keyboard accessible.

## Development

Use Node.js 24 and npm. Open this directory in VS Code, then:

```powershell
npm.cmd ci
npm.cmd run check
```

`check` runs the synthetic unit tests, TypeScript checking, and a production build. Vite emits the viewer and bundled worker; `scripts/package.mjs` adds the local CMaps, fonts, WASM assets, and notices. After rebuilding, click **Reload** on the extension's card in `chrome://extensions` and open a new reader tab.

For UI development:

```powershell
npm.cmd run dev
```

This starts Vite at `http://127.0.0.1:5181`. The packaged Chrome extension is the supported runtime; the development page is useful for layout changes, but production bundling is what supplies the auxiliary PDF assets. It does not modify the unrelated parent project's application or ports.

## Reproduce the local validation

The course PDFs are **not included**. Give the commands paths to your own copies:

```powershell
node scripts/raw-inspect.mjs "C:\path\questions.pdf" "C:\path\solutions.pdf"
npm.cmd run inspect
npm.cmd run check
npm.cmd run test:browser -- "C:\path\questions.pdf" "C:\path\solutions.pdf"
```

The browser acceptance script is specific to the supplied validation pair's expected counts and sampled identifiers. These expectations live only in the test script; the extension itself contains no document-specific mappings. It loads the actual `dist` extension into an isolated Chrome profile, disables network access, pairs the files through real file inputs, checks navigation/rendering/recovery, and captures screenshots. It uses modern Chrome's `Extensions.loadUnpacked` debugging command; ordinary installation uses **Load unpacked** instead. Your daily Chrome profile is not used or modified.

After building, `npm run test:interface` checks file drops, keyboard search and focus restoration, the review dialog, and desktop/mobile reading positions with synthetic PDFs. Its screenshots and results are in `output/interface/`.

`tmp/` contains local extraction data and disposable Chrome profiles; `output/` contains private validation screenshots and machine-readable results. Both are ignored, along with PDFs, `dist/`, `release/`, and dependencies. **Never distribute the extraction cache or screenshots of private PDFs.** The small synthetic unit fixtures and in-memory browser fixtures contain invented text and no course material.

See [RESULTS.md](RESULTS.md) for the measured counts, 12 visual samples, and remaining validation limits.

## Code map

- `src/model.ts`: heading, region, solution, and match records, in top-left PDF coordinates.
- `src/pdf.ts`: local PDF loading, bundled worker configuration, positioned extraction, and textless-page checks.
- `src/parser.ts`: heading detection, structural scope, and ordered solution regions.
- `src/matching.ts`: unique-identifier joins and explicit missing/duplicate/unsafe statuses.
- `src/rendering.ts`: on-demand original PDF rendering and canvas lifecycle.
- `src/main.ts`, `src/ui.ts`, and `src/style.css`: selection, progress, reader, reports, navigation, and zoom.
- `public/manifest.json` and `public/background.js`: Manifest V3 package and toolbar action.
- `tests/`: focused synthetic tests. `scripts/browser-test.mjs`: isolated packaged-Chrome acceptance checks.

A later hint feature can consume a `Solution` record and its page regions without changing matching or rendering. No hint generation is included now.

## Dependencies and permissions

PDF rendering uses [Mozilla PDF.js](https://mozilla.github.io/pdf.js/examples/). The [Manifest V3 content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) limits script and connection sources to this extension. PDF scripts, annotations, and links are not executed by this canvas-only viewer. There are no host permissions, content scripts, analytics, or remote endpoints. PDF.js and its auxiliary asset licenses are bundled; see `THIRD_PARTY_NOTICES.txt`.

No Git commits, pushes, publication, or Web Store submission were performed.
