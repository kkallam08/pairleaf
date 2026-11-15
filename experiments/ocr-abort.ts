/** Worker termination can leave Tesseract jobs pending; detach our UI wait. */
export async function abortable<T>(
  job: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let stop: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    stop = () => reject(new DOMException("OCR stopped", "AbortError"));
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
  });
  try {
    return await Promise.race([job, cancelled]);
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
