# Pairleaf privacy

Updated November 15, 2026. This document describes the local Pairleaf 0.1.0 extension.

## Processing on your device

Pairleaf reads the PDFs and `.pairleaf` backups you select. PDF parsing, matching, rendering, and saving run locally. The extension does not upload documents, collect analytics, use an account, contact an AI provider, or sync data to a server. Its PDF rendering assets are bundled with the extension.

Pairleaf uses user data only to provide its PDF study features and follows the Chrome Web Store Limited Use requirements. It does not sell user data or use it for advertising, credit decisions, or unrelated purposes.

## Stored information

The study library uses browser storage belonging to this extension in your Chrome profile. A saved study includes:

- References to selected local files, file names, sizes, content hashes, study title, and save timestamps.
- Extracted text, detected question and solution regions, matches, and confirmed corrections.
- The selected answer-page range, reading position, and zoom.

New studies read PDFs from the files you select; Pairleaf does not save another PDF copy in browser storage or modify your originals. Chrome controls permission to read those files and may ask you to allow access again. If access is unavailable or a file moves, **Locate files** lets you select it again. Pairleaf verifies its contents before restoring saved study state. A changed document must be opened as a new study.

Older library entries may still contain PDF copies saved by an earlier build. They remain available until you delete the entry or use **Locate files** to link verified originals. Successful linking removes the saved PDF copies, keeping progress and extracted study data.

A separate local cache stores document hashes and confirmed question/solution identifiers so choices can be restored when the same PDFs are selected again. It does not store PDF bytes or extracted text. Existing studies imported from earlier versions may also retain their saved recognition settings and results; reopening them does not send them to a service.

## Backups and deletion

**Export study set** creates a `.pairleaf` file containing the PDFs and saved study state. It is not encrypted. Its checksums detect corruption, not unauthorized access. Share it only with people who should have access to those documents. **Import backup** creates a new library entry linked to the selected backup file. Its PDFs are read into memory when needed; the backup remains in your folder. Keep that file to reopen the imported study. Later progress is saved in the browser, not written back into the backup; export again to keep an updated portable copy.

Deleting a study from the library removes its file references, metadata, reader state, and any legacy PDF copies from browser storage. It does not delete original files, downloaded backups, or the separate document-hash/confirmed-choice cache. Clearing all storage for the extension removes both local stores. Uninstalling the extension can also remove its data; export backups first if you want to keep your work.

Study progress is tied to the Chrome profile and extension installation. It is not a cloud backup; reopening also requires access to the linked files. Pairleaf does not encrypt original files, exported backups, or browser-stored study data. No Pairleaf password is required. Device access controls and any disk encryption are managed by your operating system, independently of Pairleaf.

## External services

The public privacy page is hosted through OpenAI Sites. Loading that website sends a normal web request to its hosting infrastructure, including connection information such as your IP address. The hosting infrastructure may add automated abuse-protection checks or scripts. Pairleaf adds no analytics, forms, or tracking scripts to the page, and visiting it does not give the host access to your PDFs or study library. The hosting service's handling of website requests is covered by its [privacy policy](https://openai.com/policies/privacy-policy/).

Visiting a project website, downloading a release from GitHub, or contacting support happens outside the extension and is subject to the relevant service's policies. Share personal documents only when necessary and with people who should have access to them. Never include passwords or API keys in a support message.

## Questions

For questions about Pairleaf or this policy, email [kushikallam@gmail.com](mailto:kushikallam@gmail.com). You can also report a problem through [Pairleaf's GitHub issues](https://github.com/kkallam08/pairleaf/issues). GitHub issues are public; keep personal documents and credentials out of them.
