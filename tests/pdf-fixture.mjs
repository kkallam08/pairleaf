/** Tiny synthetic PDFs, generated in memory. No private course documents in tests. */
export function pdfFixture(lines = [], graphics = false) {
  const escape = (t) => t.replace(/[\\()]/g, "\\$&");
  const stream =
    lines
      .map(
        ([text, y]) =>
          `BT /F1 11 Tf 72 ${792 - y - 9} Td (${escape(text)}) Tj ET`,
      )
      .join("\n") + (graphics ? "\n0.5 g 72 400 200 200 re f" : "");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n",
    offsets = [0];
  for (const [i, o] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const start = Buffer.byteLength(body);
  body +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${start}\n%%EOF`;
  return {
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(body),
  };
}
