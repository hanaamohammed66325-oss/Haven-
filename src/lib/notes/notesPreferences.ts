import { noteScrollDirection, type EraserSettings, type HighlighterTuning, type InkTuning, type NoteScrollDirection, type PaperStyle, type PenStyle, type ShapeHoldTool, type ShapeHoldSetting } from './types';
import { validNoteFont, type ImportedNoteFont } from './fonts';
import { DEFAULT_HANDWRITING, type HandwritingSettings } from './handwriting';

const keyFor = (scope: string) => `haven-notes-preferences:${scope}`;

export interface NotesPreferences {
  importedFonts?: ImportedNoteFont[];
  fontOrder?: string[];
  handwriting?: HandwritingSettings;
  scrollDirection: NoteScrollDirection;
  ink: InkTuning;
  penProfiles: Record<PenStyle, InkTuning>;
  pencilInk: InkTuning;
  highlighter: HighlighterTuning;
  shapeHold: Record<ShapeHoldTool, ShapeHoldSetting>;
  eraser: EraserSettings;
  openAsTabs: boolean;
  autoOpenImport: boolean;
  recentTemplates: PaperStyle[];
  appearance: 'auto' | 'light' | 'dark';
  toolLooks: Partial<Record<string, { color: string; width: number }>>;
  textSize: number;
  clockFormat: '12' | '24';
}

export const DEFAULT_INK_TUNING: InkTuning = {
  style: 'fountain', smoothing: .58, streamline: .28, pressureSensitivity: .5,
  tipSharpness: 0, tipFlatness: 0, speedSensitivity: 0, response: 0,
};
export const DEFAULT_PEN_PROFILES: Record<PenStyle, InkTuning> = {
  fountain: DEFAULT_INK_TUNING,
  ball: { ...DEFAULT_INK_TUNING, style: 'ball' },
  brush: { ...DEFAULT_INK_TUNING, style: 'brush' },
};
export const DEFAULT_HIGHLIGHTER_TUNING: HighlighterTuning = { stabilization: .28, opacity: .24, straight: false, response: 0 };
export const DEFAULT_SHAPE_HOLD: Record<ShapeHoldTool, ShapeHoldSetting> = {
  pen: { enabled: true, delayMs: 1000 }, pencil: { enabled: true, delayMs: 1000 }, highlighter: { enabled: false, delayMs: 1000 },
};
export const DEFAULT_ERASER_SETTINGS: EraserSettings = { mode: 'stroke', size: 14, convertedText: 'word', scratchEnabled: true, scratchMode: 'strike', targets: { pen: true, pencil: true, highlighter: true, shapes: true }, autoDeselect: false, ignoreStylus: false };
const fallback: NotesPreferences = { scrollDirection: 'vertical', ink: DEFAULT_INK_TUNING, penProfiles: DEFAULT_PEN_PROFILES, pencilInk: DEFAULT_INK_TUNING, highlighter: DEFAULT_HIGHLIGHTER_TUNING, shapeHold: DEFAULT_SHAPE_HOLD, eraser: DEFAULT_ERASER_SETTINGS, openAsTabs: true, autoOpenImport: true, recentTemplates: [], appearance: 'auto', toolLooks: {}, textSize: 22, clockFormat: '24' };
function safeImportedFonts(value: unknown): ImportedNoteFont[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is ImportedNoteFont => !!item && typeof item === 'object' && validNoteFont(item.id)
    && item.id.startsWith('font:') && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 80
    && !seen.has(item.id) && !!seen.add(item.id)).slice(0, 32);
}
function safeHandwriting(value: unknown): HandwritingSettings {
  const saved = value && typeof value === 'object' ? value as Partial<HandwritingSettings> : {};
  return { enabled: saved.enabled === true, fontFamily: validNoteFont(saved.fontFamily) ? saved.fontFamily : DEFAULT_HANDWRITING.fontFamily,
    fontSize: typeof saved.fontSize === 'number' && Number.isFinite(saved.fontSize) && saved.fontSize >= 12 && saved.fontSize <= 64 ? saved.fontSize : 24,
    delayMs: typeof saved.delayMs === 'number' && Number.isFinite(saved.delayMs) && saved.delayMs >= 300 && saved.delayMs <= 3000 ? saved.delayMs : DEFAULT_HANDWRITING.delayMs };
}
function safeShapeHold(value: unknown): Record<ShapeHoldTool, ShapeHoldSetting> {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const setting = (tool: ShapeHoldTool): ShapeHoldSetting => {
    const saved = source[tool] && typeof source[tool] === 'object' ? source[tool] as Record<string, unknown> : {};
    return { enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_SHAPE_HOLD[tool].enabled,
      delayMs: typeof saved.delayMs === 'number' && Number.isFinite(saved.delayMs) && saved.delayMs >= 300 && saved.delayMs <= 2000 ? saved.delayMs : 1000 };
  };
  return { pen: setting('pen'), pencil: setting('pencil'), highlighter: setting('highlighter') };
}
const safeLooks = (value: unknown): NotesPreferences['toolLooks'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const looks: NotesPreferences['toolLooks'] = {};
  for (const [tool, entry] of Object.entries(value)) {
    if (!['pen', 'pencil', 'highlighter', 'line', 'arrow', 'triangle', 'square', 'rectangle', 'circle', 'ellipse', 'polygon', 'diamond', 'pentagon', 'star', 'text'].includes(tool)) continue;
    if (!entry || typeof entry !== 'object') continue;
    const look = entry as Record<string, unknown>;
    if (typeof look.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(look.color) && typeof look.width === 'number' && Number.isFinite(look.width) && look.width >= 1 && look.width <= 40) looks[tool] = { color: look.color, width: look.width };
  }
  return looks;
};
const safeRecentTemplates = (value: unknown): PaperStyle[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is PaperStyle => item === 'plain' || item === 'ruled' || item === 'grid' || item === 'dots'))].slice(0, 3)
  : [];

