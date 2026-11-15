# Pairleaf handoff

Pairleaf is a Chrome extension that links PDF questions to their original solutions. Open this folder as its own project in your next coding assistant. Start with [PLAN.md](PLAN.md), [README.md](README.md), and [RESULTS.md](RESULTS.md), then run `git status --short --branch`.

## Resume work

- The current reader supports selectable-text PDF pairs and one PDF with an answer section. AI/OCR controls and runtime dependencies are excluded from the local MVP.
- MVP stages 1 and 2 are complete: a local study library with PDF storage, reading position, confirmed choices, answer ranges, OCR settings, and `.pairleaf` backup import/export. Reopening a library entry uses saved regions without recognition. See the November 14 results for checks and storage limits.
- Stage 3 has been reviewed and fixed on `codex/stage-3-local-mvp`, based on `bbda4ef`. The user will commit it. Stage 4 covers the remaining benchmark, packaging, installation/privacy text and store materials; stage 5 removes generated boilerplate and assistant/process references from public documentation before publication. See PLAN.md for the reviewed gates. No commit, merge, push, or publication has been made.
- Library code is in `src/library.ts`, backup validation/format in `src/backup.ts`, and UI/session integration in `src/main.ts`. Build then run `npm.cmd run test:library` for an isolated offline Chrome test including process restart, recovery, and backups. It uses invented PDFs, not private inputs. Import creates a new set; optimistic version checks protect sessions opened in multiple tabs.
- Local fingerprinting, choice restoration, and duplicate-question review live in `src/review.ts`. Deferred engines are under `experiments/`. Actual OCR provenance is derived from the fingerprint, since cancelled checkbox edits could leave stale flags in old saved sets. Unsafe legacy assignments are downgraded and saved on open. Existing regions remain available; OCR ranges cannot be recomputed. Older parser-flagged sets may need raw-PDF reimport to benefit from new boundary parsing.
- Run `npm.cmd ci` and `npm.cmd run check` to rebuild and verify. The build checks the actual `dist` for helper permissions and recognition assets. Current browser checks are `test:interface`, `test:single`, `test:library`, `test:compat`, and `test:browser` (the latter takes the two course-PDF paths). PDF.js uses matching legacy main/worker builds for older-browser compatibility. Historical AI/OCR browser checks target the prototype UI.
- `python scripts/release.py` now rebuilds and audits before packaging, then verifies both ZIPs before replacing local candidates. It derives the version from the manifest and includes this handoff in the source archive. `release/` files are review candidates; publication awaits the stage 4/5 gates.
- Reload `dist` in the same Chrome installation to retain local storage. Preserve the ignored `.env.local` and `tmp/ai-usage.json` for future experimental work; neither is used by this build. The README's older AI/OCR instructions await the user's final release text.
- GitHub holds the source and handoff. The saved chat transcript is local in the ignored `output/pairleaf-chat-2026-11-10.txt`. It contains user messages and final replies, with images and tool activity omitted. Review it before attaching it to another assistant.

## Design references

Keep controls in sentence case and give the PDF most of the screen. The shared workspace's DESIGN_REFERENCES.md records the full preferences. For a standalone checkout, the original references are [Kibo UI](https://www.kibo-ui.com/components/avatar-stack) and [shadcn scroll-fade](https://ui.shadcn.com/docs/utils/scroll-fade).
