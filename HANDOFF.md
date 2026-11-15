# Pairleaf handoff

Pairleaf is a Chrome extension that links PDF questions to their original solutions. Open this folder as its own project in your next coding assistant. Start with [PLAN.md](PLAN.md), [README.md](README.md), and [RESULTS.md](RESULTS.md), then run `git status --short --branch`.

## Resume work

- The paired reader supports separate question and solution PDFs, one PDF with an answer section, optional AI matching, and local OCR for a limited scanned textbook layout.
- MVP stages 1 and 2 are complete: a local study library with PDF storage, reading position, confirmed choices, answer ranges, OCR settings, and `.pairleaf` backup import/export. Reopening a library entry uses saved regions without recognition. See the November 14 results for checks and storage limits.
- Next is MVP stage 3 in PLAN.md: remove the public AI/OCR controls and helper dependencies/permissions for a selectable-text release. Stage 4 covers release validation, the user's final README, GitHub download, and subsequent Chrome Web Store submission. AI funding and hosted services are deferred.
- Library code is in `src/library.ts`, backup validation/format in `src/backup.ts`, and UI/session integration in `src/main.ts`. Build then run `npm.cmd run test:library` for an isolated offline Chrome test including process restart, recovery, and backups. It uses invented PDFs, not private inputs. Import creates a new set; optimistic version checks protect sessions opened in multiple tabs.
- The checked Haese example uses PDF question pages 22–27 in one column and answer pages 485–486 in two columns. It produced 24 proposals that require confirmation. See the results for the tested scope.
- Run `npm.cmd ci` and `npm.cmd run check` to rebuild and verify. Load or reload `dist` in Chrome. The README lists browser checks and the sample PDF inputs they expect.
- Local OCR runs offline. Optional AI matching uses `npm.cmd run ai`, port 5182, and an API key in the ignored `.env.local`. Keep the existing local usage ledger in `tmp/ai-usage.json`. On this PC, use the existing checkout to retain local setup and the installed extension's storage.
- GitHub holds the source and handoff. The saved chat transcript is local in the ignored `output/pairleaf-chat-2026-11-10.txt`. It contains user messages and final replies, with images and tool activity omitted. Review it before attaching it to another assistant.

## Design references

Keep controls in sentence case and give the PDF most of the screen. The shared workspace's DESIGN_REFERENCES.md records the full preferences. For a standalone checkout, the original references are [Kibo UI](https://www.kibo-ui.com/components/avatar-stack) and [shadcn scroll-fade](https://ui.shadcn.com/docs/utils/scroll-fade).