function safeEraser(value: unknown): EraserSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_ERASER_SETTINGS;
  const source = value as Record<string, unknown>;
  const targets = source.targets && typeof source.targets === 'object' && !Array.isArray(source.targets) ? source.targets as Record<string, unknown> : {};
  return {
    mode: source.mode === 'precision' || source.mode === 'standard' ? source.mode : 'stroke',
    convertedText: source.convertedText === 'line' ? 'line' : 'word',
    scratchEnabled: source.scratchEnabled !== false,
    scratchMode: source.scratchMode === 'scribble' ? 'scribble' : 'strike',
    size: typeof source.size === 'number' && Number.isFinite(source.size) && source.size >= 4 && source.size <= 80 ? source.size : 14,
    targets: {
      pen: targets.pen !== false, pencil: targets.pencil !== false,
      highlighter: targets.highlighter !== false, shapes: targets.shapes !== false,
    },
    autoDeselect: source.autoDeselect === true,
    ignoreStylus: source.ignoreStylus === true,
  };
}

function safeHighlighter(value: unknown): HighlighterTuning {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_HIGHLIGHTER_TUNING;
  const source = value as Record<string, unknown>;
  return {
    stabilization: typeof source.stabilization === 'number' && source.stabilization >= 0 && source.stabilization <= 1 ? source.stabilization : DEFAULT_HIGHLIGHTER_TUNING.stabilization,
    opacity: typeof source.opacity === 'number' && source.opacity >= 0 && source.opacity <= 1 ? source.opacity : DEFAULT_HIGHLIGHTER_TUNING.opacity,
    straight: source.straight === true,
    response: typeof source.response === 'number' && Number.isFinite(source.response) && source.response >= 0 && source.response <= 1 ? source.response : 0,
  };
}

function safeInk(value: unknown): InkTuning {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_INK_TUNING;
  const source = value as Record<string, unknown>;
  const unit = (key: keyof InkTuning, defaultValue: number) => typeof source[key] === 'number' && Number.isFinite(source[key]) && (source[key] as number) >= 0 && (source[key] as number) <= 1
    ? source[key] as number : defaultValue;
  return {
    style: source.style === 'ball' || source.style === 'brush' ? source.style : 'fountain',
    smoothing: unit('smoothing', DEFAULT_INK_TUNING.smoothing),
    streamline: unit('streamline', DEFAULT_INK_TUNING.streamline),
    pressureSensitivity: unit('pressureSensitivity', DEFAULT_INK_TUNING.pressureSensitivity),
    tipSharpness: unit('tipSharpness', DEFAULT_INK_TUNING.tipSharpness),
    tipFlatness: unit('tipFlatness', DEFAULT_INK_TUNING.tipFlatness),
    speedSensitivity: unit('speedSensitivity', DEFAULT_INK_TUNING.speedSensitivity),
    response: unit('response', 0),
  };
}

