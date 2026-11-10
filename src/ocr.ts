import { createWorker, OEM, PSM } from "tesseract.js";
import type { PDFDocumentProxy } from "./pdf";
import type { PageText, TextSpan } from "./model";
import { readMarginLabels, type GlyphBank } from "./ocr-labels";
import { abortable } from "./ocr-abort";

export async function readScannedPages(
  doc: PDFDocumentProxy,
  pages: number[],
  columns: number,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<PageText[]> {
  const base = new URL("./ocr-assets/", location.href).href;
  const glyphs: GlyphBank = new Map();
  const starting = createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: base + "worker.min.js",
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    cacheMethod: "none",
    // Job promises already reject; the library's default also throws globally.
    errorHandler: () => {},
  });
  // Cancellation during model initialization also terminates the worker once ready.
  void starting.then(
    (worker) => {
      if (signal.aborted) void worker.terminate();
    },
    () => {},
  );
  const worker = await abortable(starting, signal);
  const stop = () => {
    void worker.terminate();
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    await abortable(
      worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        user_defined_dpi: "200",
      }),
      signal,
    );
    const result: PageText[] = [];
    for (const [index, n] of pages.entries()) {
      signal.throwIfAborted();
      progress(`Reading scanned page ${n} (${index + 1} of ${pages.length})`);
      const page = await doc.getPage(n);
      const original = page.getViewport({ scale: 1 });
      const factor = 2200 / original.height;
      const viewport = page.getViewport({ scale: factor });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const output: PageText = {
        page: n,
        width: original.width,
        height: original.height,
        items: [],
        ocrColumns: [],
      };
      try {
        const rendering = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        const cancelRender = () => rendering.cancel();
        signal.addEventListener("abort", cancelRender, { once: true });
        try {
          await rendering.promise;
          signal.throwIfAborted();
        } finally {
          signal.removeEventListener("abort", cancelRender);
        }
        for (let column = 0; column < columns; column++) {
          const left = Math.floor((canvas.width * column) / columns);
          const right = Math.floor((canvas.width * (column + 1)) / columns);
          const crop = document.createElement("canvas");
          crop.width = right - left;
          crop.height = canvas.height;
          const ctx = crop.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(
            canvas,
            left,
            0,
            crop.width,
            crop.height,
            0,
            0,
            crop.width,
            crop.height,
          );
          const pixels = ctx.getImageData(0, 0, crop.width, crop.height);
          let data;
          try {
            ({ data } = await abortable(
              worker.recognize(crop, {}, { blocks: true, text: true }),
              signal,
            ));
          } finally {
            crop.width = crop.height = 0;
          }
          const items: TextSpan[] = [];
          let lineId = 0;
          for (const block of data.blocks ?? [])
            for (const paragraph of block.paragraphs)
              for (const line of paragraph.lines) {
                lineId++;
                for (const word of line.words) {
                  const b = word.bbox;
                  let ink = 0,
                    blue = 0;
                  for (
                    let y = Math.max(0, b.y0);
                    y < Math.min(pixels.height, b.y1);
                    y++
                  )
                    for (
                      let x = Math.max(0, b.x0);
                      x < Math.min(pixels.width, b.x1);
                      x++
                    ) {
                      const i = (y * pixels.width + x) * 4;
                      const [r, g, v] = pixels.data.subarray(i, i + 3);
                      if (r < 180 || g < 180 || v < 180) {
                        ink++;
                        if (v > r + 40 && g > r + 35) blue++;
                      }
                    }
                  items.push({
                    text: word.text,
                    x: (left + b.x0) / factor,
                    y: b.y0 / factor,
                    bottom: b.y1 / factor,
                    baseline: b.y1 / factor,
                    width: (b.x1 - b.x0) / factor,
                    height: (b.y1 - b.y0) / factor,
                    font: "ocr",
                    confidence: word.confidence,
                    coloredLabel: ink > 0 && blue / ink > 0.6,
                    line: lineId,
                  });
                }
              }
          const numbered = items.filter(
            (w) =>
              w.coloredLabel &&
              /^\d{1,3}$/.test(w.text) &&
              w.y > original.height * 0.055,
          );
          const lane = Math.min(...numbered.map((w) => w.x));
          const laneWords = items.filter(
            (w) =>
              w.coloredLabel &&
              Math.abs(w.x - lane) < 28 / factor &&
              w.y > original.height * 0.055,
          );
          const unread = laneWords.filter((w) => !/^\d{1,3}$/.test(w.text));
          if (unread.length) {
            const high = document.createElement("canvas");
            const highViewport = page.getViewport({ scale: factor * 1.5 });
            high.width = Math.ceil(highViewport.width);
            high.height = Math.ceil(highViewport.height);
            const detail = document.createElement("canvas");
            try {
              const rendering = page.render({
                canvas: high,
                canvasContext: high.getContext("2d")!,
                viewport: highViewport,
              });
              const cancel = () => rendering.cancel();
              signal.addEventListener("abort", cancel, { once: true });
              try {
                await rendering.promise;
                signal.throwIfAborted();
              } finally {
                signal.removeEventListener("abort", cancel);
              }
              detail.width = Math.floor(high.width / columns);
              detail.height = high.height;
              detail
                .getContext("2d")!
                .drawImage(
                  high,
                  Math.floor((column * high.width) / columns),
                  0,
                  detail.width,
                  detail.height,
                  0,
                  0,
                  detail.width,
                  detail.height,
                );
              const retry = await abortable(
                worker.recognize(detail, {}, { blocks: true }),
                signal,
              );
              for (const block of retry.data.blocks ?? [])
                for (const paragraph of block.paragraphs)
                  for (const line of paragraph.lines)
                    for (const number of line.words) {
                      const nearby = unread.find(
                        (w) =>
                          Math.abs(w.y - number.bbox.y0 / (factor * 1.5)) <
                            w.height / 2 &&
                          Math.abs(
                            w.x -
                              (number.bbox.x0 / (factor * 1.5) + left / factor),
                          ) < w.height,
                      );
                      if (nearby && /^\d{1,3}$/.test(number.text)) {
                        nearby.text = number.text;
                        nearby.confidence = number.confidence;
                      }
                    }
            } finally {
              high.width = high.height = detail.width = detail.height = 0;
            }
          }
          const margin = readMarginLabels(
            pixels,
            items
              .filter((w) => w.coloredLabel)
              .map((w) => ({
                text: w.text,
                confidence: w.confidence ?? 0,
                x0: w.x * factor - left,
                y0: w.y * factor,
                x1: (w.x + w.width) * factor - left,
                y1: w.bottom * factor,
              })),
            glyphs,
          );
          for (const label of margin.labels) {
            const y = label.y0 / factor,
              x = (left + label.x0) / factor;
            const existing = items.find(
              (w) =>
                w.coloredLabel &&
                Math.abs(w.y - y) < w.height &&
                Math.abs(w.x - x) < w.height,
            );
            if (existing) {
              existing.text = label.text;
              continue;
            }
            items.push({
              text: label.text,
              x,
              y,
              bottom: label.y1 / factor,
              baseline: label.y1 / factor,
              width: (label.x1 - label.x0) / factor,
              height: (label.y1 - label.y0) / factor,
              font: "ocr",
              coloredLabel: true,
              line: ++lineId,
            });
          }
          // Place answer boundaries in the white gap above each printed label.
          // Fixed padding can cut a preceding fraction's denominator.
          const rowInk = Array.from({ length: pixels.height }, (_, y) => {
            let ink = 0;
            for (let x = 0; x < pixels.width; x++) {
              const i = (y * pixels.width + x) * 4;
              if (
                Math.min(
                  pixels.data[i],
                  pixels.data[i + 1],
                  pixels.data[i + 2],
                ) < 180
              )
                ink++;
            }
            return ink;
          });
          for (const word of items.filter(
            (w) => w.coloredLabel && /^\d{1,3}$/.test(w.text),
          )) {
            // A numerator can begin above the label. Search above overlapping
            // words, rather than choosing a gap inside that fraction.
            const upper = Math.min(
              word.y,
              ...items
                .filter(
                  (w) =>
                    w.x > word.x &&
                    w.y >= word.y - word.height * 1.4 &&
                    w.bottom >= word.y,
                )
                .map((w) => w.y),
            );
            const end = Math.floor(upper * factor),
              limit = Math.max(
                0,
                Math.floor((word.y - word.height * 1.4) * factor),
              );
            for (let y = end - 1; y >= limit; y--)
              if (rowInk[y] <= 3) {
                const gapEnd = y;
                while (y > limit && rowInk[y - 1] <= 3) y--;
                word.boundaryTop = (y + gapEnd) / 2 / factor;
                break;
              }
          }
          output.items.push(...items);
          output.ocrColumns!.push({
            x: left / factor,
            width: (right - left) / factor,
            items,
            labelX: (left + margin.lane) / factor,
            labelTolerance: 28 / factor,
          });
        }
        result.push(output);
      } finally {
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
    }
    return result;
  } finally {
    signal.removeEventListener("abort", stop);
    await worker.terminate();
  }
}
