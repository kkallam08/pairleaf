import type { PDFDocumentProxy } from "./pdf";
import type { RenderTask } from "pdfjs-dist";
import type { Region } from "./model";

/** At most two render jobs at a time. Leaving the viewport releases the bitmap. */
export class CanvasPool {
  private observer: IntersectionObserver;
  private entries = new Map<
    HTMLElement,
    {
      doc: PDFDocumentProxy;
      region: Region;
      scale: number;
      visible: boolean;
      canvas?: HTMLCanvasElement;
      task?: RenderTask;
      running: boolean;
      generation: number;
    }
  >();
  private active = 0;
  private disposed = false;
  constructor(root: HTMLElement) {
    this.observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          const el = change.target as HTMLElement,
            e = this.entries.get(el);
          if (!e) continue;
          e.visible = change.isIntersecting;
          if (!e.visible) this.release(el);
        }
        this.pump();
      },
      { root, rootMargin: "600px 0px" },
    );
  }
  add(el: HTMLElement, doc: PDFDocumentProxy, region: Region, scale: number) {
    el.style.width = `${region.width * scale}px`;
    el.style.height = `${region.height * scale}px`;
    this.entries.set(el, {
      doc,
      region,
      scale,
      visible: false,
      running: false,
      generation: 0,
    });
    this.observer.observe(el);
  }
  private release(el: HTMLElement) {
    const e = this.entries.get(el);
    if (!e) return;
    e.generation++;
    e.task?.cancel();
    e.task = undefined;
    if (e.canvas) {
      e.canvas.width = 0;
      e.canvas.height = 0;
      e.canvas.remove();
      e.canvas = undefined;
    }
    delete el.dataset.rendered;
  }
  private pump() {
    if (this.disposed) return;
    for (const [el, e] of this.entries) {
      if (this.active >= 2) break;
      if (!e.visible || e.running || e.canvas || el.dataset.failed) continue;
      e.running = true;
      this.active++;
      const generation = e.generation;
      void (async () => {
        const page = await e.doc.getPage(e.region.page);
        try {
          if (this.disposed || !e.visible || generation !== e.generation)
            return;
          const ratio = Math.min(devicePixelRatio || 1, 2);
          const pixelScale = Math.min(
            e.scale * ratio,
            Math.sqrt(10_000_000 / (e.region.width * e.region.height)),
          );
          const canvas = document.createElement("canvas");
          e.canvas = canvas;
          canvas.width = Math.ceil(e.region.width * pixelScale);
          canvas.height = Math.ceil(e.region.height * pixelScale);
          canvas.style.width = "100%";
          canvas.style.height = "100%";
          canvas.setAttribute(
            "aria-label",
            `Original PDF page ${e.region.page}`,
          );
          canvas.setAttribute("role", "img");
          el.append(canvas);
          e.task = page.render({
            canvas,
            viewport: page.getViewport({
              scale: pixelScale,
              offsetX: -e.region.x * pixelScale,
              offsetY: -e.region.y * pixelScale,
            }),
            background: "rgb(255,255,255)",
          });
          await e.task.promise;
          if (generation === e.generation) el.dataset.rendered = "true";
        } finally {
          page.cleanup();
        }
      })()
        .catch((error) => {
          if (
            error?.name === "RenderingCancelledException" ||
            this.disposed ||
            generation !== e.generation
          )
            return;
          this.release(el);
          el.dataset.failed = "true";
          const button = document.createElement("button");
          button.className = "render-error";
          button.textContent = "Page could not render. Retry";
          button.onclick = () => {
            button.remove();
            delete el.dataset.failed;
            this.pump();
          };
          el.append(button);
        })
        .finally(() => {
          e.running = false;
          e.task = undefined;
          this.active--;
          this.pump();
        });
    }
  }
  destroy() {
    this.disposed = true;
    this.observer.disconnect();
    for (const el of this.entries.keys()) this.release(el);
    this.entries.clear();
  }
}
