# Pairleaf privacy

Updated November 14, 2026. This document describes the local Pairleaf 0.1.0 extension.

## Processing on your device

Pairleaf reads the PDFs and `.pairleaf` backups you select. PDF parsing, matching, rendering, and saving run locally. The extension does not upload documents, collect analytics, use an account, contact an AI provider, or sync data to a server. Its PDF rendering assets are bundled with the extension.

## Stored information

The study library uses browser storage belonging to this extension in your Chrome profile. A saved study includes:

- Original PDF bytes, file names, study title, and save timestamps.
- Extracted text, detected question and solution regions, matches, and confirmed corrections.
- The selected answer-page range, reading position, and zoom.

A separate local cache stores document hashes and confirmed question/solution identifiers so choices can be restored when the same PDFs are selected again. It does not store PDF bytes or extracted text. Existing studies imported from earlier versions may also retain their saved recognition settings and results; reopening them does not send them to a service.

## Backups and deletion

**Export study set** creates a `.pairleaf` file containing the PDFs and saved study state. It is not encrypted. Its checksums detect corruption, not unauthorized access. Share it only with people who should have access to those documents. **Import backup** saves a new local copy.

Deleting a study from the library removes that study's saved PDFs, metadata, and reader state from the library. It does not delete original files, downloaded backups, or the separate document-hash/confirmed-choice cache. Clearing all storage for the extension removes both local stores. Uninstalling the extension can also remove its data; export backups first if you want to keep your work.

Storage is tied to the Chrome profile and extension installation. It is not a cloud backup, and availability depends on browser storage and device capacity.

## External services and questions

Visiting the repository, downloading a release from GitHub, or submitting a GitHub issue happens outside the extension and is subject to that service's policies. For questions about Pairleaf's data handling, open an issue in the [Pairleaf repository](https://github.com/kkallam08/pairleaf/issues). Keep personal documents and credentials out of public issues.
