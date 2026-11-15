import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const manifest = JSON.parse(await fs.readFile("dist/manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions ?? [], []);
assert.deepEqual(manifest.optional_host_permissions ?? [], []);
assert.match(
  manifest.content_security_policy.extension_pages,
  /connect-src 'self';/,
);
assert.doesNotMatch(
  manifest.content_security_policy.extension_pages,
  /https?:|localhost|127\.0\.0\.1/,
);
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
assert.deepEqual(Object.keys(pkg.dependencies), ["pdfjs-dist"]);

let bytes = 0;
const files = await fs.readdir("dist", { recursive: true });
for (const name of files) {
  const file = path.join("dist", name);
  const stat = await fs.stat(file);
  if (!stat.isFile()) continue;
  bytes += stat.size;
  assert.doesNotMatch(
    name,
    /ocr-assets|tesseract|traineddata|(^|[\\/])(server|experiments|\.env)|\.(pdf|pairleaf)$/i,
  );
  if (/\.(m?js|html|css)$/.test(name)) {
    const source = await fs.readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /127\.0\.0\.1:5182|api\.openai\.com|tesseract|traineddata|id="(?:ai-open|ai-setup|helper-code|ocr-enabled)"/i,
    );
  }
}
// PDF.js still needs its own fonts, CMaps, worker and image-decoding WASM.
for (const name of [
  "pdf-assets/cmaps",
  "pdf-assets/standard_fonts",
  "pdf-assets/wasm",
  "PDFJS-LICENSE.txt",
])
  await fs.access(path.join("dist", name));
console.log(
  `Local MVP artifact verified: ${(bytes / 1024 / 1024).toFixed(1)} MiB, no helper permissions or recognition assets.`,
);
