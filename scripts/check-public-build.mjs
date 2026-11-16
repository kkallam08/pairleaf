import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const manifest = JSON.parse(await fs.readFile("dist/manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions ?? [], []);
assert.deepEqual(manifest.optional_host_permissions ?? [], []);
for (const size of [16, 32, 48, 128]) {
  const iconPath = manifest.icons?.[size];
  assert.equal(iconPath, `icons/icon-${size}.png`);
  const png = await fs.readFile(path.join("dist", iconPath));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}
for (const size of [16, 32])
  assert.equal(manifest.action.default_icon[size], manifest.icons[size]);
const privacy = await fs.readFile("dist/privacy.html", "utf8");
assert.equal(privacy, await fs.readFile("site/dist/index.html", "utf8"));
assert.doesNotMatch(
  privacy,
  /<script\b|<link\b[^>]*rel=["']stylesheet|\bsrc=["']https?:/i,
);
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
