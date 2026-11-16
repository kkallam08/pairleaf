import {
  reference,
  readReference,
  verifyFile,
  type FileLinks,
  type FileReference,
} from "./local-files";
import { importStudy } from "./backup";
import type { Match, PageText, Solution } from "./model";
import type { AnswerRange } from "./single";

export interface StudyState {
  questionName: string;
  solutionName: string;
  fingerprint: string;
  reportScope: string;
  qpages: PageText[];
  matches: Match[];
  sources: Solution[];
  singlePages: PageText[];
  singleFingerprint: string;
  answerRange?: AnswerRange;
  ocr: {
    enabled: boolean;
    first: string;
    last: string;
    questions: string;
    answers: string;
  };
  position: { page: number; offset: number };
  zoom: number;
  solutionZoom: string;
}
export interface StudyMeta {
  id: string;
  title: string;
  version: number;
  updated: number;
  questions: number;
  single: boolean;
}
export interface StudySet {
  meta: StudyMeta;
  state: StudyState;
  files: { questions: Blob; solutions?: Blob };
  links?: FileLinks;
}
let database: Promise<IDBDatabase> | undefined;
function connect() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pairleaf-library", 1);
      request.onupgradeneeded = () => {
        for (const name of ["entries", "states", "files"])
          request.result.createObjectStore(name);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Close other Pairleaf tabs and retry saving."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function completed(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("Save interrupted. Retry or export this study set."),
      );
    transaction.onerror = () => {}; // onabort carries the final transaction outcome.
  });
}
export async function listStudies(): Promise<StudyMeta[]> {
  const db = await connect();
  return (
    await result<StudyMeta[]>(
      db.transaction("entries").objectStore("entries").getAll(),
    )
  ).sort((a, b) => b.updated - a.updated);
}
type StoredFiles = StudySet["files"] | FileLinks;
export class LocalFilesError extends Error {
  constructor(
    public studyId: string,
    message: string,
  ) {
    super(message);
  }
}
async function readRecord(id: string) {
  const db = await connect();
  const tx = db.transaction(["entries", "states", "files"]);
  const [meta, state, files] = await Promise.all([
    result<StudyMeta>(tx.objectStore("entries").get(id)),
    result<StudyState>(tx.objectStore("states").get(id)),
    result<StoredFiles>(tx.objectStore("files").get(id)),
  ]);
  if (!meta || !state || !files)
    throw new Error(
      "This study set was deleted or is unavailable. Refresh the library.",
    );
  return { meta, state, files };
}
export async function readStudy(id: string): Promise<StudySet> {
  const record = await readRecord(id);
  if (!("kind" in record.files)) return { ...record, files: record.files };
  const links = record.files;
  try {
    const files =
      links.kind === "backup"
        ? (await importStudy(await readReference(links.backup))).files
        : {
            questions: await readReference(links.questions),
            solutions: links.solutions
              ? await readReference(links.solutions)
              : undefined,
          };
    return { ...record, files, links };
  } catch (error) {
    throw new LocalFilesError(
      id,
      error instanceof Error
        ? error.message
        : "Locate the original files to reopen this study.",
    );
  }
}
export async function prepareLinks(id: string) {
  const record = await readRecord(id);
  const links: FileLinks =
    "kind" in record.files
      ? record.files
      : {
          kind: "pdfs",
          questions: await reference(
            record.files.questions,
            record.state.questionName,
          ),
          ...(record.files.solutions
            ? {
                solutions: await reference(
                  record.files.solutions,
                  record.state.solutionName,
                ),
              }
            : {}),
        };
  return {
    version: record.meta.version,
    links,
    legacy: !("kind" in record.files),
  };
}
// Only replace the saved copies/references after every chosen file verifies.
export async function replaceLinks(
  id: string,
  version: number,
  links: FileLinks,
) {
  const original = await prepareLinks(id);
  if (original.version !== version || original.links.kind !== links.kind)
    throw new Error("Study changed. Reopen the library and retry linking.");
  const refs = (value: FileLinks): FileReference[] =>
    value.kind === "backup"
      ? [value.backup]
      : [value.questions, ...(value.solutions ? [value.solutions] : [])];
  const expected = refs(original.links),
    chosen = refs(links);
  if (chosen.length !== expected.length)
    throw new Error("Choose every original file.");
  for (let i = 0; i < chosen.length; i++) {
    if (!chosen[i].handle) throw new Error("Choose every original file.");
    await verifyFile(await chosen[i].handle!.getFile(), expected[i]);
    // Preserve the trusted digest, independent of caller-supplied metadata.
    chosen[i].hash = expected[i].hash;
    chosen[i].size = expected[i].size;
  }
  const db = await connect(),
    tx = db.transaction(["entries", "files"], "readwrite"),
    done = completed(tx);
  let conflict = false;
  let writeError: unknown;
  const req = tx.objectStore("entries").get(id);
  req.onsuccess = () => {
    if (!req.result || req.result.version !== version) {
      conflict = true;
      tx.abort();
      return;
    }
    try {
      tx.objectStore("files").put(links, id);
      tx.objectStore("entries").put(
        { ...req.result, version: version + 1 },
        id,
      );
    } catch (error) {
      writeError = error;
      tx.abort();
    }
  };
  try {
    await done;
  } catch (error) {
    if (conflict)
      throw new Error("Study changed. Reopen the library and retry linking.");
    throw writeError ?? error;
  }
}
export async function saveStudy(set: StudySet): Promise<number> {
  const storedFiles =
    set.links ??
    (set.meta.version === 0
      ? {
          kind: "pdfs" as const,
          questions: await reference(
            set.files.questions,
            set.state.questionName,
          ),
          ...(set.files.solutions
            ? {
                solutions: await reference(
                  set.files.solutions,
                  set.state.solutionName,
                ),
              }
            : {}),
        }
      : undefined);
  const db = await connect();
  const tx = db.transaction(["entries", "states", "files"], "readwrite");
  const done = completed(tx);
  let conflict = false;
  let writeError: unknown;
  const request = tx.objectStore("entries").get(set.meta.id);
  request.onsuccess = () => {
    const current = request.result as StudyMeta | undefined;
    if (
      (current?.version ?? 0) !== set.meta.version ||
      (!current && set.meta.version > 0)
    ) {
      conflict = true;
      tx.abort();
      return;
    }
    try {
      tx.objectStore("entries").put(
        { ...set.meta, version: set.meta.version + 1, updated: Date.now() },
        set.meta.id,
      );
      tx.objectStore("states").put(set.state, set.meta.id);
      if (!current) tx.objectStore("files").put(storedFiles, set.meta.id);
    } catch (error) {
      writeError = error;
      try {
        tx.abort();
      } catch {
        /* A failed transaction may already be aborted. */
      }
    }
  };
  try {
    await done;
  } catch (error) {
    if (conflict)
      throw new Error(
        "This set changed in another tab or was deleted. Export this session, then reopen it from the library.",
      );
    throw writeError ?? error;
  }
  return set.meta.version + 1;
}
export async function renameStudy(id: string, title: string) {
  const db = await connect();
  const tx = db.transaction("entries", "readwrite");
  const done = completed(tx);
  let writeError: unknown;
  const request = tx.objectStore("entries").get(id);
  request.onsuccess = () => {
    const current = request.result as StudyMeta | undefined;
    try {
      if (!current)
        throw new Error("This study set was deleted. Refresh the library.");
      tx.objectStore("entries").put(
        {
          ...current,
          title,
          version: current.version + 1,
          updated: Date.now(),
        },
        id,
      );
    } catch (error) {
      writeError = error;
      try {
        tx.abort();
      } catch {
        /* Already aborted. */
      }
    }
  };
  try {
    await done;
  } catch (error) {
    throw writeError ?? error;
  }
}
export async function deleteStudy(id: string) {
  const db = await connect();
  const tx = db.transaction(["entries", "states", "files"], "readwrite");
  const done = completed(tx);
  for (const name of ["entries", "states", "files"])
    tx.objectStore(name).delete(id);
  await done;
}
