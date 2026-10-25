/** Stable stored font IDs shared by inline text, Canvas, thumbnails and exports. */
export const NOTE_FONT_IDS = ['sans', 'serif', 'mono', 'courgette', 'freehand', 'caveat', 'kalam', 'patrickhand', 'dancingscript'] as const;
export type NoteFontFamily = typeof NOTE_FONT_IDS[number] | `font:${string}`;
export interface ImportedNoteFont { id: `font:${string}`; title: string }
export const WRITING_FONTS = [
  { id: 'courgette', title: 'Courgette', file: 'Courgette-Regular.ttf' },
  { id: 'freehand', title: 'Freehand', file: 'Freehand-Regular.ttf' },
  { id: 'caveat', title: 'Caveat', file: 'Caveat.ttf' },
  { id: 'kalam', title: 'Kalam', file: 'Kalam-Regular.ttf' },
  { id: 'patrickhand', title: 'Patrick Hand', file: 'PatrickHand-Regular.ttf' },
  { id: 'dancingscript', title: 'Dancing Script', file: 'DancingScript.ttf' },
] as const;
export const validNoteFont = (value: unknown): value is NoteFontFamily => typeof value === 'string' &&
  ((NOTE_FONT_IDS as readonly string[]).includes(value) || /^font:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
const faceName = (family: NoteFontFamily) => `HavenNote_${family.replace(/[^a-z0-9]/gi, '_')}`;
export const noteFontFamily = (family?: NoteFontFamily) => family === 'serif'
  ? 'Georgia, "Noto Naskh Arabic", serif' : family === 'mono'
    ? '"IBM Plex Mono", monospace' : family && family !== 'sans' && validNoteFont(family)
      ? `"${faceName(family)}", "IBM Plex Sans Arabic", sans-serif` : '"IBM Plex Sans Arabic", Tajawal, Inter, sans-serif';
const pendingFonts = new Map<string, Promise<void>>();
export function loadNoteFont(scope: string, family: NoteFontFamily): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (['sans', 'serif', 'mono'].includes(family)) return document.fonts.load(noteFontSpec(24, { fontFamily: family }), 'English الكتابة').then(() => {});
  if (!validNoteFont(family)) return Promise.reject(new Error('invalidFont'));
  const key = `${scope}:${family}`;
  const pending = pendingFonts.get(key);
  if (pending) return pending;
  const task = (async () => {
    let source: string | ArrayBuffer;
    if (family.startsWith('font:')) {
      const { loadAsset } = await import('./storage');
      const blob = await loadAsset(scope, family.slice(5));
      if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('invalidFont');
      source = await blob.arrayBuffer();
    } else {
      const font = WRITING_FONTS.find(item => item.id === family);
      if (!font) throw new Error('invalidFont');
      source = `url("/notes-fonts/${font.file}")`;
    }
    const face = await new FontFace(faceName(family), source).load();
    document.fonts.add(face);
  })();
  pendingFonts.set(key, task);
  void task.catch(() => pendingFonts.delete(key));
  return task;
}
export async function importNoteFont(scope: string, file: File): Promise<ImportedNoteFont> {
  if (!/\.(ttf|otf)$/i.test(file.name) || file.size < 12 || file.size > 5 * 1024 * 1024) throw new Error('invalidFont');
  const buffer = await file.arrayBuffer(), header = new DataView(buffer).getUint32(0);
  if (![0x00010000, 0x4f54544f, 0x74727565].includes(header)) throw new Error('invalidFont');
  // Decode before persisting; bad font files never enter the library.
  await new FontFace('HavenFontValidation', buffer).load();
  const { saveAsset } = await import('./storage');
  const id: ImportedNoteFont['id'] = `font:${await saveAsset(scope, file)}`;
  await loadNoteFont(scope, id);
  return { id, title: file.name.replace(/\.(ttf|otf)$/i, '').slice(0, 80) };
}
export function noteFontSpec(size: number, options: { fontFamily?: NoteFontFamily; bold?: boolean; italic?: boolean } = {}): string {
  return `${options.italic ? 'italic ' : ''}${options.bold ? '700 ' : ''}${Math.max(6, size)}px ${noteFontFamily(options.fontFamily)}`;
}
export async function ensureNoteFonts(scope: string, elements: readonly { kind: string; text?: string; fontSize?: number; fontFamily?: NoteFontFamily; bold?: boolean; italic?: boolean }[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(elements.filter(element => element.kind === 'text' && element.text).map(async element => {
    await loadNoteFont(scope, element.fontFamily ?? 'sans');
    await document.fonts.load(noteFontSpec(element.fontSize ?? 22, element), element.text);
  }));
}
