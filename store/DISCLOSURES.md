# Pairleaf store disclosures

Prepared November 15, 2026 for the local Pairleaf 0.1.0 build. The owner has not created a store draft yet; these answers have not been entered or submitted. Check the live form when creating the draft. The security question below remains separate from these factual disclosures.

## Privacy policy URL

https://pairleaf-privacy.swoony-bean-3091.chatgpt.site/

Public support: kushikallam@gmail.com and https://github.com/kkallam08/pairleaf/issues.

## Single purpose

Help users study from PDF question papers and textbooks by revealing existing source solutions beside their questions and remembering their study progress locally.

## Permission justification

The manifest requests no named Chrome permissions, host permissions, or optional permissions. If the dashboard shows no permission fields, leave this section empty. If explanatory text is requested:

Pairleaf reads only PDFs or backups explicitly selected by the user through a file picker or drag and drop. Selected file handles provide read access; no directory or file-write access is requested. Study data is stored in the extension's own browser storage. Pairleaf does not read other tabs, browsing history, or web requests.

## Remote code

Select **No**. All extension code and PDF rendering resources are bundled. There is no remotely downloaded executable code, AI service, or terminal helper. The bundled WebAssembly PDF decoder does not fetch code from a server.

## Data categories

Use this mapping for the current build, comparing it with the live form's definitions. Local processing still needs disclosure. These are conservative mappings from Google's published form to Pairleaf's behavior, not a Google determination about local PDFs.

| Category                            | Proposed selection | Reason                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website content                     | Yes                | The nearest published content category: selected PDF text and images are processed locally, and extracted text/regions are retained. No website scraping occurs. Explain the local-file scope to the reviewer.                                                                     |
| User activity                       | Yes                | Reading position, zoom, chosen answer pages, and confirmed match choices are saved locally to resume a study. No browsing telemetry is sent.                                                                                                                                       |
| Personally identifiable information | No                 | No account, identity form, profile lookup, or identity extraction. Names can occur incidentally in selected file names, titles, or PDF content; the policy discloses those documents and names. Reassess if the live form explicitly classifies incidental document contents here. |
| Health information                  | No                 | No health-specific feature or extraction. User-selected documents can contain arbitrary content.                                                                                                                                                                                   |
| Financial and payment information   | No                 | No purchases, billing, or financial-data feature in the extension.                                                                                                                                                                                                                 |
| Authentication information          | No                 | No account credentials, passwords, API keys, or authentication tokens are requested or stored. File-access handles are described in the policy.                                                                                                                                    |
| Personal communications             | No                 | No access to mail, chat, messages, or calls.                                                                                                                                                                                                                                       |
| Location                            | No                 | The extension does not request location or transmit network requests to determine it. Visiting the separately hosted policy page is covered in the policy's external-services section.                                                                                             |
| Web history                         | No                 | No access to visited URLs, tabs, or browser history.                                                                                                                                                                                                                               |

Do not describe Pairleaf as handling no user data. Do not select additional categories based on deferred AI, OCR, accounts, or cloud-storage ideas that are absent from this build. If the live form has a dedicated files/documents category, prefer that exact definition and retain the reviewer explanation.

## Data-use certifications

The current implementation supports all three published certifications: no sale of user data; no use or transfer beyond the study purpose; and no credit or lending use. Review the exact live statements before certifying. These answers do not establish that the unencrypted storage complies with every security requirement.

## Reviewer explanation

Pairleaf processes user-selected PDFs and backups on the device. No document content, study progress, analytics, account information, or browsing data is uploaded to the developer or a service. New library entries reference original files instead of saving another PDF copy. Browser storage retains file names, content hashes, study titles, extracted text and source regions, matches, corrections, answer ranges, reading position, and zoom. Older entries can contain PDF copies until relinked or deleted. A separate local cache retains hashes and confirmed source identifiers.

User-initiated exports create complete, unencrypted .pairleaf backups containing PDFs and study state. Imported studies refer to the chosen backup file. Pairleaf does not encrypt browser data or original files. Deleting a library entry removes its browser records and any legacy PDF copies, but not original files, exported backups, or the separate confirmed-choice cache. Clearing extension data removes the remaining cache. Reading works offline without an account, API key, helper, or Pairleaf password. The privacy policy explains the separate hosting provider's handling of visits to the public policy website.

## Security question before submission

The current build cannot demonstrate encryption at rest for all saved user data as described by the FAQ. It adds no encryption itself and does not verify operating-system disk encryption. Removing duplicate PDFs reduced stored content; it did not encrypt the remaining extracted text, progress, legacy copies, or exported backups. Browser isolation and checksums are not encryption. HTTPS on the policy website also does not encrypt the extension's local data.

Resolve this through either written Chrome Web Store clarification for this exact local-file design, or a separately designed and tested encryption change. A disclosure alone is not an exemption. The FAQ does not prescribe a PIN/password prompt or a particular key-management design; placing a decryption key alongside encrypted data does not protect against compromise of the whole browser profile. Do not assert that such a design guarantees acceptance.

Suggested question for Chrome Web Store support (draft only; not sent):

> Pairleaf is an offline PDF study extension with no server, analytics, accounts, or document transmission. It reads user-selected local files and stores file handles, names, hashes, extracted text/regions, match corrections, and reading progress in extension IndexedDB/localStorage. Older entries may retain PDF copies until migrated or deleted. Users can export full, unencrypted backup files to their device. Does the encryption-at-rest requirement in User Data FAQ question 9 require application-level encryption for these browser records and user-controlled exports? If a local-only exception applies, what conditions and disclosures are required?

References checked: [privacy fields and official form screenshot](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [local data and encryption FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), and [program policies](https://developer.chrome.com/docs/webstore/program-policies/policies). Current runtime facts were checked against the manifest, library, backup, and file-access code.
