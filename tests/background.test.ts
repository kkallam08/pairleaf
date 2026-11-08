import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
it("the toolbar action opens an extension-owned reader tab", () => {
  let listener: () => void = () => {};
  const create = vi.fn();
  vm.runInNewContext(readFileSync("public/background.js", "utf8"), {
    chrome: {
      action: {
        onClicked: { addListener: (fn: () => void) => (listener = fn) },
      },
      tabs: { create },
      runtime: { getURL: (s: string) => `chrome-extension://test/${s}` },
    },
  });
  listener();
  expect(create).toHaveBeenCalledWith({
    url: "chrome-extension://test/index.html",
  });
});
