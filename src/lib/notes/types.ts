import type { NoteFontFamily } from './fonts';
export type PaperStyle = 'plain' | 'ruled' | 'grid' | 'dots';
export const NOTE_SCROLL_DIRECTIONS = ['vertical', 'horizontal'] as const;
export type NoteScrollDirection = typeof NOTE_SCROLL_DIRECTIONS[number];
export const noteScrollDirection = (value: unknown): NoteScrollDirection => value === 'horizontal' ? 'horizontal' : 'vertical';
export const DEFAULT_NOTE_ZOOM_LIMITS = { min: .35, max: 5 } as const;
export const NOTE_ZOOM_LIMIT_RANGE = { min: .1, max: 8 } as const;
export interface NoteZoomLimits { min: number; max: number }
export function noteZoomLimits(value: unknown): NoteZoomLimits {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { min, max } = value as Partial<NoteZoomLimits>;
    if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max)
      && min >= NOTE_ZOOM_LIMIT_RANGE.min && max <= NOTE_ZOOM_LIMIT_RANGE.max && min < max) return { min, max };
  }
  return DEFAULT_NOTE_ZOOM_LIMITS;
}
export const NOTE_SHAPES = ['line', 'arrow', 'triangle', 'square', 'rectangle', 'circle', 'ellipse', 'polygon', 'diamond', 'pentagon', 'star'] as const;
export type NoteShapeTool = typeof NOTE_SHAPES[number];
export type DrawingTool = 'pen' | 'pencil' | 'highlighter' | NoteShapeTool;
export type NoteTool = DrawingTool | 'eraser' | 'lasso' | 'text' | 'hand';
export type PenStyle = 'fountain' | 'ball' | 'brush';
export interface InkTuning {
  style: PenStyle; smoothing: number; streamline: number; pressureSensitivity: number;
  tipSharpness: number; tipFlatness: number; speedSensitivity: number; response?: number;
}
export interface HighlighterTuning { stabilization: number; opacity: number; straight: boolean; response?: number }
export type ShapeHoldTool = 'pen' | 'pencil' | 'highlighter';
export interface ShapeHoldSetting { enabled: boolean; delayMs: number }
export type EraserMode = 'precision' | 'standard' | 'stroke';
export interface EraserSettings {
  mode: EraserMode; size: number;
  convertedText?: 'word' | 'line';
  scratchEnabled?: boolean;
  scratchMode?: 'strike' | 'scribble';
  targets: { pen: boolean; pencil: boolean; highlighter: boolean; shapes: boolean };
  autoDeselect: boolean; ignoreStylus: boolean;
}
export interface InkPoint { x: number; y: number; p: number; t: number; angle?: number }
/** Linear transform about the element's intrinsic center, before rotation. */
export type NoteTransform = [number, number, number, number];
export interface InkStroke {
  id: string; kind: 'stroke'; tool: DrawingTool; color: string; width: number;
  points: InkPoint[]; pressure: boolean; rotation?: number; transform?: NoteTransform;
  fillColor?: string; fillOpacity?: number; cornerRadius?: number; groupId?: string;
  tuning?: InkTuning;
  renderer?: 2 | 3 | 4;
  /** Explicit fitted path; coordinates share the stroke's point/transform space. */
  shapePath?: { closed: boolean };
  nibAngle?: number;
  highlight?: HighlighterTuning;
  transformOrigin?: [number, number];
}
export interface NoteText {
  id: string; kind: 'text'; x: number; y: number; w: number; h: number;
  text: string; fontSize: number; color: string; rotation?: number; transform?: NoteTransform; groupId?: string;
  fontFamily?: NoteFontFamily; bold?: boolean; italic?: boolean;
  sourceInk?: InkStroke[];
  handwritingTool?: 'pen' | 'pencil';
  underline?: boolean; strikethrough?: boolean; alignment?: 'auto' | 'left' | 'center' | 'right'; lineSpacing?: number;
}
export interface NoteImage {
  id: string; kind: 'image'; assetId: string; x: number; y: number; w: number; h: number; rotation?: number; transform?: NoteTransform; groupId?: string;
}
export type NoteElement = InkStroke | NoteText | NoteImage;
export interface NotePage {
  id: string; width: number; height: number; paper: PaperStyle; paperColor: string;
  rotation?: 0 | 90 | 180 | 270;
  background?: { assetId: string; pageIndex: number };
  elements: NoteElement[]; bookmarked: boolean;
  outlineTitle?: string;
}
export interface NoteDocumentSettings {
  locked: boolean;
  stylusPressure?: boolean;
  drawWithFinger?: boolean;
  palmRejection?: boolean;
  showStatusBar?: boolean;
  pullToAddPage?: boolean;
  autoAdvanceZoom?: boolean;
  autoScreenLock?: boolean;
  hoverPreview?: boolean;
  toolbarTools?: NoteTool[];
  showImageTool?: boolean;
  showPageNumbers: boolean;
  toolbarPosition: 'top' | 'bottom' | 'left' | 'right';
  sidebarPosition: 'start' | 'end';
  undoRedoPosition: 'header' | 'toolbar';
}
export const DEFAULT_NOTE_DOCUMENT_SETTINGS: NoteDocumentSettings = {
  locked: false, stylusPressure: true, drawWithFinger: false, palmRejection: false, showStatusBar: true, pullToAddPage: false, autoAdvanceZoom: true, autoScreenLock: true, hoverPreview: true, toolbarTools: ['pen', 'pencil', 'highlighter', 'eraser', 'lasso', 'text', 'line'], showImageTool: true, showPageNumbers: true, toolbarPosition: 'top', sidebarPosition: 'start', undoRedoPosition: 'header',
};
export interface Notebook {
  id: string; folderId: string | null; title: string; color: string;
  dividerId?: string;
  kind?: 'lecture' | 'note';
  cover: 'linen' | 'minimal' | 'arch' | 'none'; pages: NotePage[];
  scrollDirection?: NoteScrollDirection;
  zoomLimits?: NoteZoomLimits;
  documentSettings?: NoteDocumentSettings;
  pageTrash?: { page: NotePage; index: number; deletedAt: number }[];
  createdAt: number; updatedAt: number; deletedAt: number | null; starred: boolean;
}
export interface NoteFolder {
  id: string; parentId: string | null; title: string; color: string; courseId: string | null;
  dividerId?: string;
  promptAtClass?: boolean;
}
export interface NoteDivider { id: string; title: string; createdAt: number }
export interface NotesLibrary {
  schema: 1; revision: number; folders: NoteFolder[]; notebooks: Notebook[]; dividers?: NoteDivider[];
}
export const newId = (): string => {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  if (typeof source?.getRandomValues !== 'function') throw new Error('Secure identifiers are unavailable.');
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const emptyLibrary = (): NotesLibrary => ({ schema: 1, revision: 0, folders: [], notebooks: [] });
export function newPage(paper: PaperStyle = 'ruled', paperColor = '#fffef9'): NotePage {
  return { id: newId(), width: 794, height: 1123, paper, paperColor, elements: [], bookmarked: false };
}
export function newNotebook(title: string, folderId: string | null = null, color = '#42766c', paper: PaperStyle = 'ruled', scrollDirection: NoteScrollDirection = 'vertical'): Notebook {
  const now = Date.now();
  return { id: newId(), title, folderId, color, cover: 'none', pages: [newPage(paper)], scrollDirection: noteScrollDirection(scrollDirection), createdAt: now, updatedAt: now, deletedAt: null, starred: false };
}