function safePenProfiles(value: unknown, legacy: InkTuning): Record<PenStyle, InkTuning> {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    fountain: { ...safeInk(source.fountain ?? (legacy.style === 'fountain' ? legacy : DEFAULT_PEN_PROFILES.fountain)), style: 'fountain' },
    ball: { ...safeInk(source.ball ?? (legacy.style === 'ball' ? legacy : DEFAULT_PEN_PROFILES.ball)), style: 'ball' },
    brush: { ...safeInk(source.brush ?? (legacy.style === 'brush' ? legacy : DEFAULT_PEN_PROFILES.brush)), style: 'brush' },
  };
}

export function readNotesPreferences(scope: string): NotesPreferences {
  if (!scope || typeof window === 'undefined') return fallback;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(keyFor(scope)) ?? 'null');
    if (!value || typeof value !== 'object') return fallback;
    const saved = value as { handwriting?: unknown; fontOrder?: unknown; importedFonts?: unknown; scrollDirection?: unknown; ink?: unknown; penProfiles?: unknown; pencilInk?: unknown; highlighter?: unknown; shapeHold?: unknown; eraser?: unknown; openAsTabs?: unknown; autoOpenImport?: unknown; recentTemplates?: unknown; appearance?: unknown; toolLooks?: unknown; textSize?: unknown; clockFormat?: unknown };
    const ink = safeInk(saved.ink);
    return { handwriting: safeHandwriting(saved.handwriting), fontOrder: Array.isArray(saved.fontOrder) ? [...new Set(saved.fontOrder.filter(validNoteFont))].slice(0, 50) : [], importedFonts: safeImportedFonts(saved.importedFonts), scrollDirection: noteScrollDirection(saved.scrollDirection), ink, penProfiles: safePenProfiles(saved.penProfiles, ink), pencilInk: safeInk(saved.pencilInk ?? saved.ink), highlighter: safeHighlighter(saved.highlighter), shapeHold: safeShapeHold(saved.shapeHold), eraser: safeEraser(saved.eraser), openAsTabs: saved.openAsTabs !== false, autoOpenImport: saved.autoOpenImport !== false, recentTemplates: safeRecentTemplates(saved.recentTemplates), appearance: saved.appearance === 'dark' || saved.appearance === 'light' ? saved.appearance : 'auto', toolLooks: safeLooks(saved.toolLooks), textSize: typeof saved.textSize === 'number' && Number.isFinite(saved.textSize) && saved.textSize >= 12 && saved.textSize <= 64 ? saved.textSize : 22, clockFormat: saved.clockFormat === '12' ? '12' : '24' };
  } catch {
    return fallback;
  }
}

export function saveNotesPreferences(scope: string, preferences: Partial<NotesPreferences>): boolean {
  if (!scope || typeof window === 'undefined') return false;
  try {
    const current = readNotesPreferences(scope);
    window.localStorage.setItem(keyFor(scope), JSON.stringify({
      importedFonts: safeImportedFonts(preferences.importedFonts ?? current.importedFonts),
      handwriting: safeHandwriting(preferences.handwriting ?? current.handwriting),
      fontOrder: [...new Set((preferences.fontOrder ?? current.fontOrder ?? []).filter(validNoteFont))].slice(0, 50),
      scrollDirection: noteScrollDirection(preferences.scrollDirection ?? current.scrollDirection),
      ink: safeInk(preferences.ink ?? current.ink),
      penProfiles: safePenProfiles(preferences.penProfiles ?? current.penProfiles, current.ink),
      pencilInk: safeInk(preferences.pencilInk ?? current.pencilInk),
      highlighter: safeHighlighter(preferences.highlighter ?? current.highlighter),
      shapeHold: safeShapeHold(preferences.shapeHold ?? current.shapeHold),
      eraser: safeEraser(preferences.eraser ?? current.eraser),
      openAsTabs: preferences.openAsTabs ?? current.openAsTabs,
      autoOpenImport: preferences.autoOpenImport ?? current.autoOpenImport,
      recentTemplates: safeRecentTemplates(preferences.recentTemplates ?? current.recentTemplates),
      appearance: preferences.appearance ?? current.appearance,
      toolLooks: safeLooks(preferences.toolLooks ?? current.toolLooks),
      textSize: preferences.textSize ?? current.textSize,
      clockFormat: preferences.clockFormat ?? current.clockFormat,
    }));
    return true;
  } catch {
    return false;
  }
}
