import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createMatcher, validateResult } from "../server/matching.mjs";
import { createHelper } from "../server/http.mjs";
const body = {
  question: { key: "q", label: "1", text: "Describe evaporation." },
  candidates: [{ key: "s", label: "8", text: "Liquid water becomes vapor." }],
};
const reply = {
  candidateKey: "s",
  confidence: "supported",
  evidence: "Same physical process",
};
test("rejects invented sources, charges successful requests, caches and restores usage", async () => {
  assert.throws(() =>
    validateResult({ ...reply, candidateKey: "invented" }, body.candidates),
  );
  const dir = await mkdtemp("tmp/helper-check-");
  let calls = 0;
  const options = {
    apiKey: "test",
    ledgerPath: `${dir}/usage.json`,
    fetchImpl: async () => {
      calls++;
      return Response.json({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 20 },
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(reply) }] },
        ],
      });
    },
  };
  const matcher = await createMatcher(options);
  await matcher.match(body, new AbortController().signal);
  await matcher.match(body, new AbortController().signal);
  assert.equal(calls, 1);
  assert.ok((await createMatcher(options)).usage() > 0);
  const ledger = JSON.parse(await readFile(options.ledgerPath));
  assert.equal(ledger.usedUSD, 0.00002);
  await writeFile(options.ledgerPath, JSON.stringify({ usedUSD: 9.99999 }));
  await assert.rejects(
    (await createMatcher(options)).match(body, new AbortController().signal),
    /limit/,
  );
  assert.equal(calls, 1);
});
test("helper rejects wrong origin, code and oversized bodies", async () => {
  let calls = 0;
  const server = createHelper({
    pairingCode: "test-code",
    matcher: {
      match: async () => {
        calls++;
        return reply;
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/match`;
  const send = (origin, code, payload = body) =>
    fetch(url, {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${code}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  try {
    assert.equal((await send("https://example.com", "test-code")).status, 403);
    assert.equal(
      (await send("chrome-extension://" + "a".repeat(32), "wrong")).status,
      401,
    );
    assert.equal(
      (
        await send("chrome-extension://" + "a".repeat(32), "test-code", {
          text: "x".repeat(260000),
        })
      ).status,
      413,
    );
    assert.equal(
      (await send("chrome-extension://" + "a".repeat(32), "test-code")).status,
      200,
    );
    assert.equal(
      (await send("chrome-extension://" + "b".repeat(32), "test-code")).status,
      403,
    );
    assert.equal(calls, 1);
  } finally {
    server.close();
  }
});
