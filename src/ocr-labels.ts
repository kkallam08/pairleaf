interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface ReadLabel extends Box {
  text: string;
  confidence: number;
}
export type GlyphBank = Map<string, number[][]>;

/** Recover omitted margin labels using the same document's reliably read typeface. */
export function readMarginLabels(
  pixels: ImageData,
  known: ReadLabel[],
  bank: GlyphBank,
) {
  const width = Math.ceil(pixels.width * 0.2),
    height = pixels.height;
  const blue = (x: number, y: number) => {
    const i = (y * pixels.width + x) * 4;
    return (
      pixels.data[i + 2] > pixels.data[i] + 40 &&
      pixels.data[i + 1] > pixels.data[i] + 35
    );
  };
  const mask = new Uint8Array(width * height);
  for (let y = Math.floor(height * 0.055); y < height * 0.96; y++)
    for (let x = 0; x < width; x++) if (blue(x, y)) mask[y * width + x] = 1;
  const parts: Box[] = [];
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const queue = [index];
    mask[index] = 0;
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head],
        x = current % width,
        y = Math.floor(current / width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          next = ny * width + nx;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[next]) {
          mask[next] = 0;
          queue.push(next);
        }
      }
    }
    if (queue.length >= 12 && y1 - y0 >= 8 && y1 - y0 <= 45 && x1 - x0 <= 45)
      parts.push({ x0, y0, x1, y1 });
  }
  const lane = Math.min(...parts.map((p) => p.x0));
  const groups: (Box & { digits: Box[] })[] = [];
  for (const part of parts
    .filter((p) => p.x0 <= lane + 28)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const row = groups.find(
      (p) =>
        Math.abs(p.y0 - part.y0) < 6 &&
        part.x0 <= p.x1 + 12 &&
        part.x1 >= p.x0 - 12,
    );
    if (row) {
      row.x0 = Math.min(row.x0, part.x0);
      row.x1 = Math.max(row.x1, part.x1);
      row.y0 = Math.min(row.y0, part.y0);
      row.y1 = Math.max(row.y1, part.y1);
      row.digits.push(part);
    } else groups.push({ ...part, digits: [part] });
  }
  const shape = (b: Box) =>
    Array.from({ length: 16 * 24 }, (_, i) => {
      const x = b.x0 + (((i % 16) + 0.5) * (b.x1 - b.x0)) / 16;
      const y = b.y0 + ((Math.floor(i / 16) + 0.5) * (b.y1 - b.y0)) / 24;
      return blue(Math.floor(x), Math.floor(y)) ? 1 : 0;
    });
  for (const box of groups) {
    box.digits.sort((a, b) => a.x0 - b.x0);
    const read = known.find(
      (w) =>
        w.confidence >= 65 &&
        /^\d{1,3}$/.test(w.text) &&
        Math.abs(w.x0 - box.x0) < 4 &&
        Math.abs(w.y0 - box.y0) < 4 &&
        w.text.length === box.digits.length,
    );
    if (!read) continue;
    box.digits.forEach((digit, i) => {
      const samples = bank.get(read.text[i]) ?? [];
      // Bound memory and retain several scan variations of each digit.
      if (samples.length < 12) samples.push(shape(digit));
      bank.set(read.text[i], samples);
    });
  }
  const labels: (Box & { text: string })[] = [];
  for (const box of groups) {
    let text = "";
    for (const digit of box.digits) {
      const sample = shape(digit);
      const scores = [...bank]
        .map(([text, variants]) => ({
          text,
          error: Math.min(
            ...variants.map(
              (v) =>
                v.reduce(
                  (sum, value, i) => sum + Math.abs(value - sample[i]),
                  0,
                ) / sample.length,
            ),
          ),
        }))
        .sort((a, b) => a.error - b.error);
      if (
        scores.length < 2 ||
        scores[0].error > 0.2 ||
        scores[1].error - scores[0].error < 0.035
      ) {
        text = "";
        break;
      }
      text += scores[0].text;
    }
    if (/^\d{1,3}$/.test(text))
      labels.push({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, text });
  }
  return { labels, lane };
}
