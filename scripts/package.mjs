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
