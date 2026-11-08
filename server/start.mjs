import { randomBytes } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createMatcher } from "./matching.mjs";
import { createHelper } from "./http.mjs";

if (!process.env.OPENAI_API_KEY)
  throw new Error(
    "Save OPENAI_API_KEY in .env.local before starting the helper.",
  );
const dataDirectory = fileURLToPath(new URL("../tmp/", import.meta.url));
await mkdir(dataDirectory, { recursive: true });
const lockPath = `${dataDirectory}/ai-helper.lock`;
let lock;
try {
  lock = await open(lockPath, "wx");
} catch {
  throw new Error(
    "The AI helper is already running, or a previous run left tmp/ai-helper.lock. Close the old helper before removing that lock.",
  );
}
await lock.writeFile(String(process.pid));
const code = randomBytes(12).toString("hex");
let matcher;
try {
  matcher = await createMatcher({
    apiKey: process.env.OPENAI_API_KEY,
    ledgerPath: `${dataDirectory}/ai-usage.json`,
  });
} catch {
  await lock.close();
  await unlink(lockPath);
  throw new Error(
    "The usage ledger could not be read. Check tmp/ai-usage.json before restarting.",
  );
}
const server = createHelper({ matcher, pairingCode: code });
async function stop() {
  server.close();
  await lock.close();
  await unlink(lockPath).catch(() => {});
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("error", async () => {
  console.error(
    "Could not open port 5182. Close the existing helper and retry.",
  );
  await stop();
});
server.listen(5182, "127.0.0.1", () => {
  console.log(
    `Pairleaf AI helper is ready.\nConnection code: ${code}\nUsage recorded: $${matcher.usage().toFixed(4)} of $10.00\nKeep this window open while using AI matching.`,
  );
});
