import fs from "node:fs/promises";
for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  await fs.cp(`node_modules/pdfjs-dist/${dir}`, `dist/pdf-assets/${dir}`, {
    recursive: true,
  });
}
await fs.copyFile("node_modules/pdfjs-dist/LICENSE", "dist/PDFJS-LICENSE.txt");
await fs.copyFile("THIRD_PARTY_NOTICES.txt", "dist/THIRD_PARTY_NOTICES.txt");
console.log(
  "Loadable extension: dist/ (worker, fonts, CMaps and WASM included).",
);
await fs.mkdir("dist/ocr-assets", { recursive: true });
await fs.copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  "dist/ocr-assets/worker.min.js",
);
for (const name of [
  "worker.min.js.LICENSE.txt",
  "tesseract.min.js.LICENSE.txt",
])
  await fs.copyFile(
    `node_modules/tesseract.js/dist/${name}`,
    `dist/ocr-assets/${name}`,
  );
for (const file of await fs.readdir("node_modules/tesseract.js-core")) {
  if (
    file.includes("lstm") &&
    (file.endsWith(".wasm.js") || file.endsWith(".wasm"))
  )
    await fs.copyFile(
      `node_modules/tesseract.js-core/${file}`,
      `dist/ocr-assets/${file}`,
    );
}
await fs.copyFile(
  "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz",
  "dist/ocr-assets/eng.traineddata.gz",
);
await fs.copyFile(
  "node_modules/tesseract.js/LICENSE.md",
  "dist/ocr-assets/TESSERACT-LICENSE.txt",
);
await fs.copyFile(
  "node_modules/tesseract.js-core/LICENSE",
  "dist/ocr-assets/CORE-LICENSE.txt",
);
