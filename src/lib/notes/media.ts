import type { NotePage, Notebook, PaperStyle } from './types';
import { newId } from './types';
import { loadAsset, saveAsset } from './storage';
import { drawElements } from './ink';
import { ensureNoteFonts } from './fonts';

export const MAX_IMPORT_BYTES = 60 * 1024 * 1024;
export const MAX_PDF_PAGES = 400;
export async function openPdf(blob: Blob) {
  // Load PDF.js as its native browser module. Rebundling its legacy runtime
  // inside Next's dev module wrapper breaks PDF.js's own module exports.
  const moduleUrl = '/notes-pdf/pdf.min.mjs';
  const pdfjs = await import(/* webpackIgnore: true */ moduleUrl) as typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/notes-pdf/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()),
    cMapUrl: '/notes-pdf/cmaps/', cMapPacked: true, standardFontDataUrl: '/notes-pdf/standard_fonts/',
    wasmUrl: '/notes-pdf/wasm/', isEvalSupported: false });
  task.onPassword = () => { void task.destroy(); };
  return task.promise;
}

type PdfDocument = Awaited<ReturnType<typeof openPdf>>;
type PdfAssetEntry = { pdf?: PdfDocument; pending?: Promise<PdfDocument>; leases: number; lastUsed: number };
const PDF_ASSET_CACHE_LIMIT = 3;
const pdfAssetCache = new Map<string, PdfAssetEntry>();
let pdfAssetClock = 0;

function pdfAssetKey(scope: string, assetId: string) { return JSON.stringify([scope, assetId]); }
function touchPdfAsset(entry: PdfAssetEntry) { entry.lastUsed = ++pdfAssetClock; }
function destroyPdfAsset(entry: PdfAssetEntry) {
  if (entry.pdf) void entry.pdf.destroy().catch(() => {});
}
function trimPdfAssetCache() {
  while (pdfAssetCache.size > PDF_ASSET_CACHE_LIMIT) {
    const candidate = [...pdfAssetCache.entries()]
      .filter(([, entry]) => entry.leases === 0)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)[0];
    if (!candidate) return;
    const [key, entry] = candidate;
    pdfAssetCache.delete(key);
    destroyPdfAsset(entry);
  }
}

/** Keeps a PDF.js document alive until the caller releases its render lease. */
export async function acquirePdfAsset(scope: string, assetId: string): Promise<{ pdf: PdfDocument; release: () => void }> {
  const key = pdfAssetKey(scope, assetId);
  let entry = pdfAssetCache.get(key);
  if (!entry) {
    entry = { leases: 0, lastUsed: ++pdfAssetClock };
    const created = entry;
    created.pending = (async () => {
      const blob = await loadAsset(scope, assetId);
      if (!blob) throw new Error('missingAsset');
      return openPdf(blob);
    })();
    void created.pending.then(pdf => {
      if (pdfAssetCache.get(key) !== created) { void pdf.destroy().catch(() => {}); return; }
      created.pdf = pdf; created.pending = undefined; touchPdfAsset(created); trimPdfAssetCache();
    }, () => { if (pdfAssetCache.get(key) === created) pdfAssetCache.delete(key); });
    pdfAssetCache.set(key, created);
    entry = created;
  }
  entry.leases += 1; touchPdfAsset(entry); trimPdfAssetCache();
  try {
    const pdf = entry.pdf ?? await entry.pending!;
    let released = false;
    return { pdf, release: () => {
      if (released) return;
      released = true;
      entry!.leases -= 1; touchPdfAsset(entry!); trimPdfAssetCache();
    } };
  } catch (error) {
    entry.leases -= 1; touchPdfAsset(entry); trimPdfAssetCache();
    throw error;
  }
}

export async function importPdf(scope: string, file: File): Promise<NotePage[]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('fileTooLarge');
  const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!header.includes('%PDF-')) throw new Error('invalidPdf');
  const pdf = await openPdf(file);
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error('tooManyPages');
    const pages: NotePage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      if (viewport.width <= 0 || viewport.height <= 0 || viewport.width > 10000 || viewport.height > 10000) throw new Error('invalidPdf');
      pages.push({ id: newId(), width: viewport.width, height: viewport.height, paper: 'plain',
        paperColor: '#ffffff', bookmarked: false, elements: [] });
      page.cleanup();
    }
    const assetId = await saveAsset(scope, file);
    return pages.map((page, pageIndex) => ({ ...page, background: { assetId, pageIndex } }));
  } finally { await pdf.destroy(); }
}

