# Chrome Web Store submission

Disclosure copy is ready for a new draft. The owner confirmed no Chrome Web Store draft exists yet. Nothing has been uploaded to or submitted through the store. Recheck the live dashboard labels against the final build; these notes do not certify acceptance. See [ready-to-paste fields](DISCLOSURES.md).

## Package and assets

Use the runnable `release/Pairleaf-0.1.0.zip`, with `manifest.json` at its root. The source ZIP is for development and is not the store upload. Rebuild with `python scripts/release.py` after final changes and run the extracted-package checks documented in [Development](../docs/DEVELOPMENT.md).

The listing text is in [LISTING.md](LISTING.md). Use the prepared 128×128 PNG icon and 1280×800 screenshots. Google currently requires an icon and at least one screenshot; the small promotional tile and marquee are optional. [Official image requirements](https://developer.chrome.com/docs/webstore/images)

## Privacy practices draft

**Single purpose:** Help users study from local question papers and textbooks by revealing their existing source solutions beside the questions and saving those study sets on the device.

**Permissions:** The package requests no optional, host, or named Chrome permissions. Files are selected explicitly through Chrome's file picker or drag and drop. File System Access handles grant read access only to selected files; no directory access or file-write permission is requested. IndexedDB/localStorage hold file references, extracted study data, progress, and corrections in the extension's own origin. The background action opens the bundled reader page; it does not read other tabs or browsing history.

**Remote code:** No. All application code, the PDF.js worker, fonts, CMaps, and image-decoding WebAssembly are bundled. The `wasm-unsafe-eval` content-security-policy token allows the bundled PDF decoder; it does not authorize downloading code. The connection policy is restricted to the extension's own origin. Experimental AI/helper/OCR source is excluded from the extension ZIP.

**Data handling explanation:** Pairleaf reads only PDFs and backups the user selects. It saves file references, content hashes, file names, study titles, extracted text and source regions, matches, corrections, answer ranges, reading position, and zoom in browser storage. Older entries can still contain PDF copies until explicitly relinked or deleted. Imports refer to the selected backup file rather than saving another PDF copy. A separate local cache retains document hashes and confirmed source identifiers. No document content, browsing history, telemetry, or account information is transmitted to the developer or a service. A user-initiated backup export contains the original PDFs and study state.

**Data-category checkboxes:** Disclose local document content and saved reading/study state under the categories actually offered by the dashboard. Confirm the mapping for PDF content and saved position against its current category definitions; do not select “no user data” merely because processing is local. Pairleaf does not independently request identity, authentication, payment, health, location, or browsing-history information. Selected documents can themselves contain personal information. [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [local data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

**Limited Use:** The current implementation uses data only for its PDF study features. It does not sell data, transfer it for advertising, use it for unrelated purposes, or use it to determine creditworthiness. The owner must review the final dashboard declarations before certifying them. The policy source includes a Limited Use statement. [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)

**Privacy policy URL:** [Pairleaf privacy](https://pairleaf-privacy.swoony-bean-3091.chatgpt.site/), hosted publicly through OpenAI Sites. The canonical URL is configured in `site/publication.json`. The contact is `kushikallam@gmail.com`, with public GitHub issues for support. The policy is generated from `PRIVACY.md`; run `node scripts/build-privacy-page.mjs --check --release` after updates. The hosted site is a separate publication from the extension or its GitHub branch.

**Storage/security review still open:** New studies no longer duplicate PDFs in extension storage. This does not eliminate local user-data handling: extracted text, source regions, and progress remain stored; older PDF copies remain until relinked or deleted. Original files, browser data, and `.pairleaf` exports have no application-level encryption added by Pairleaf. The policy describes this accurately. Google's main policy requires secure handling, including encrypted transmissions; its FAQ also explicitly mentions encryption at rest. Obtain written Chrome Web Store clarification for this file-reference design, remaining browser data, and user-exported backups, or implement and validate an encryption design before claiming compliance with that wording. The exact support question and factual disclosure fields are in [DISCLOSURES.md](DISCLOSURES.md). This preparation does not claim that offline operation alone satisfies that requirement. [Handling requirements](https://developer.chrome.com/docs/webstore/program-policies/policies), [encryption FAQ, question 9](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

## Reviewer instructions

No login, key, payment, network connection, or helper process is required to use this build. Reviewer examples must be shareable invented material; do not attach personal textbooks or course PDFs.

1. Click Pairleaf's extension action to open the reader.
2. Choose **Separate PDFs**, select the matching example question and solution PDFs, and choose **Pair PDFs**. Use **Show solution** beside a question. The original answer opens alongside it.
3. Choose **Review matches**, change the filter to **All questions**, and use **Review solution → Preview answer** to inspect a source. Confirm a choice and check that it survives reopening the study set.
4. Choose **Change PDFs**, select **Answers in this PDF**, and open the example textbook. Confirm or correct the suggested answer-page range using PDF page numbers and **Preview first page**/**Preview last page**, then choose **Use pages**.
5. Wait for **Saved on this device**. Open **Library**, reopen a study, and verify its PDFs and reading position restore. After a browser restart, use **Allow access** if offered or **Locate file** for each original, then **Use files**. Selecting a different file must not restore the saved answers onto it. No Pairleaf password is required.
6. Choose **Export study set**, delete that library entry, then use **Library → Import backup** to restore a new entry linked to that backup file. Keep the backup available; later progress is stored in Chrome until exported again. Deleting a library entry does not delete original PDFs, downloaded backups or the separate confirmed-choice cache.

Generate the shareable examples with `node scripts/capture-store-screenshots.mjs`. Files are written to ignored `output/store/fixtures/`:

| Files                                              | Expected result                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Algebra practice.pdf` and `Algebra solutions.pdf` | 2 matched questions; the first solution gives a 6 m by 8 m garden.                                           |
| `Biology essentials.pdf`                           | Single-PDF mode detects answer pages 3–4; 2 matched questions, with Exercise A/1 scoped to chapters 1 and 2. |
| `Reading practice.pdf` and `Reading solutions.pdf` | 1 matched question about identifying a claim.                                                                |

Attach these generated examples or provide reachable download URLs with the reviewer instructions. They are intentionally excluded from the extension ZIP; they contain no private documents.

## Owner actions before submission

- Approve the build, icon, screenshots, listing, privacy text, and remaining compatibility/document evidence.
- Resolve the storage/security interpretation above and verify the actual dashboard data categories.
- Use the hosted policy URL and prepared support contact in the new store draft. Only the generated policy page is deployed; the extension source, documents, and library are not hosted there.
- Complete the developer account, verified contact information, 2-Step Verification, registration fee, and any account-specific identity/trader declarations shown by Google.
- Choose the project's source licensing terms separately from preserved dependency attribution.
- Choose audience/countries and complete any required listing fields.
- Upload the checked extension ZIP and reviewer materials; submit only after final review. Deferred publication keeps an approved item staged until manually published, for up to 30 days. [Submission and deferred publication](https://developer.chrome.com/docs/webstore/publish)

The source repository is public. Publication of the extension and its hosted privacy page are separate steps.
