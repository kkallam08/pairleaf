import {
  cancelledPicker,
  pickLocalFile,
  verifyFile,
  type FileLinks,
  type FileReference,
} from "./local-files";

// A fresh dialog owns each operation so cancelled asynchronous reads cannot
// update the next dialog or commit partially verified file references.
export function locateFiles(
  links: FileLinks,
  legacy: boolean,
): Promise<FileLinks | undefined> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "local-files-dialog";
    dialog.setAttribute("aria-labelledby", "local-files-title");
    dialog.innerHTML = `<h2 id="local-files-title">Locate study files</h2><p class="quiet">${legacy ? "Link the original PDFs to remove their saved browser copies. Your progress stays here." : "Choose the original files or allow access again. Your saved progress will be restored."}</p><div class="local-files-list"></div><p class="local-files-error" role="alert"></p><div class="dialog-actions"><button class="files-cancel">Cancel</button><button class="files-apply primary" disabled>Use files</button></div>`;
    const list = dialog.querySelector(".local-files-list")!;
    const apply = dialog.querySelector<HTMLButtonElement>(".files-apply")!;
    const error = dialog.querySelector(".local-files-error")!;
    const refs: [string, FileReference][] =
      links.kind === "backup"
        ? [["Backup", links.backup]]
        : [
            ["Questions", links.questions],
            ...(links.solutions
              ? [["Solutions", links.solutions] as [string, FileReference]]
              : []),
          ];
    const ready = new Set<FileReference>();
    let closed = false,
      pending = 0;
    function finish(value?: FileLinks) {
      if (closed) return;
      closed = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    }
    for (const [label, ref] of refs) {
      const row = document.createElement("div");
      row.className = "local-file-row";
      const name = document.createElement("p");
      name.textContent = `${label}: ${ref.name}`;
      const locate = document.createElement("button");
      locate.textContent = "Locate file";
      locate.setAttribute("aria-label", `Locate ${label.toLowerCase()} file`);
      const allow = document.createElement("button");
      allow.textContent = "Allow access";
      allow.setAttribute("aria-label", `Allow ${label.toLowerCase()} access`);
      allow.hidden = !ref.handle;
      const status = document.createElement("span");
      status.className = "quiet";
      status.setAttribute("role", "status");
      row.append(name, locate, allow, status);
      list.append(row);
      const check = async (choose: boolean) => {
        pending++;
        ready.delete(ref);
        status.textContent = "";
        apply.disabled = true;
        locate.disabled = allow.disabled = true;
        error.textContent = "";
        try {
          // Invoke permission prompts directly in the click gesture.
          const handle = choose
            ? (await pickLocalFile(links.kind === "backup"))[0]
            : ref.handle!;
          if (
            !choose &&
            (await handle.requestPermission({ mode: "read" })) !== "granted"
          )
            throw new Error(
              "Access was not allowed. Locate the file to try again.",
            );
          await verifyFile(await handle.getFile(), ref);
          if (closed) return;
          ref.handle = handle;
          ready.add(ref);
          status.textContent = "Ready";
        } catch (cause) {
          if (!closed && !cancelledPicker(cause))
            error.textContent =
              cause instanceof Error
                ? cause.message
                : "Could not access this file.";
        } finally {
          pending--;
          if (!closed) {
            locate.disabled = allow.disabled = false;
            apply.disabled = pending > 0 || ready.size !== refs.length;
          }
        }
      };
      locate.onclick = () => void check(true);
      allow.onclick = () => void check(false);
    }
    dialog.querySelector<HTMLButtonElement>(".files-cancel")!.onclick = () =>
      finish();
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish();
    };
    apply.onclick = () => finish(links);
    document.body.append(dialog);
    dialog.showModal();
  });
}
