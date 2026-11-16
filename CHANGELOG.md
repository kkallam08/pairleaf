# Release notes

## Unreleased — 0.1.0

### Reader

- Open separate question and solution PDFs, or one textbook with an answer section.
- Detect answer pages and correct the range with page previews.
- Reveal original solutions beside their questions, including continuation pages.
- Find questions by number and review or correct detected matches.

### Study library

- Read original PDFs from their folders; save file references, matches, corrections, reading position, and zoom in the browser.
- Restore file access or relocate missing files with content verification.
- Replace legacy browser PDF copies only after verifying every original file.
- Reopen, rename, and delete saved study sets.
- Export complete `.pairleaf` backups and import them as new studies linked to the backup file.
- Recover from failed saves and protect against stale changes from another tab.

### Reliability

- Require review for uncertain assignments and block unsafe question boundaries.
- Correct formula crop padding and preserve compatible saved studies from earlier versions.
- Bundle PDF rendering assets for offline use and rebuild/audit release packages.
- Preserve near-margin answer text and page-ending diagrams while keeping detected answer boundaries separate.
- Add extension icons, store screenshots, and a local privacy page with clear storage information.

This release targets clean selectable-text PDFs. AI matching and new-scan recognition are deferred. It requires no account, API key, terminal helper, or network access while reading. Public distribution is still being prepared.