export async function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export async function importImage(scope: string, file: File) {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('fileTooLarge');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('invalidImage');
  const image = await imageFromBlob(file);
  if (image.naturalWidth * image.naturalHeight > 48000000) throw new Error('fileTooLarge');
  // Normalize orientation and bound decoded memory before retaining the asset.
  const scale = Math.min(1, 3000 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('invalidImage')), 'image/png'));
  return { assetId: await saveAsset(scope, blob), width: canvas.width, height: canvas.height };
}

export function drawPaper(ctx: CanvasRenderingContext2D, page: Pick<NotePage, 'width' | 'height' | 'paper' | 'paperColor'>) {
  const { width, height, paper, paperColor } = page;
  ctx.save(); ctx.fillStyle = paperColor; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#8b9ca433'; ctx.fillStyle = '#85999c66'; ctx.lineWidth = 0.65;
  const step = paper === 'ruled' ? 30 : 24;
  if (paper === 'dots') {
    for (let y = 36; y < height - 20; y += step) for (let x = 28; x < width - 20; x += step) {
      ctx.beginPath(); ctx.arc(x, y, 0.85, 0, Math.PI * 2); ctx.fill();
    }
  } else if (paper !== 'plain') {
    ctx.beginPath();
    for (let y = 52; y < height - 20; y += step) { ctx.moveTo(24, y); ctx.lineTo(width - 24, y); }
    if (paper === 'grid') for (let x = 28; x < width - 20; x += step) { ctx.moveTo(x, 28); ctx.lineTo(x, height - 20); }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPagePaper(ctx: CanvasRenderingContext2D, page: NotePage): void {
  const rotation = page.rotation ?? 0;
  if (!rotation) { drawPaper(ctx, page); return; }
  ctx.save();
  if (rotation === 90) ctx.translate(page.width, 0);
  else if (rotation === 180) ctx.translate(page.width, page.height);
  else ctx.translate(0, page.height);
  ctx.rotate(rotation * Math.PI / 180);
  drawPaper(ctx, { ...page, width: rotation % 180 ? page.height : page.width, height: rotation % 180 ? page.width : page.height });
  ctx.restore();
}

export async function pageImages(scope: string, page: NotePage): Promise<Record<string, HTMLImageElement>> {
  const images: Record<string, HTMLImageElement> = {};
  await Promise.all([...new Set(page.elements.flatMap(e => e.kind === 'image' ? [e.assetId] : []))].map(async id => {
    const blob = await loadAsset(scope, id);
    if (!blob) throw new Error('missingAsset');
    images[id] = await imageFromBlob(blob);
  }));
  return images;
}

export async function renderPage(scope: string, page: NotePage, targetScale = 2): Promise<HTMLCanvasElement> {
  const scale = Math.min(targetScale, Math.sqrt(12000000 / (page.width * page.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(page.width * scale); canvas.height = Math.ceil(page.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale); drawPagePaper(ctx, page);
  if (page.background) {
    const lease = await acquirePdfAsset(scope, page.background.assetId);
    let pdfPage: Awaited<ReturnType<typeof lease.pdf.getPage>> | undefined;
    try {
      pdfPage = await lease.pdf.getPage(page.background.pageIndex + 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      await pdfPage.render({ canvas, canvasContext: ctx, viewport: pdfPage.getViewport({ scale, rotation: (pdfPage.rotate + (page.rotation ?? 0)) % 360 }) }).promise;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    } finally { pdfPage?.cleanup(); lease.release(); }
  }
  await ensureNoteFonts(scope, page.elements);
  drawElements(ctx, page.elements, await pageImages(scope, page));
  return canvas;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function safeFilename(title: string) { return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 120) || 'Haven Notes'; }

export async function exportPdf(scope: string, notebook: Notebook, progress: (n: number) => void) {
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();
  output.setTitle(notebook.title); output.setCreator('Haven Notes');
  for (let i = 0; i < notebook.pages.length; i++) {
    const page = notebook.pages[i];
    const canvas = await renderPage(scope, page);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('exportFailed')), 'image/png'));
    const img = await output.embedPng(await blob.arrayBuffer());
    const pdfPage = output.addPage([page.width * .75, page.height * .75]);
    pdfPage.drawImage(img, { x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight() });
    canvas.width = 0; canvas.height = 0;
    progress(Math.round((i + 1) / notebook.pages.length * 100));
  }
  const bytes = await output.save();
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${safeFilename(notebook.title)}.pdf`);
}

export async function exportPagePng(scope: string, page: NotePage, title: string) {
  const canvas = await renderPage(scope, page);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('exportFailed')), 'image/png'));
  downloadBlob(blob, `${safeFilename(title)}.png`);
}

export const PAPER_STYLES: PaperStyle[] = ['ruled', 'grid', 'dots', 'plain'];
export const COVER_COLORS = ['#42766c', '#556c91', '#b77a64', '#9a83aa', '#bd9a55', '#45535c', '#b36e82', '#7d8760'];
