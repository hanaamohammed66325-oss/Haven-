'use client';
import { useEffect, useRef, useState } from 'react';
import type { NotePage } from '@/lib/notes/types';
import { acquirePdfAsset, drawPagePaper, pageImages, renderPage } from '@/lib/notes/media';
import { InkCanvas } from './InkCanvas';
import type { ComponentProps } from 'react';
import s from './notes.module.css';
import { ensureNoteFonts } from '@/lib/notes/fonts';

type PdfStatus = 'loading' | 'ready' | 'error';

const PDF_RASTER_CACHE_LIMIT = 32 * 1024 * 1024;
// PDF operators can be costly on the main thread. Visible work goes first and
// neighboring pages never start several large renders together during a fling.
const rasterJobs: { priority: () => boolean; current: () => boolean; run: () => Promise<void>; resolve: () => void; reject: (error: unknown) => void }[] = [];
let rasterRunner = false;
function queuePageRaster(run: () => Promise<void>, priority: () => boolean, current: () => boolean): Promise<void> {
  const result = new Promise<void>((resolve, reject) => { rasterJobs.push({ run, priority, current, resolve, reject }); });
  if (!rasterRunner) {
    rasterRunner = true;
    void (async () => {
      while (rasterJobs.length) {
        rasterJobs.sort((a, b) => Number(b.priority()) - Number(a.priority()));
        const job = rasterJobs.shift()!;
        try { if (job.current()) await job.run(); job.resolve(); } catch (error) { job.reject(error); }
      }
      rasterRunner = false;
    })();
  }
  return result;
}
type PdfRaster = { canvas: HTMLCanvasElement; bytes: number };
const pdfRasterCache = new Map<string, PdfRaster>();
let pdfRasterCacheBytes = 0;

function readPdfRaster(key: string): HTMLCanvasElement | undefined {
  const entry = pdfRasterCache.get(key);
  if (!entry) return undefined;
  pdfRasterCache.delete(key);
  pdfRasterCache.set(key, entry);
  return entry.canvas;
}

function cachePdfRaster(key: string, canvas: HTMLCanvasElement): void {
  const bytes = canvas.width * canvas.height * 4;
  if (bytes > PDF_RASTER_CACHE_LIMIT) { canvas.width = 0; canvas.height = 0; return; }
  const previous = pdfRasterCache.get(key);
  if (previous) {
    pdfRasterCacheBytes -= previous.bytes;
    if (previous.canvas !== canvas) { previous.canvas.width = 0; previous.canvas.height = 0; }
    pdfRasterCache.delete(key);
  }
  pdfRasterCache.set(key, { canvas, bytes });
  pdfRasterCacheBytes += bytes;
  while (pdfRasterCacheBytes > PDF_RASTER_CACHE_LIMIT) {
    const oldest = pdfRasterCache.entries().next().value as [string, PdfRaster] | undefined;
    if (!oldest) break;
    const [oldestKey, entry] = oldest;
    pdfRasterCache.delete(oldestKey);
    pdfRasterCacheBytes -= entry.bytes;
    entry.canvas.width = 0; entry.canvas.height = 0;
  }
}

