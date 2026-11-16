export interface LocalFileHandle extends FileSystemFileHandle {
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
}
export interface FileReference {
  name: string;
  size: number;
  hash: string;
  handle?: LocalFileHandle;
}
export type FileLinks =
  | { kind: "pdfs"; questions: FileReference; solutions?: FileReference }
  | { kind: "backup"; backup: FileReference };
export async function fileHash(file: Blob) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function reference(
  file: Blob,
  name: string,
  handle?: LocalFileHandle,
): Promise<FileReference> {
  return {
    name,
    size: file.size,
    hash: await fileHash(file),
    ...(handle ? { handle } : {}),
  };
}
export async function verifyFile(file: Blob, ref: FileReference) {
  if (file.size !== ref.size || (await fileHash(file)) !== ref.hash)
    throw new Error(
      `This is a different or changed file. Choose the original ${ref.name}, or open the changed PDF as a new study.`,
    );
}
export async function readReference(ref: FileReference): Promise<File> {
  if (!ref.handle) throw new Error(`Locate ${ref.name} to reopen this study.`);
  const file = await ref.handle.getFile();
  await verifyFile(file, ref);
  return file;
}
export function pickLocalFile(backup = false): Promise<LocalFileHandle[]> {
  const picker = (
    window as unknown as {
      showOpenFilePicker?: (options: unknown) => Promise<LocalFileHandle[]>;
    }
  ).showOpenFilePicker;
  if (!picker)
    return Promise.reject(
      new Error("Use Chrome's file picker to link local files."),
    );
  return picker.call(window, {
    multiple: false,
    types: [
      {
        description: backup ? "Pairleaf backup" : "PDF",
        accept: {
          [backup ? "application/octet-stream" : "application/pdf"]: [
            backup ? ".pairleaf" : ".pdf",
          ],
        },
      },
    ],
  });
}
export function pickerAvailable() {
  return "showOpenFilePicker" in window;
}
export function cancelledPicker(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
