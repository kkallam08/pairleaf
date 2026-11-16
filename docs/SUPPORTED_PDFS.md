# Supported PDFs

Pairleaf starts with upright, selectable-text PDFs in a single column, with consistently numbered questions such as `1.`, `1)`, or `1.1.1`. Chapter and exercise labels can distinguish repeated numbers. Subparts remain with the whole numbered question.

Use either separate question and solution PDFs, or one PDF containing a contiguous answer section after the question pages. In single-PDF mode, confirm or correct the proposed answer range using PDF page numbers, which can differ from the printed numbers.

Matching uses document structure and identifiers. The same number can refer to unrelated questions, so inspect the source when something looks wrong. **Review matches → All questions** lets you inspect automatic matches as well as unresolved ones. Use **Review solution**, **Preview answer**, and **Confirm choice** to change a detected assignment. An undetected question will not appear in the counts.

Solutions use original PDF regions, preserving their text, formulas, and diagrams. Page edges are retained on continuations to avoid cutting off content; headers, footers, blank strips, or endmatter can remain in a reveal. Unusual layouts can still produce incomplete regions. Source-region editing is not available in this version.

Scans, handwriting, rotated or password-protected PDFs, and complex column layouts are outside this release. Previously saved recognition results can reopen, but new scans cannot be processed. The reader displays pages as images; PDF text selection, active links, printing, and screen-reader access to the full document text are not implemented. Controls support keyboard navigation.

See [Validation results](../RESULTS.md) for the checked documents and browser versions. The benchmark does not establish accuracy on every PDF. Pairleaf reveals existing solutions; it does not generate answers or verify their correctness.
