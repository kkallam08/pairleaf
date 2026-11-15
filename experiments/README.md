# Recognition experiments

The selectable-text MVP does not load these modules or include their dependencies/assets in the extension. `ai.ts` retains the source-ranking/provider prototype; `ocr*.ts` retain the checked Haese recognition subset. Pure logic regression tests still run from the root `tests` directory.

The working integrated AI/OCR prototype is preserved at commit `bbda4ef`. Use that revision in a separate checkout when revisiting recognition. The old `scripts/check-ai-browser.mjs` and `scripts/check-ocr-browser.mjs` target that UI, not the current `dist`. The local helper and evaluation scripts remain in `server/` and `scripts/` for that future work. The root package no longer exposes those workflows.

`package.json` here records the removed OCR dependency versions for future development; it is not part of the root install/build. Model assets and worker setup must be restored deliberately alongside any future integration. Historical dependency notices are in `THIRD_PARTY_NOTICES.txt` here.

Existing library sets and version-1 backups retain saved regions and review status. The MVP can reopen, review, and export them without recognition. Answer-range editing is unavailable for saved OCR sets because it would require running recognition again. For the current public scope and next steps, use [PLAN.md](../PLAN.md).
