import fs from "node:fs/promises";
import path from "node:path";
import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
const paths = process.argv.slice(2);
await fs.mkdir("tmp", { recursive: true });
for (const [index, file] of paths.entries()) {
  const doc = await getDocument({
    data: new Uint8Array(await fs.readFile(file)),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n),
      vp = page.getViewport({ scale: 1 }),
      content = await page.getTextContent();
    pages.push({
      page: n,
      width: vp.width,
      height: vp.height,
      items: content.items
        .filter((i) => "str" in i && i.str.trim())
        .map((i) => {
          const t = Util.transform(vp.transform, i.transform),
            style = content.styles[i.fontName],
            size = Math.hypot(t[2], t[3]);
          return {
            text: i.str,
            x: t[4],
            y: t[5] - size * (style.ascent ?? 0.8),
            bottom: t[5] - size * (style.descent ?? -0.2),
            baseline: t[5],
            width: i.width,
            height: size,
            font: i.fontName,
            family: style.fontFamily,
          };
        }),
    });
    page.cleanup();
  }
  await fs.writeFile(
    `tmp/${index === 0 ? "questions" : "solutions"}-raw.json`,
    JSON.stringify(pages),
  );
  console.log(path.basename(file), doc.numPages, "pages");
  const sample = index === 0 ? [22, 23, 24] : [5, 6, 8];
  for (const n of sample)
    console.log(
      "PAGE",
      n,
      JSON.stringify(
        pages[n - 1].items.filter((i) =>
          /\d+\.\d+\.\d+|Problems|Solutions|Section|Chapter/.test(i.text),
        ),
      ),
    );
  await doc.loadingTask.destroy();
}
