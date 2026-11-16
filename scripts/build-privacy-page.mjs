import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
assert(
  [...args].every((arg) => ["--check", "--release"].includes(arg)),
  "Use --check and/or --release",
);
const config = JSON.parse(
  await fs.readFile(path.join(root, "site/publication.json"), "utf8"),
);
const markdown = await fs.readFile(path.join(root, "PRIVACY.md"), "utf8");
const template = await fs.readFile(
  path.join(root, "site/template.html"),
  "utf8",
);
// HTML parsing normalizes CRLF to LF. Hash the same normalized inline CSS
// that the browser sees, including in Windows checkouts with core.autocrlf.
const style = (
  await fs.readFile(path.join(root, "site/public/style.css"), "utf8")
).replace(/\r\n?/g, "\n");
const mark = await fs.readFile(path.join(root, "site/public/mark.svg"), "utf8");
const escape = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function publicUrl(value, allowMail = false) {
  assert.equal(typeof value, "string");
  if (!value) return false;
  const parsed = new URL(value);
  if (allowMail && parsed.protocol === "mailto:") {
    assert(
      /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(parsed.pathname),
      "Use one public contact email",
    );
    assert(
      !parsed.search,
      "Contact email must not contain preset message text",
    );
    return true;
  }
  assert.equal(parsed.protocol, "https:", "Publication links must use HTTPS");
  assert(
    !parsed.username && !parsed.password,
    "Publication links must not contain credentials",
  );
  assert(
    !/^(localhost|127\.|0\.|10\.|192\.168\.|\[)/i.test(parsed.hostname),
    "Use a public hostname",
  );
  assert(
    !/(^|\.)(example\.(com|org|net)|localhost|local|test|invalid)$/i.test(
      parsed.hostname,
    ),
    "Replace placeholder/private hostnames",
  );
  return true;
}

const hasPolicyUrl = publicUrl(config.privacyUrl);
const hasContact = /\]\(mailto:[^)]+\)/.test(markdown);
const missing = [
  ...(!hasPolicyUrl
    ? ["hosted HTTPS privacyUrl in site/publication.json"]
    : []),
  ...(!hasContact ? ["approved public contact in PRIVACY.md"] : []),
];
if (args.has("--release")) {
  assert(
    missing.length === 0,
    `Publication is incomplete: provide ${missing.join(" and ")}, then rebuild.`,
  );
}

// This intentionally handles only the small Markdown subset used by the policy.
// Reject unsupported markup rather than silently dropping policy content.
function inline(text) {
  assert(!/[<>]/.test(text), "Raw HTML is not supported in the policy");
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return `<strong>${escape(part.slice(2, -2))}</strong>`;
      if (part.startsWith("`") && part.endsWith("`"))
        return `<code>${escape(part.slice(1, -1))}</code>`;
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        publicUrl(link[2], true);
        return `<a href="${escape(link[2])}">${escape(link[1])}</a>`;
      }
      return escape(part);
    })
    .join("");
}
let titleSeen = false;
const html = markdown
  .trim()
  .split(/\r?\n\s*\r?\n/)
  .map((block) => {
    const lines = block.split(/\r?\n/);
    if (block.startsWith("# ")) {
      assert(!titleSeen && lines.length === 1, "Policy needs one title");
      titleSeen = true;
      return `<h1 id="policy-title">${inline(block.slice(2))}</h1>`;
    }
    if (block.startsWith("## ")) {
      assert(lines.length === 1);
      return `<h2>${inline(block.slice(3))}</h2>`;
    }
    if (block.startsWith("- ")) {
      assert(
        lines.every((line) => line.startsWith("- ")),
        "Unsupported policy list",
      );
      return `<ul>\n${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join("\n")}\n</ul>`;
    }
    assert(!/^[#>]|^\*\s|^\d+\. /m.test(block), "Unsupported policy block");
    return `<p>${inline(lines.join(" "))}</p>`;
  })
  .join("\n");
assert(titleSeen, "Policy title missing");
const canonical = hasPolicyUrl
  ? `<link rel="canonical" href="${escape(config.privacyUrl)}" />`
  : "";
const rendered = template
  .replace("{{policy}}", html)
  .replace("{{style}}", style)
  .replace(
    "{{styleHash}}",
    `sha256-${createHash("sha256").update(style).digest("base64")}`,
  )
  .replaceAll("{{icon}}", `data:image/svg+xml,${encodeURIComponent(mark)}`)
  .replace("{{canonical}}", canonical);
assert(!/\{\{\w+\}\}/.test(rendered), "Unfilled privacy template field");
const target = path.join(root, "site/dist/index.html");
if (args.has("--check")) {
  assert.equal(
    await fs.readFile(target, "utf8"),
    rendered,
    "Privacy page is stale; run node scripts/build-privacy-page.mjs",
  );
  console.log("Privacy page matches PRIVACY.md and publication settings.");
} else {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, rendered);
  console.log(
    `Prepared ${path.relative(root, target)}${missing.length ? ` for local review; still needed: ${missing.join(" and ")}` : ""}.`,
  );
}
