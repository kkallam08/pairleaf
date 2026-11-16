import fs from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

// Use real external files/handles, not OPFS or in-memory handle mocks. Only the
// OS chooser is substituted; trusted CDP file drops grant Chrome read access.
const known = new Map();
export async function fixturePath(fixture) {
  if (typeof fixture === "string") {
    const file = path.resolve(fixture);
    known.set(path.basename(file), file);
    return file;
  }
  const dir = path.resolve("tmp/local-file-fixtures");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, fixture.name);
  await fs.writeFile(file, fixture.buffer);
  known.set(fixture.name, file);
  return file;
}
export async function grantFiles(page, files) {
  const paths = await Promise.all(files.map(fixturePath));
  await page.evaluate(() => {
    window.testDropReady = false;
    const over = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener("dragover", over, true);
    document.addEventListener(
      "drop",
      async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const pending = [...e.dataTransfer.items].map((item) =>
          item.getAsFileSystemHandle(),
        );
        window.testHandles ??= {};
        for (const handle of await Promise.all(pending))
          window.testHandles[handle.name] = handle;
        document.removeEventListener("dragover", over, true);
        window.testDropReady = true;
      },
      { once: true, capture: true },
    );
  });
  const cdp = await page.context().newCDPSession(page);
  try {
    const data = { items: [], files: paths, dragOperationsMask: 1 };
    for (const type of ["dragEnter", "dragOver", "drop"])
      await cdp.send("Input.dispatchDragEvent", { type, x: 200, y: 200, data });
    await page.waitForFunction(() => window.testDropReady);
  } finally {
    await cdp.detach();
  }
  return paths;
}
export async function chooseFile(page, fixture, button) {
  const [file] = await grantFiles(page, [fixture]);
  await page.evaluate((name) => {
    window.showOpenFilePicker = async () => [window.testHandles[name]];
  }, path.basename(file));
  // HTML file inputs are visually hidden by the file card; invoke its click
  // handler after granting real file access, without opening an OS dialog.
  await page.locator(button).evaluate((element) => element.click());
}
export async function choosePdf(page, role, fixture) {
  await chooseFile(page, fixture, `#${role}-file`);
  await expect(page.locator(`#${role}-selection`)).toHaveText(
    typeof fixture === "string" ? path.basename(fixture) : fixture.name,
  );
}
export async function importBackup(page, fixture) {
  await chooseFile(page, fixture, "#backup-import");
}
export async function recoverFiles(page) {
  await expect
    .poll(
      async () =>
        (await page.locator(".local-files-dialog").isVisible()) ||
        !(await page.locator("#library-dialog").isVisible()),
    )
    .toBe(true);
  if (!(await page.locator(".local-files-dialog").isVisible())) return false;
  const rows = page.locator(".local-file-row");
  for (const row of await rows.all()) {
    const name = (await row.locator("p").textContent()).replace(/^[^:]+: /, "");
    const file = known.get(name);
    if (!file) throw new Error(`Unknown test fixture ${name}`);
    await grantFiles(page, [file]);
    await page.evaluate((name) => {
      window.showOpenFilePicker = async () => [window.testHandles[name]];
    }, name);
    await row.getByRole("button", { name: /Locate .* file/ }).click();
    await expect(row.getByRole("status")).toHaveText("Ready");
  }
  await page.locator(".files-apply").click();
  await expect(page.locator(".local-files-dialog")).toHaveCount(0);
  return true;
}
