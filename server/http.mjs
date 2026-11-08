import http from "node:http";
import { timingSafeEqual } from "node:crypto";

export function createHelper({ matcher, pairingCode }) {
  let pairedOrigin;
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin ?? "";
    const allowed =
      /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
      origin === "http://127.0.0.1:5181";
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    if (
      !allowed ||
      (pairedOrigin && origin !== pairedOrigin) ||
      !/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? "")
    )
      return send(403, { error: "This origin is not paired with the helper." });
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.writeHead(204);
      res.end();
      return;
    }
    const received = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${pairingCode}`);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      return send(401, {
        error: "Enter the connection code shown by the local helper.",
      });
    pairedOrigin = origin;
    if (req.method !== "POST" || req.url !== "/match")
      return send(404, { error: "Unknown endpoint." });
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return send(415, { error: "Expected JSON." });
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 250000) {
          send(413, { error: "The excerpts are too large." });
          return;
        }
        chunks.push(chunk);
      }
      const result = await matcher.match(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        controller.signal,
      );
      if (!res.destroyed) send(200, result);
    } catch (error) {
      // Provider bodies and headers never reach the browser or logs.
      if (!res.destroyed)
        send(400, {
          error:
            error instanceof SyntaxError
              ? "Invalid request JSON."
              : error.name === "AbortError" || error.name === "TimeoutError"
                ? "AI check stopped or timed out."
                : error.message,
        });
    }
  });
}
