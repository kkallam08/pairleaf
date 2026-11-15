import {
  getDocument,
  GlobalWorkerOptions,
  Util,
  OPS,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import type { PageText } from "./model";
GlobalWorkerOptions.workerSrc = workerUrl;
export type { PDFDocumentProxy, PDFDocumentLoadingTask };
export function openPdf(data: Uint8Array) {
  const base = new URL("./pdf-assets/", location.href).href;
  return getDocument({
    data,
    cMapUrl: base + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: base + "standard_fonts/",
    wasmUrl: base + "wasm/",
    useSystemFonts: false,
  });
}
export async function extractPages(
  doc: PDFDocumentProxy,
  progress: (n: number) => void,
  cancelled: () => boolean,
): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (cancelled()) throw new Error("Pairing cancelled");
    const page = await doc.getPage(n),
      vp = page.getViewport({ scale: 1 }),
      content = await page.getTextContent();
    if (vp.rotation !== 0)
      throw new Error(
        "Rotated pages are not supported by this matching profile. Select a PDF with upright pages.",
      );
    const items = content.items
      .filter((i) => "str" in i && i.str.trim())
      .map((i) => {
        if (!("str" in i)) throw new Error("Unexpected text item");
        const t = Util.transform(vp.transform, i.transform),
          size = Math.hypot(t[2], t[3]),
          style = content.styles[i.fontName];
        return {
          text: i.str,
          x: t[4],
          y: t[5] - size * (style.ascent ?? 0.8),
          bottom: t[5] - size * (style.descent ?? -0.2),
          baseline: t[5],
          width: i.width,
          height: size,
          font: i.fontName,
        };
      });
    const paintOps = new Set(
      Object.entries(OPS)
        .filter(([key]) =>
          /^(paint|constructPath|stroke$|fill$|eoFill$|fillStroke$|shadingFill$|rawFillPath$)/.test(
            key,
          ),
        )
        .map(([, value]) => value),
    );
    const textlessGraphics =
      items.length === 0 &&
      (await page.getOperatorList()).fnArray.some((op) => paintOps.has(op));
    pages.push({
      page: n,
      width: vp.width,
      height: vp.height,
      items,
      textlessGraphics,
    });
    page.cleanup();
    progress(n);
    if (n % 5 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return pages;
}
