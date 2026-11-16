import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

// Rasterize the existing paired-page identity; keep the SVG as the source.
const svg = await fs.readFile("public/icons/pairleaf.svg", "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    const data = await page.evaluate(
      async ({ svg, size }) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const icon = new Image();
        icon.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await icon.decode();
        canvas.getContext("2d").drawImage(icon, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { svg, size },
    );
    const png = Buffer.from(data, "base64");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    await fs.writeFile(`public/icons/icon-${size}.png`, png);
  }
  await fs.mkdir("store", { recursive: true });
  await fs.copyFile("public/icons/icon-128.png", "store/icon-128.png");
  console.log(
    "Generated 16, 32, 48 and 128px extension icons and matching store icon.",
  );
} finally {
  await browser.close();
}
