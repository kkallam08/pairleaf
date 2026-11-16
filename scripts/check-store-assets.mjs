import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

function pngInfo(bytes) {
  assert.equal(
    bytes.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    "Expected a PNG image",
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}
const storeIcon = await fs.readFile("store/icon-128.png");
assert.equal(pngInfo(storeIcon).width, 128);
assert.equal(pngInfo(storeIcon).height, 128);
assert.deepEqual(storeIcon, await fs.readFile("public/icons/icon-128.png"));
const screenshots = (await fs.readdir("store/screenshots")).filter((name) =>
  name.endsWith(".png"),
);
assert.ok(
  screenshots.length >= 1 && screenshots.length <= 5,
  "Store accepts 1–5 screenshots",
);
for (const name of screenshots) {
  const info = pngInfo(await fs.readFile(path.join("store/screenshots", name)));
  assert.ok(
    (info.width === 1280 && info.height === 800) ||
      (info.width === 640 && info.height === 400),
    `Incorrect store dimensions: ${name}`,
  );
  assert.equal(
    info.colorType,
    2,
    `Store screenshot must be RGB without alpha: ${name}`,
  );
}
for (const name of ["LISTING.md", "SUBMISSION.md"])
  await fs.access(path.join("store", name));
const manifest = JSON.parse(await fs.readFile("public/manifest.json", "utf8"));
assert.ok(manifest.description.length <= 132);
console.log(
  `Store assets verified: matching 128px icon, ${screenshots.length} RGB screenshots, and listing/reviewer drafts. Hosting and owner declarations require separate review.`,
);