export function PageSurface({ scope, onError, renderingActive = true, loadingLabel = 'Loading PDF page…', errorLabel = 'This PDF page could not be displayed.', ...props }: Omit<ComponentProps<typeof InkCanvas>, 'images' | 'rasterScale'> & { scope: string; renderingActive?: boolean; onError: (message: string) => void; loadingLabel?: string; errorLabel?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const { page } = props;
  const fontKey = page.elements.filter(element => element.kind === 'text').map(element => JSON.stringify([element.fontFamily, element.fontSize, element.bold, element.italic, element.text])).join('|');
  const [fontRevision, setFontRevision] = useState(0);
  useEffect(() => {
    let stale = false;
    if (page.elements.some(element => element.kind === 'text')) void ensureNoteFonts(scope, page.elements).then(() => { if (!stale) setFontRevision(value => value + 1); }).catch(() => {});
    return () => { stale = true; };
    // Appending ink does not change font readiness or invalidate saved-page rendering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, fontKey]);
  // Stretch the existing bitmap during a gesture; repaint once the scale settles.
  const renderingActiveRef = useRef(renderingActive); renderingActiveRef.current = renderingActive;
  const [rasterScale, setRasterScale] = useState(renderingActive ? props.scale : Math.min(.4, props.scale));
  const [rasterPreview, setRasterPreview] = useState(!renderingActive);
  useEffect(() => {
    if (!renderingActive) return;
    const timer = window.setTimeout(() => { setRasterScale(props.scale); setRasterPreview(false); }, 150);
    return () => window.clearTimeout(timer);
  }, [props.scale, renderingActive]);
  const deviceScale = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const renderScale = Math.min(Math.max(rasterPreview ? .2 : 1, rasterScale) * deviceScale, Math.sqrt(12000000 / (page.width * page.height)));
  const renderedWidth = Math.ceil(page.width * renderScale), renderedHeight = Math.ceil(page.height * renderScale);
  const backgroundKey = page.background ? `${scope}:${page.background.assetId}:${page.background.pageIndex}:${page.rotation ?? 0}:${renderedWidth}x${renderedHeight}:${renderScale}` : '';
  const [pdfState, setPdfState] = useState<{ key: string; status: PdfStatus }>(() => ({ key: backgroundKey, status: backgroundKey ? 'loading' : 'ready' }));
  const contentKey = page.background ? `${scope}:${page.background.assetId}:${page.background.pageIndex}:${page.rotation ?? 0}` : '';
  const [displayedContent, setDisplayedContent] = useState<string | null>(null);
  const ids = props.page.elements.filter(e => e.kind === 'image').map(e => e.assetId).sort().join('|');
  const errorRef = useRef(onError); errorRef.current = onError;
  useEffect(() => {
    let stale = false;
    void pageImages(scope, props.page).then(result => { if (!stale) setImages(result); }).catch(() => { if (!stale) errorRef.current('missingAsset'); });
    return () => { stale = true; };
    // The asset list is stable while ink changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, ids]);
  useEffect(() => {
    let stale = false;
    let task: { cancel: () => void } | undefined;
    const target = canvas.current!;
    if (!page.background) {
      target.width = renderedWidth; target.height = renderedHeight;
      const ctx = target.getContext('2d')!;
      ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0); drawPagePaper(ctx, page);
      setPdfState({ key: '', status: 'ready' });
      setDisplayedContent('');
      return () => { stale = true; };
    }
    const key = backgroundKey;
    const cached = readPdfRaster(key);
    if (cached) {
      target.width = cached.width; target.height = cached.height;
      target.getContext('2d')!.drawImage(cached, 0, 0);
      setPdfState({ key, status: 'ready' });
      setDisplayedContent(contentKey);
      return () => { stale = true; };
    }
    setPdfState(current => current.key === key && current.status === 'loading' ? current : { key, status: 'loading' });
    void queuePageRaster(async () => {
      const lease = await acquirePdfAsset(scope, page.background!.assetId);
      let pdfPage: Awaited<ReturnType<typeof lease.pdf.getPage>> | undefined;
      let staged: HTMLCanvasElement | undefined, retained = false;
      try {
        if (stale) return;
        pdfPage = await lease.pdf.getPage(page.background!.pageIndex + 1);
        if (stale) return;
        staged = document.createElement('canvas');
        staged.width = renderedWidth; staged.height = renderedHeight;
        const stagedContext = staged.getContext('2d')!;
        const render = pdfPage.render({ canvas: staged, canvasContext: stagedContext, viewport: pdfPage.getViewport({ scale: renderScale, rotation: (pdfPage.rotate + (page.rotation ?? 0)) % 360 }) });
        task = render;
        render.onContinue = (continuation: () => void) => { window.setTimeout(() => { if (!stale) continuation(); }, 0); };
        await render.promise;
        if (stale) return;
        target.width = staged.width; target.height = staged.height;
        target.getContext('2d')!.drawImage(staged, 0, 0);
        cachePdfRaster(key, staged); retained = true;
        setPdfState({ key, status: 'ready' });
        setDisplayedContent(contentKey);
      } finally { if (staged && !retained) { staged.width = 0; staged.height = 0; } pdfPage?.cleanup(); lease.release(); }
    }, () => renderingActiveRef.current, () => !stale).catch(error => {
      if (stale || (error instanceof Error && error.name === 'RenderingCancelledException')) return;
      setPdfState({ key, status: 'error' });
      errorRef.current('invalidPdf');
    });
    return () => { stale = true; task?.cancel(); };
  }, [scope, contentKey, backgroundKey, page.background, page.paper, page.paperColor, page.rotation, page.width, page.height, renderScale, renderedWidth, renderedHeight]);
  useEffect(() => { const target = canvas.current; return () => { if (target) { target.width = 0; target.height = 0; } }; }, []);
  const pendingPdf = Boolean(backgroundKey) && displayedContent !== contentKey && (pdfState.key !== backgroundKey || pdfState.status === 'loading');
  const failedPdf = Boolean(backgroundKey) && pdfState.key === backgroundKey && pdfState.status === 'error';
  return <div data-havi-avoid aria-busy={pendingPdf || undefined} style={{ position: 'relative', width: props.page.width * props.scale, height: props.page.height * props.scale, flexShrink: 0, background: props.page.paperColor }}>
    <canvas ref={canvas} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
    <InkCanvas {...props} images={images} rasterScale={rasterScale} fontRevision={fontRevision} />
    {(pendingPdf || failedPdf) && <div className={s.notesPageLoadOverlay} role={failedPdf ? 'alert' : 'status'} aria-live="polite"><span className={pendingPdf ? s.notesPageLoadSpinner : ''} aria-hidden />{pendingPdf ? loadingLabel : errorLabel}</div>}
  </div>;
}

type ThumbnailJob = { order: number; priority: () => number; isCurrent: () => boolean; discard: () => void; run: () => Promise<void> };
const thumbnailJobs: ThumbnailJob[] = [];
let thumbnailOrder = 0;
let thumbnailRunner: Promise<void> | undefined;

function runThumbnailJobs(): void {
  if (thumbnailRunner) return;
  thumbnailRunner = (async () => {
    while (thumbnailJobs.length) {
      thumbnailJobs.sort((left, right) => right.priority() - left.priority() || left.order - right.order);
      const next = thumbnailJobs.shift()!;
      if (!next.isCurrent()) { next.discard(); continue; }
      try { await next.run(); } catch { /* Thumbnail failures do not interrupt later jobs. */ }
    }
  })().finally(() => { thumbnailRunner = undefined; if (thumbnailJobs.length) runThumbnailJobs(); });
}

function scheduleThumbnail(job: Omit<ThumbnailJob, 'order'>): void {
  thumbnailJobs.push({ ...job, order: thumbnailOrder++ });
  runThumbnailJobs();
}

export function PageThumbnail({ scope, page, active = false, previewWidth = 110 }: { scope: string; page: NotePage; active?: boolean; previewWidth?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const requestPaint = useRef<() => void>(() => {});
  useEffect(() => {
    const target = canvas.current!;
    let stopped = false;
    let visible = false;
    let painted = false;
    let queued = false;
    const isCurrent = () => !stopped && (activeRef.current || visible);
    const paint = () => {
      if (painted || queued || !isCurrent()) return;
      queued = true;
      scheduleThumbnail({
        priority: () => activeRef.current ? 2 : visible ? 1 : 0,
        isCurrent,
        discard: () => { queued = false; },
        run: async () => {
          queued = false;
          if (painted || !isCurrent()) return;
          const source = await renderPage(scope, page, previewWidth / page.width);
          try {
            if (!isCurrent()) return;
            target.width = source.width; target.height = source.height;
            target.getContext('2d')!.drawImage(source, 0, 0);
            painted = true;
          } finally { source.width = 0; source.height = 0; }
        },
      });
    };
    requestPaint.current = paint;
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      paint();
    });
    observer.observe(target);
    paint();
    return () => { stopped = true; if (requestPaint.current === paint) requestPaint.current = () => {}; observer.disconnect(); };
  }, [scope, page, previewWidth]);
  useEffect(() => { if (active) requestPaint.current(); }, [active]);
  return <canvas ref={canvas} aria-hidden style={{ width: '100%', aspectRatio: `${page.width}/${page.height}`, background: page.paperColor }} />;
}
