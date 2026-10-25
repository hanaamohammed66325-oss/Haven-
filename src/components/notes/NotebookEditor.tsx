'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, PenTool, Pencil, Highlighter, Eraser, Lasso, Type, Minus, Square, Circle, ImagePlus, Camera, Undo2, Redo2, PanelLeft, Plus, Download, Settings2, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize, GripVertical, Move, ScanSearch, Bookmark, Copy, Trash2, X, Check, FileText, Image as ImageIcon, ArrowUp, ArrowDown, ArrowUpRight, Triangle, Hexagon, Diamond, Pentagon, Star, RectangleHorizontal, LockKeyhole, UnlockKeyhole, RotateCcw, RotateCw, Group, Ungroup } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { Modal } from '@/components/Modal';
import type { Notebook, NotePage, NoteTool, NoteShapeTool, NoteElement, NoteText, NoteScrollDirection, DrawingTool, InkStroke, InkTuning, HighlighterTuning, EraserSettings, NoteDocumentSettings, PaperStyle, PenStyle } from '@/lib/notes/types';
import { DEFAULT_NOTE_DOCUMENT_SETTINGS, newId, newPage, noteZoomLimits, NOTE_ZOOM_LIMIT_RANGE, NOTE_SHAPES } from '@/lib/notes/types';
import { isShapeTool } from '@/lib/notes/shapes';
import { rotateNotePage } from '@/lib/notes/pageActions';
import { notesCopy } from '@/lib/notes/copy';
import { DEFAULT_ERASER_SETTINGS, DEFAULT_HIGHLIGHTER_TUNING, DEFAULT_INK_TUNING, DEFAULT_PEN_PROFILES, DEFAULT_SHAPE_HOLD, readNotesPreferences, saveNotesPreferences } from '@/lib/notes/notesPreferences';
import { COVER_COLORS, PAPER_STYLES, importImage, importPdf, exportPdf, exportPagePng } from '@/lib/notes/media';
import { groupElements, measureTextElement, reorderElements, resizeElements, rotateElements, translateElements, ungroupElements } from '@/lib/notes/ink';
import { PageSurface, PageThumbnail } from './PageSurface';
import { SettingChoices, SettingDiagram } from './SettingChoices';
import { InkPreview } from './InkPreview';
import { DocumentScanner } from './DocumentScanner';
import { useNotebookNavigation } from './useNotebookNavigation';
import { noteFontFamily } from '@/lib/notes/fonts';
import { WritingFontPicker } from './WritingFontPicker';
import { useHandwriting } from './useHandwriting';
import { isWritingInk, restoredInk } from '@/lib/notes/handwriting';
import s from './notes.module.css';

const tools: [NoteTool, LucideIcon][] = [['pen', PenTool], ['pencil', Pencil], ['highlighter', Highlighter], ['eraser', Eraser], ['lasso', Lasso], ['text', Type], ['line', Minus], ['rectangle', Square], ['ellipse', Circle]];
const shapeIcons: Record<(typeof NOTE_SHAPES)[number], LucideIcon> = { line: Minus, arrow: ArrowUpRight, triangle: Triangle, square: Square, rectangle: RectangleHorizontal, circle: Circle, ellipse: Circle, polygon: Hexagon, diamond: Diamond, pentagon: Pentagon, star: Star };
const inkColors = ['#243442', '#42766c', '#426ab2', '#ae4c56', '#9560a8', '#9b6a05', '#ffffff'];
const textCssFamily = noteFontFamily;
const EMPTY_SELECTION: string[] = [];
type InkSlider = Exclude<keyof InkTuning, 'style' | 'response'>;
const pencilSliders: InkSlider[] = ['tipSharpness', 'pressureSensitivity', 'tipFlatness', 'streamline', 'smoothing', 'speedSensitivity'];
const penSliders: Record<PenStyle, InkSlider[]> = {
  fountain: ['tipSharpness', 'pressureSensitivity', 'tipFlatness', 'streamline'],
  ball: ['streamline'],
  brush: ['pressureSensitivity', 'streamline'],
};
const hasToolSettings = (_id: NoteTool) => true;
type PageHistoryState = Pick<Notebook, 'pages' | 'pageTrash'>;
type TextFormatting = { fontFamily: NonNullable<NoteText['fontFamily']>; bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean; alignment: NonNullable<NoteText['alignment']>; lineSpacing: number };
export function IconButton({ icon: Icon, label, active, indicator, ...props }: { icon: LucideIcon; label: string; active?: boolean; indicator?: boolean } & HTMLMotionProps<'button'>) {
  const reducedMotion = useReducedMotion();
  return <motion.button type="button" title={label} aria-label={label} aria-pressed={active} {...props} whileHover={reducedMotion ? undefined : { y: -1 }} whileTap={reducedMotion ? undefined : { scale: .92 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }} className={`${s.iconButton} ${active ? s.activeTool : ''} ${props.className || ''}`}><Icon size={20} strokeWidth={1.7} />{indicator && <ChevronDown className={s.toolIndicator} size={11} strokeWidth={2.4} aria-hidden="true" />}</motion.button>;
}

function ResponseSlider({ value = 0, onChange, language }: { value?: number; onChange: (value: number) => void; language: 'ar' | 'en' }) {
  const t = notesCopy(language);
  return <div className={s.advancedSliders}><label className={s.inspectorSlider}><span>{t.writingResponse}</span><input aria-label={t.writingResponse} type="range" min="0" max="100" value={Math.round(value * 100)} onChange={event => onChange(Number(event.target.value) / 100)} /><output>{Math.round(value * 100)}%</output></label><p className={s.toolHint}>{t.writingResponseHint}</p></div>;
}

function ScratchOptions({ settings, onChange, language }: { settings: EraserSettings; onChange: (value: Partial<EraserSettings>) => void; language: 'ar' | 'en' }) {
  const t = notesCopy(language);
  return <div className={s.advancedSliders}><label className={s.inspectorCheck}><input type="checkbox" checked={settings.scratchEnabled !== false} onChange={event => onChange({ scratchEnabled: event.target.checked })} />{t.scratchErase}</label>{settings.scratchEnabled !== false && <><SettingChoices kind="scratch" label={t.scratchMode} value={settings.scratchMode ?? 'strike'} options={[{ value: 'strike', label: t.strikeErase }, { value: 'scribble', label: t.scribbleErase }]} onChange={scratchMode => onChange({ scratchMode })} /><p className={s.toolHint}>{t.scratchHint}</p></>}</div>;
}

export function NotebookEditor({ notebook, onChange, onBack, openTabs, onSwitchTab, onCloseTab, onNewTab, splitCount, onSplitChange, onFullscreenChange, compact = false, active = true, scope, language, saveLabel, saveWarning, appearance, onAppearanceChange, darkMode }: {
  notebook: Notebook; onChange: (notebook: Notebook) => void; onBack: () => void; openTabs: Notebook[]; onSwitchTab: (id: string) => void; onCloseTab: (id: string) => void; onNewTab: () => void; splitCount: 1 | 2 | 3 | 4; onSplitChange: (count: 1 | 2 | 3 | 4) => void; onFullscreenChange?: (fullscreen: boolean) => void; compact?: boolean; active?: boolean; scope: string; language: 'ar' | 'en'; saveLabel: string; saveWarning: boolean; appearance: 'auto' | 'light' | 'dark'; onAppearanceChange: (value: 'auto' | 'light' | 'dark') => void; darkMode: boolean;
}) {
  const t = notesCopy(language);
  const reducedMotion = useReducedMotion();
  const [pageId, setPageId] = useState(notebook.pages[0].id);
  const [tool, setTool] = useState<NoteTool>('pen');
  useEffect(() => { if (tool === 'hand') setTool('pen'); }, [tool]);
  const [color, setColor] = useState('#243442');
  const toolLooks = useRef<ReturnType<typeof readNotesPreferences>['toolLooks']>({});
  const [width, setWidth] = useState(2.5);
  const [textSize, setTextSize] = useState(22);
  const [textFormatting, setTextFormatting] = useState<TextFormatting>({ fontFamily: 'sans', bold: false, italic: false, underline: false, strikethrough: false, alignment: 'auto', lineSpacing: 1.35 });
  const [penStyle, setPenStyle] = useState<PenStyle>('fountain');
  const [penProfiles, setPenProfiles] = useState(DEFAULT_PEN_PROFILES);
  const [pencilTuning, setPencilTuning] = useState<InkTuning>(DEFAULT_INK_TUNING);
  const inkTuning = tool === 'pencil' ? pencilTuning : penProfiles[penStyle];
  const visibleInkSliders = tool === 'pencil' ? pencilSliders : penSliders[penStyle];
  const [highlighterTuning, setHighlighterTuning] = useState<HighlighterTuning>(DEFAULT_HIGHLIGHTER_TUNING);
  const [shapeHold, setShapeHold] = useState(DEFAULT_SHAPE_HOLD);
  const currentShapeHold = tool === 'pen' || tool === 'pencil' || tool === 'highlighter' ? shapeHold[tool] : shapeHold.pen;
  const [eraserSettings, setEraserSettings] = useState<EraserSettings>(DEFAULT_ERASER_SETTINGS);
  const [openAsTabs, setOpenAsTabs] = useState(true);
  const [autoOpenImport, setAutoOpenImport] = useState(true);
  const [wakeLockUnavailable, setWakeLockUnavailable] = useState(false);
  const [hoveredPage, setHoveredPage] = useState<{ id: string; left: number; top: number } | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const lastWritingTool = useRef<NoteTool>('pen');
  const [fillColor, setFillColor] = useState('#42766c');
  const [fillOpacity, setFillOpacity] = useState(0);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [showPages, setShowPages] = useState(false);
  const [activePanel, setActivePanel] = useState<'tool' | 'shapes' | 'toolbar' | 'add' | 'document' | null>(null);
  const [selectedShapeTool, setSelectedShapeTool] = useState<NoteShapeTool>('line');
  const pullIndicator = useRef<HTMLButtonElement>(null);
  const suppressPullClick = useRef(false);
  const [scrolling, setScrolling] = useState(false);
  const [showZoomWindow, setShowZoomWindow] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const previousZoom = useRef(1);
  const [dragPosition, setDragPosition] = useState<{ left: number; top: number } | null>(null);
  const dragStart = useRef<{ pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [mountedPageIds, setMountedPageIds] = useState<Set<string>>(() => new Set([pageId]));
  const [selected, setSelected] = useState<string[]>([]);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [dialog, setDialog] = useState<'export' | 'paper' | 'deletePage' | 'pageTrash' | 'shapeStyle' | 'inkSettings' | 'highlighterSettings' | 'eraserSettings' | 'goToPage' | 'clearPage' | null>(null);
  const [goToNumber, setGoToNumber] = useState(1);
  const [outlineDraft, setOutlineDraft] = useState('');
  const [textEdit, setTextEdit] = useState<{ pageId: string; x: number; y: number; id?: string; value: string; size: number; color: string; w?: number; h?: number; rotation?: number; transform?: NoteText['transform']; groupId?: string; fontFamily: NonNullable<NoteText['fontFamily']>; bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean; alignment: NonNullable<NoteText['alignment']>; lineSpacing: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [historyTick, setHistoryTick] = useState(0);
  const past = useRef<PageHistoryState[]>([]), future = useRef<PageHistoryState[]>([]);
  const viewport = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const shapeToolRef = useRef<HTMLDivElement>(null);
  const shapePickerRef = useRef<HTMLDivElement>(null);
  const shapeListRef = useRef<HTMLDivElement>(null);
  const [shapePickerPosition, setShapePickerPosition] = useState<{ left: number; top: number } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const lastTextPencilDown = useRef(-Infinity);
  const textDrag = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number; pageId: string } | null>(null);
  const zoomWindowViewport = useRef<HTMLDivElement>(null);
  const pageNodes = useRef(new Map<string, HTMLDivElement>());
  const visiblePageIds = useRef(new Set<string>());
  const pendingNavigation = useRef<string | null>(null);
  const pendingZoomAnchor = useRef<{ pageId: string; x: number; y: number; clientX: number; clientY: number } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null), imagePageInput = useRef<HTMLInputElement>(null), cameraInput = useRef<HTMLInputElement>(null), scanInput = useRef<HTMLInputElement>(null), pdfInput = useRef<HTMLInputElement>(null);
  const live = useRef(notebook); live.current = notebook;
  const currentId = useRef(pageId); currentId.current = pageId;
  const page = notebook.pages.find(p => p.id === pageId) || notebook.pages[0];
  useLayoutEffect(() => {
    const input = textInputRef.current;
    if (!textEdit || !input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.max(30, input.scrollHeight + 2)}px`;
  }, [textEdit?.value, textEdit?.size, textEdit?.lineSpacing, pageId, zoom, fit]);
  useLayoutEffect(() => {
    const input = textInputRef.current;
    if (!textEdit || !input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [textEdit?.pageId, textEdit?.id, textEdit?.x, textEdit?.y]);
  const index = notebook.pages.findIndex(p => p.id === page.id);
  const scrollDirection = notebook.scrollDirection ?? 'vertical';
  const zoomLimits = noteZoomLimits(notebook.zoomLimits);
  const documentSettings = { ...DEFAULT_NOTE_DOCUMENT_SETTINGS, ...notebook.documentSettings };
  const pressure = documentSettings.stylusPressure !== false;
  const allowTouch = documentSettings.drawWithFinger === true;
  const palmRejection = documentSettings.palmRejection === true;
  const locked = documentSettings.locked;
  const activeTool = locked ? 'hand' : tool;
  const toolbarTools: NoteTool[] = (documentSettings.toolbarTools ?? DEFAULT_NOTE_DOCUMENT_SETTINGS.toolbarTools!).filter(id => id !== 'hand');
  const nativeScrolling = locked || (!allowTouch && tool !== 'text' && tool !== 'lasso' && !(tool === 'eraser' && eraserSettings.ignoreStylus));
  const visibleShapes = toolbarTools.some(id => isShapeTool(id as DrawingTool));
  const toolbarChoices = [...toolbarTools, ...tools.map(([id]) => id).filter(id => !toolbarTools.includes(id))].filter(id => !isShapeTool(id as DrawingTool));
  useEffect(() => {
    if (documentSettings.autoScreenLock !== false) { setWakeLockUnavailable(false); return; }
    let active = true, pending = false, sentinel: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (!active || pending || sentinel || document.visibilityState !== 'visible') return;
      if (!navigator.wakeLock) { setWakeLockUnavailable(true); return; }
      pending = true;
      try {
        const granted = await navigator.wakeLock.request('screen');
        if (!active || document.visibilityState !== 'visible') await granted.release();
        else { sentinel = granted; setWakeLockUnavailable(false); }
      } catch { if (active) setWakeLockUnavailable(true); }
      finally { pending = false; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
      else { void sentinel?.release(); sentinel = null; }
    };
    document.addEventListener('visibilitychange', onVisibility);
    void acquire();
    return () => { active = false; document.removeEventListener('visibilitychange', onVisibility); void sentinel?.release(); };
  }, [documentSettings.autoScreenLock, notebook.id]);
  const pageLayoutKey = notebook.pages.map(p => `${p.id}:${p.width}:${p.height}`).join('|');
  const pageScale = (target: NotePage) => Math.min(1.2, Math.max(.15, fit / target.width)) * zoom;
  const zoomWindowScale = 1.8;
  const stageWidth = scrollDirection === 'horizontal'
    ? notebook.pages.reduce((total, target) => total + target.width * pageScale(target), 64) + Math.max(0, notebook.pages.length - 1) * 28
    : Math.max(...notebook.pages.map(p => p.width * pageScale(p))) + 32;
  const reportError = useCallback((key: string) => setError(key), []);
  useEffect(() => {
    const preferences = readNotesPreferences(scope);
    setPenStyle(preferences.ink.style);
    setPenProfiles(preferences.penProfiles);
    setPencilTuning(preferences.pencilInk);
    setHighlighterTuning(preferences.highlighter);
    setShapeHold(preferences.shapeHold);
    setEraserSettings(preferences.eraser);
    setOpenAsTabs(preferences.openAsTabs);
    setAutoOpenImport(preferences.autoOpenImport);
    toolLooks.current = preferences.toolLooks;
    setColor(preferences.toolLooks.pen?.color ?? '#243442');
    setWidth(preferences.toolLooks.pen?.width ?? 2.5);
    setTextSize(preferences.textSize);
  }, [scope]);
  useEffect(() => { if (tool !== 'eraser') lastWritingTool.current = tool; }, [tool]);
  const rememberLook = (id: NoteTool, nextColor: string, nextWidth: number) => {
    toolLooks.current = { ...toolLooks.current, [id]: { color: nextColor, width: nextWidth } };
    saveNotesPreferences(scope, { toolLooks: toolLooks.current });
  };
  const selectTool = (id: NoteTool, reveal = true) => {
    const sameTool = id === tool;
    if (id !== tool) {
      const defaults = id === 'highlighter' ? { color: '#f2ce4f', width: 20 } : { color: '#243442', width: 2.5 };
      const look = toolLooks.current[id] ?? defaults;
      setColor(look.color);
      setWidth(look.width);
    }
    setTool(id);
    if (isShapeTool(id as DrawingTool)) setSelectedShapeTool(id as NoteShapeTool);
    setActivePanel(current => reveal && sameTool && hasToolSettings(id) ? current === 'tool' ? null : 'tool' : null);
  };
  useEffect(() => {
    if (!activePanel) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest('[data-note-font-picker]')) return;
      if (!panelRef.current?.contains(target) && !toolbarRef.current?.contains(target) && !shapePickerRef.current?.contains(target)) setActivePanel(null);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [activePanel]);
  useLayoutEffect(() => {
    if (activePanel !== 'shapes') { setShapePickerPosition(null); return; }
    const position = () => {
      const anchor = shapeToolRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(280, window.innerWidth - 16), height = 64;
      const dock = documentSettings.toolbarPosition;
      let left = anchor.left + anchor.width / 2 - width / 2;
      let top = dock === 'bottom' ? anchor.top - height - 8 : anchor.bottom + 8;
      if (dock === 'left' || dock === 'right') { left = dock === 'left' ? anchor.right + 10 : anchor.left - width - 10; top = anchor.top; }
      setShapePickerPosition({ left: Math.max(8, Math.min(window.innerWidth - width - 8, left)), top: Math.max(8, Math.min(window.innerHeight - height - 8, top)) });
    };
    position();
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    const observer = new ResizeObserver(position); if (editorRef.current) observer.observe(editorRef.current);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); observer.disconnect(); };
  }, [activePanel, documentSettings.toolbarPosition]);
  useLayoutEffect(() => {
    if (activePanel !== 'shapes') return;
    const list = shapeListRef.current, selected = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (list && selected) {
      const item = selected.getBoundingClientRect(), bounds = list.getBoundingClientRect();
      list.scrollLeft += language === 'ar' ? item.right - bounds.right : item.left - bounds.left;
    }
  }, [activePanel, shapePickerPosition !== null, language]);
  const changeColor = (value: string) => { setColor(value); rememberLook(tool, value, width); if (tool === 'text') setTextEdit(current => current ? { ...current, color: value } : null); };
  const changeWidth = (value: number) => { setWidth(value); rememberLook(tool, color, value); };
  const updateInkTuning = (change: Partial<Omit<InkTuning, 'style'>>) => {
    if (tool === 'pencil') {
      const next = { ...pencilTuning, ...change };
      setPencilTuning(next);
      saveNotesPreferences(scope, { pencilInk: next });
      return;
    }
    const next = { ...penProfiles[penStyle], ...change };
    const profiles = { ...penProfiles, [penStyle]: next };
    setPenProfiles(profiles);
    saveNotesPreferences(scope, { penProfiles: profiles, ink: next });
  };
  const choosePenStyle = (style: PenStyle) => {
    setPenStyle(style);
    saveNotesPreferences(scope, { ink: penProfiles[style] });
  };
  const updateHighlighterTuning = (change: Partial<HighlighterTuning>) => {
    const next = { ...highlighterTuning, ...change };
    setHighlighterTuning(next);
    saveNotesPreferences(scope, { highlighter: next });
  };
  const updateShapeHold = (change: Partial<typeof currentShapeHold>) => {
    if (tool !== 'pen' && tool !== 'pencil' && tool !== 'highlighter') return;
    const next = { ...shapeHold, [tool]: { ...shapeHold[tool], ...change } };
    setShapeHold(next);
    saveNotesPreferences(scope, { shapeHold: next });
  };
  const updateEraserSettings = (change: Partial<EraserSettings>) => {
    const next = { ...eraserSettings, ...change };
    setEraserSettings(next);
    saveNotesPreferences(scope, { eraser: next });
  };
  const rememberTemplate = (paper: PaperStyle) => {
    const next = [paper, ...readNotesPreferences(scope).recentTemplates.filter(item => item !== paper)].slice(0, 3);
    saveNotesPreferences(scope, { recentTemplates: next });
  };

  const commit = useCallback((pages: NotePage[], pageTrash = live.current.pageTrash) => {
    if (live.current.documentSettings?.locked || (pages === live.current.pages && pageTrash === live.current.pageTrash) || !pages.length) return;
    past.current.push({ pages: live.current.pages, pageTrash: live.current.pageTrash }); if (past.current.length > 80) past.current.shift();
    future.current = []; setHistoryTick(n => n + 1);
    const next = { ...live.current, pages, pageTrash, updatedAt: Date.now() };
    live.current = next; onChange(next);
  }, [onChange]);
  const changePageById = useCallback((id: string, change: (p: NotePage) => NotePage) => {
    commit(live.current.pages.map(p => p.id === id ? change(p) : p));
  }, [commit]);
  const changePage = useCallback((change: (p: NotePage) => NotePage) => changePageById(currentId.current, change), [changePageById]);
  const handwriting = useHandwriting({ scope, notebookId: notebook.id, pageId, active,
    getNotebook: () => live.current,
    changePage: (id, elements) => { changePageById(id, page => ({ ...page, elements })); setSelected([]); },
  });
  const changeInkElements = (id: string, elements: NoteElement[]) => {
    const before = live.current.pages.find(page => page.id === id)?.elements ?? [];
    changePageById(id, page => ({ ...page, elements })); handwriting.record(id, before, elements);
  };
  const undo = useCallback(() => {
    handwriting.cancel();
    if (live.current.documentSettings?.locked) return;
    const previous = past.current.pop(); if (!previous) return;
    future.current.push({ pages: live.current.pages, pageTrash: live.current.pageTrash }); setSelected([]); setHistoryTick(n => n + 1);
    const next = { ...live.current, ...previous, updatedAt: Date.now() }; live.current = next; onChange(next);
  }, [onChange]);
  const redo = useCallback(() => {
    handwriting.cancel();
    if (live.current.documentSettings?.locked) return;
    const next = future.current.pop(); if (!next) return;
    past.current.push({ pages: live.current.pages, pageTrash: live.current.pageTrash }); setSelected([]); setHistoryTick(n => n + 1);
    const updated = { ...live.current, ...next, updatedAt: Date.now() }; live.current = updated; onChange(updated);
  }, [onChange]);
  useEffect(() => {
    if (!notebook.pages.some(p => p.id === pageId)) { const nextId = notebook.pages[Math.min(index, notebook.pages.length - 1)].id; currentId.current = nextId; setPageId(nextId); }
  }, [notebook.pages, pageId, index]);
  useEffect(() => {
    const el = viewport.current; if (!el) return;
    const observer = new ResizeObserver(() => setFit(Math.max(1, fullScreen
      ? Math.min(el.clientWidth - 20, (el.clientHeight - 20) * page.width / page.height)
      : el.clientWidth - (el.clientWidth < 600 ? 24 : 80))));
    observer.observe(el); return () => observer.disconnect();
  }, [fullScreen, page.width, page.height]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!active) return;
      if (dialog || textEdit || (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const map: Record<string, NoteTool> = { p: 'pen', e: 'eraser', l: 'lasso', t: 'text', v: 'lasso' };
      if (map[key] && !live.current.documentSettings?.locked) selectTool(map[key]);
      if (selected.length && key.startsWith('arrow') && !live.current.documentSettings?.locked) {
        const step = e.shiftKey ? 10 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        if (dx || dy) { e.preventDefault(); changePage(p => ({ ...p, elements: translateElements(p.elements, selected, dx, dy) })); }
      }
      if ((key === 'delete' || key === 'backspace') && selected.length) { e.preventDefault(); changePage(p => ({ ...p, elements: p.elements.filter(el => !selected.includes(el.id)) })); setSelected([]); }
      if (key === 'escape') { setSelected([]); setActivePanel(null); if (fullScreen) exitFullScreen(); }
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [undo, redo, selected, changePage, dialog, textEdit, tool, color, width, fullScreen, active]);

  const scrollToPage = (container: HTMLDivElement, target: HTMLDivElement, behavior: ScrollBehavior = 'auto') => {
    if (scrollDirection === 'horizontal') container.scrollTo({ left: Math.max(0, target.offsetLeft - 18), behavior });
    else container.scrollTo({ top: Math.max(0, target.offsetTop - 18), behavior });
  };
  const navigate = (id: string) => {
    currentId.current = id; setPageId(id); setSelected([]); setHoveredPage(null);
    const target = pageNodes.current.get(id), container = viewport.current;
    if (target && container) scrollToPage(container, target);
    else pendingNavigation.current = id;
  };
  const setPageDirection = (direction: NoteScrollDirection) => {
    if (direction === scrollDirection && notebook.scrollDirection !== undefined) return;
    pendingNavigation.current = page.id;
    const next = { ...live.current, scrollDirection: direction, updatedAt: Date.now() };
    live.current = next; onChange(next);
  };
  const addPageAt = (position: 'before' | 'after' | 'end', paper: PaperStyle = page.paper) => {
    if (live.current.documentSettings?.locked) return;
    const next = newPage(paper, page.paperColor);
    const pages = [...live.current.pages];
    pages.splice(position === 'end' ? pages.length : index + (position === 'after' ? 1 : 0), 0, next);
    commit(pages); navigate(next.id); rememberTemplate(paper); setDialog(null);
  };
  const addPage = () => addPageAt('after');
  const previewPage = (id: string, button: HTMLButtonElement) => {
    if (documentSettings.hoverPreview === false) return;
    const rect = button.getBoundingClientRect(), previewWidth = 304;
    setHoveredPage({ id, left: rect.right + previewWidth + 12 <= window.innerWidth ? rect.right + 12 : Math.max(8, rect.left - previewWidth - 12), top: Math.max(8, Math.min(rect.top, window.innerHeight - 420)) });
  };
  const clampZoom = (value: number) => Math.min(zoomLimits.max, Math.max(zoomLimits.min, value));
  const pageAtPoint = (clientX: number, clientY: number) => {
    for (const target of notebook.pages) {
      const bounds = pageNodes.current.get(target.id)?.getBoundingClientRect();
      if (bounds && clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom) return target;
    }
    return page;
  };
  const zoomAt = (factor: number, clientX?: number, clientY?: number, targetPageId?: string, originClientX?: number, originClientY?: number) => {
    const el = viewport.current; if (!el) return;
    const viewportBounds = el.getBoundingClientRect();
    const destinationX = clientX ?? viewportBounds.left + viewportBounds.width / 2;
    const destinationY = clientY ?? viewportBounds.top + viewportBounds.height / 2;
    const sourceX = originClientX ?? destinationX;
    const sourceY = originClientY ?? destinationY;
    if (clampZoom(zoom * factor) === zoom) {
      el.scrollLeft += sourceX - destinationX;
      el.scrollTop += sourceY - destinationY;
      return;
    }
    const target = targetPageId ? notebook.pages.find(candidate => candidate.id === targetPageId) ?? page : pageAtPoint(sourceX, sourceY);
    const targetBounds = pageNodes.current.get(target.id)?.getBoundingClientRect();
    const anchor = targetBounds && targetBounds.width && targetBounds.height
      ? { pageId: target.id, x: (sourceX - targetBounds.left) / targetBounds.width, y: (sourceY - targetBounds.top) / targetBounds.height, clientX: destinationX, clientY: destinationY }
      : null;
    setZoom(old => {
      const next = clampZoom(old * factor);
      if (next === old) return old;
      pendingZoomAnchor.current = anchor;
      return next;
    });
  };
  const updatePullProgress = (distance: number) => {
    const indicator = pullIndicator.current;
    if (!indicator) return;
    indicator.style.setProperty('--pull-progress', `${Math.min(100, distance / 80 * 100)}%`);
    indicator.classList.toggle(s.pullPageReady, distance >= 80);
    indicator.textContent = distance >= 80 ? t.releaseToAddPage : t.pullToAddPage;
  };
  const { registerTouchCancellation, panBy } = useNotebookNavigation(viewport, (factor, x, y, originX, originY) => zoomAt(factor, x, y, undefined, originX, originY), palmRejection,
    documentSettings.pullToAddPage && !locked ? { direction: scrollDirection, onProgress: updatePullProgress, onCommit: () => addPageAt('end') } : null, nativeScrolling);
  useLayoutEffect(() => {
    const anchor = pendingZoomAnchor.current;
    if (!anchor) return;
    const el = viewport.current, target = pageNodes.current.get(anchor.pageId);
    if (!el || !target) return;
    pendingZoomAnchor.current = null;
    const bounds = target.getBoundingClientRect();
    el.scrollLeft += bounds.left + bounds.width * anchor.x - anchor.clientX;
    el.scrollTop += bounds.top + bounds.height * anchor.y - anchor.clientY;
  }, [zoom, fit, pageLayoutKey, scrollDirection]);
  useLayoutEffect(() => {
    if (!showZoomWindow) return;
    const windowEl = zoomWindowViewport.current, pageEl = pageNodes.current.get(page.id), mainEl = viewport.current;
    if (!windowEl || !pageEl || !mainEl) return;
    const bounds = pageEl.getBoundingClientRect(), visible = mainEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(page.width, (visible.left + visible.width / 2 - bounds.left) / pageScale(page)));
    const y = Math.max(0, Math.min(page.height, (visible.top + visible.height / 2 - bounds.top) / pageScale(page)));
    windowEl.scrollLeft = Math.max(0, x * zoomWindowScale - windowEl.clientWidth / 2);
    windowEl.scrollTop = Math.max(0, y * zoomWindowScale - windowEl.clientHeight / 2);
    // A newly opened window follows the visible part of the current page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showZoomWindow, page.id]);
  useEffect(() => setZoom(current => clampZoom(current)), [zoomLimits.min, zoomLimits.max]);
  const setZoomLimit = (kind: 'min' | 'max', value: number) => {
    if (!Number.isFinite(value)) return;
    const step = .05;
    const next = kind === 'min'
      ? { min: Math.min(zoomLimits.max - step, Math.max(NOTE_ZOOM_LIMIT_RANGE.min, value)), max: zoomLimits.max }
      : { min: zoomLimits.min, max: Math.max(zoomLimits.min + step, Math.min(NOTE_ZOOM_LIMIT_RANGE.max, value)) };
    const updated = { ...live.current, zoomLimits: next, updatedAt: Date.now() };
    live.current = updated; onChange(updated);
  };
  const setDocumentSetting = <K extends keyof NoteDocumentSettings>(key: K, value: NoteDocumentSettings[K]) => {
    const next = { ...live.current, documentSettings: { ...DEFAULT_NOTE_DOCUMENT_SETTINGS, ...live.current.documentSettings, [key]: value }, updatedAt: Date.now() };
    live.current = next; onChange(next);
  };
  const toggleToolbarTool = (id: NoteTool, visible: boolean) => {
    const next: NoteTool[] = isShapeTool(id as DrawingTool)
      ? visible ? [...toolbarTools.filter(item => !isShapeTool(item as DrawingTool)), 'line'] : toolbarTools.filter(item => !isShapeTool(item as DrawingTool))
      : visible ? [...toolbarTools, id] : toolbarTools.filter(item => item !== id);
    setDocumentSetting('toolbarTools', next);
    if (!visible && (tool === id || isShapeTool(id as DrawingTool) && isShapeTool(tool as DrawingTool))) selectTool(next[0] ?? 'pen', false);
  };
  const moveToolbarTool = (id: NoteTool, offset: -1 | 1) => {
    const next = [...toolbarTools], index = next.indexOf(id), other = index + offset;
    if (index < 0 || other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other], next[index]];
    setDocumentSetting('toolbarTools', next);
  };
  const zoomAtRef = useRef(zoomAt); zoomAtRef.current = zoomAt;
  const scrollDirectionRef = useRef(scrollDirection); scrollDirectionRef.current = scrollDirection;
  useEffect(() => {
    const el = viewport.current; if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomAtRef.current(event.deltaY < 0 ? 1.08 : 1 / 1.08, event.clientX, event.clientY);
      } else if (scrollDirectionRef.current === 'horizontal' && Math.abs(event.deltaY) >= Math.abs(event.deltaX) && event.deltaY) {
        event.preventDefault();
        el.scrollLeft += event.deltaY;
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    setMountedPageIds(new Set([pageId]));
  }, [pageLayoutKey]);
  useEffect(() => {
    const id = pendingNavigation.current, target = id ? pageNodes.current.get(id) : undefined, container = viewport.current;
    if (!id || !target || !container) return;
    pendingNavigation.current = null;
    scrollToPage(container, target);
  }, [pageLayoutKey, scrollDirection]);
  useEffect(() => {
    // Explicit navigation must mount its destination immediately, without
    // tearing down the observer on every active-page change during scrolling.
    setMountedPageIds(previous => previous.has(pageId) ? previous : new Set([...previous, pageId]));
  }, [pageId]);
  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const visible = new Set<string>();
    const pages = live.current.pages;
    const positions = new Map(pages.map((page, index) => [page.id, index]));
    const update = () => {
      const nearby = new Set<string>([currentId.current]);
      for (const id of visible) {
        const at = positions.get(id);
        if (at === undefined) continue;
        for (let offset = -1; offset <= 1; offset++) if (pages[at + offset]) nearby.add(pages[at + offset].id);
      }
      setMountedPageIds(previous => previous.size === nearby.size && [...previous].every(id => nearby.has(id)) ? previous : nearby);
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.notePageId;
        if (!id) continue;
        if (entry.isIntersecting) visible.add(id); else visible.delete(id);
      }
      visiblePageIds.current = new Set(visible);
      update();
    }, { root, rootMargin: '0px', threshold: 0 });
    for (const node of pageNodes.current.values()) observer.observe(node);
    return () => { observer.disconnect(); visiblePageIds.current.clear(); };
  }, [pageLayoutKey, scrollDirection]);
  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    let frame = 0;
    // Measure once per layout/zoom change, rather than forcing page rectangle
    // reads after each scroll write. Slots keep their dimensions while loading.
    const bounds = root.getBoundingClientRect();
    const horizontal = scrollDirection === 'horizontal';
    const positions = new Map([...pageNodes.current].map(([id, node]) => {
      const rect = node.getBoundingClientRect();
      return [id, horizontal
        ? { start: rect.left - bounds.left + root.scrollLeft, end: rect.right - bounds.left + root.scrollLeft }
        : { start: rect.top - bounds.top + root.scrollTop, end: rect.bottom - bounds.top + root.scrollTop }] as const;
    }));
    const syncActivePage = () => {
      frame = 0;
      const start = horizontal ? root.scrollLeft : root.scrollTop;
      const end = start + (horizontal ? root.clientWidth : root.clientHeight);
      const center = (start + end) / 2;
      let closest: { id: string; distance: number } | undefined;
      const candidates = visiblePageIds.current.size ? visiblePageIds.current : positions.keys();
      for (const id of candidates) {
        const rect = positions.get(id);
        if (!rect || rect.end <= start || rect.start >= end) continue;
        const distance = Math.abs((rect.start + rect.end) / 2 - center);
        if (!closest || distance < closest.distance) closest = { id, distance };
      }
      if (closest && closest.id !== currentId.current) { currentId.current = closest.id; setSelected(previous => previous.length ? EMPTY_SELECTION : previous); setPageId(closest.id); }
    };
    let settle: ReturnType<typeof setTimeout> | undefined;
    let moving = false;
    const onScroll = () => {
      if (!moving) { moving = true; setScrolling(true); }
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => { moving = false; setScrolling(false); }, 160);
      if (!frame) frame = requestAnimationFrame(syncActivePage);
    };
    root.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    return () => { root.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); if (settle) clearTimeout(settle); };
  }, [pageLayoutKey, fit, zoom, scrollDirection]);
  useEffect(() => {
    if (!showPages) return;
    document.querySelector<HTMLButtonElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [pageId, showPages]);
  const doImport = async (file: File | undefined, image: boolean) => {
    if (!file || live.current.documentSettings?.locked) return; setBusy(t.importBusy); setError('');
    try {
      if (image) {
        const result = await importImage(scope, file);
        const ratio = Math.min(1, page.width * .65 / result.width, (page.height - 120) / result.height);
        const w = result.width * ratio, h = result.height * ratio;
        const id = newId();
        changePage(p => ({ ...p, elements: [...p.elements, { id, kind: 'image', assetId: result.assetId, x: (p.width - w) / 2, y: 60, w, h }] }));
        selectTool('lasso', false); setSelected([id]);
      } else {
        const imported = await importPdf(scope, file);
        const pages = [...live.current.pages]; pages.splice(index + 1, 0, ...imported); commit(pages); navigate(imported[0].id);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'importFailed'); }
    finally { setBusy(''); if (imageInput.current) imageInput.current.value = ''; if (cameraInput.current) cameraInput.current.value = ''; if (pdfInput.current) pdfInput.current.value = ''; }
  };
  const doExport = async (pdf: boolean) => {
    setDialog(null); setBusy(t.exporting); setProgress(0); setError('');
    try { if (pdf) await exportPdf(scope, live.current, setProgress); else await exportPagePng(scope, page, notebook.title); }
    catch { setError('exportFailed'); } finally { setBusy(''); }
  };
  const saveScan = async (file: File) => {
    if (live.current.documentSettings?.locked) throw new Error('scanFailed');
    const result = await importImage(scope, file);
    const scanned = newPage('plain', '#ffffff');
    const scale = Math.min((scanned.width - 32) / result.width, (scanned.height - 32) / result.height);
    const w = result.width * scale, h = result.height * scale;
    scanned.elements = [{ id: newId(), kind: 'image', assetId: result.assetId, x: (scanned.width - w) / 2, y: (scanned.height - h) / 2, w, h }];
    const pages = [...live.current.pages], at = pages.findIndex(item => item.id === currentId.current);
    pages.splice(at + 1, 0, scanned);
    commit(pages); navigate(scanned.id);
  };
  const addImagePage = async (file: File | undefined) => {
    if (!file || live.current.documentSettings?.locked) return;
    setBusy(t.importBusy); setError('');
    try { await saveScan(file); }
    catch (error) { setError(error instanceof Error ? error.message : 'importFailed'); }
    finally {
      setBusy('');
      if (imagePageInput.current) imagePageInput.current.value = '';
      if (cameraInput.current) cameraInput.current.value = '';
    }
  };
  const requestText = (targetPageId: string, point: { x: number; y: number }, existingId?: string) => {
    if (live.current.documentSettings?.locked) return;
    const targetPage = live.current.pages.find(p => p.id === targetPageId) || live.current.pages[0];
    const existing = targetPage.elements.find(e => e.id === existingId && e.kind === 'text') as NoteText | undefined;
    currentId.current = targetPage.id; setPageId(targetPage.id);
    setSelected([]);
    setActivePanel(null);
    setShowZoomWindow(false);
    const x = existing?.x ?? Math.max(10, Math.min(point.x, targetPage.width - 100));
    const y = existing?.y ?? Math.max(10, Math.min(point.y, targetPage.height - 40));
    setTextEdit({ pageId: targetPage.id, x, y, id: existing?.id, value: existing?.text ?? '', size: existing?.fontSize ?? textSize, color: existing?.color ?? color, w: existing?.w ?? Math.min(260, targetPage.width - x - 15), h: existing?.h, rotation: existing?.rotation, transform: existing?.transform, groupId: existing?.groupId, fontFamily: existing?.fontFamily ?? textFormatting.fontFamily, bold: existing?.bold ?? textFormatting.bold, italic: existing?.italic ?? textFormatting.italic, underline: existing?.underline ?? textFormatting.underline, strikethrough: existing?.strikethrough ?? textFormatting.strikethrough, alignment: existing?.alignment ?? textFormatting.alignment, lineSpacing: existing?.lineSpacing ?? textFormatting.lineSpacing });
  };
  const submitText = () => {
    if (!textEdit || live.current.documentSettings?.locked) return;
    const targetPage = live.current.pages.find(p => p.id === textEdit.pageId) || live.current.pages[0];
    if (!textEdit.value.trim()) {
      if (textEdit.id) changePageById(targetPage.id, p => ({ ...p, elements: p.elements.filter(element => element.id !== textEdit.id) }));
      setTextEdit(null);
      return;
    }
    const x = textEdit.x;
    const y = textEdit.y;
    const textWidth = textEdit.w ?? Math.min(400, targetPage.width - x - 15);
    const item: NoteText = { id: textEdit.id ?? newId(), kind: 'text', x, y, w: textWidth, h: 0, text: textEdit.value, fontSize: textEdit.size, color: textEdit.color, fontFamily: textEdit.fontFamily, bold: textEdit.bold, italic: textEdit.italic, underline: textEdit.underline, strikethrough: textEdit.strikethrough, alignment: textEdit.alignment, lineSpacing: textEdit.lineSpacing, ...(textEdit.groupId ? { groupId: textEdit.groupId } : {}), ...(textEdit.rotation === undefined ? {} : { rotation: textEdit.rotation }), ...(textEdit.transform ? { transform: textEdit.transform } : {}) };
    item.h = Math.max(textEdit.h ?? 0, measureTextElement(item.text, item.fontSize, item.w, item));
    const original = targetPage.elements.find(element => element.id === textEdit.id);
    if (original?.kind === 'text') { item.sourceInk = original.sourceInk; item.handwritingTool = original.handwritingTool; }
    changePageById(targetPage.id, p => ({ ...p, elements: textEdit.id ? p.elements.map(e => e.id === textEdit.id ? item : e) : [...p.elements, item] })); setTextEdit(null);
  };
  const updateTextFormatting = (change: Partial<TextFormatting>) => {
    setTextFormatting(current => ({ ...current, ...change }));
    setTextEdit(current => current ? { ...current, ...change } : null);
  };
  const selectedShape = page.elements.find(element => selected.includes(element.id) && element.kind === 'stroke' && isShapeTool(element.tool)) as InkStroke | undefined;
  const selectedText = selected.length === 1 ? page.elements.find(element => element.id === selected[0] && element.kind === 'text') as NoteText | undefined : undefined;
  const selectedHasGroup = page.elements.some(element => selected.includes(element.id) && element.groupId);
  const updateSelectedShapes = (change: Partial<InkStroke>) => changePage(current => ({ ...current, elements: current.elements.map(element =>
    selected.includes(element.id) && element.kind === 'stroke' && isShapeTool(element.tool) ? { ...element, ...change } : element) }));
  const updateSelectedText = (change: Partial<NoteText>) => {
    if (!selectedText) return;
    changePage(current => ({ ...current, elements: current.elements.map(element => {
      if (element.id !== selectedText.id || element.kind !== 'text') return element;
      const updated = { ...element, ...change };
      return { ...updated, h: Math.max(updated.h, measureTextElement(updated.text, updated.fontSize, updated.w, updated)) };
    }) }));
  };
  const advanceZoomWindow = () => {
    const el = zoomWindowViewport.current;
    if (!el) return;
    const maxLeft = Math.max(0, page.width * zoomWindowScale - el.clientWidth);
    if (el.scrollLeft >= maxLeft - 8) { el.scrollLeft = 0; el.scrollTop += 110 * zoomWindowScale; }
    else el.scrollLeft = Math.min(maxLeft, el.scrollLeft + el.clientWidth * .62);
  };
  const changeFromZoomWindow = (elements: NoteElement[]) => {
    const previous = live.current.pages.find(item => item.id === page.id)?.elements.length ?? 0;
    changeInkElements(page.id, elements);
    if (documentSettings.autoAdvanceZoom === false || elements.length <= previous) return;
    const last = elements[elements.length - 1], end = last?.kind === 'stroke' ? last.points[last.points.length - 1] : null;
    const el = zoomWindowViewport.current;
    if (end && el && end.x * zoomWindowScale >= el.scrollLeft + el.clientWidth * .82) advanceZoomWindow();
  };
  const enterFullScreen = () => {
    previousZoom.current = zoom;
    pendingNavigation.current = page.id;
    setZoom(1);
    setShowZoomWindow(false);
    setActivePanel(null);
    setFullScreen(true);
    onFullscreenChange?.(true);
  };
  const exitFullScreen = () => {
    pendingNavigation.current = page.id;
    setZoom(clampZoom(previousZoom.current));
    setFullScreen(false);
    onFullscreenChange?.(false);
  };
  const startToolbarDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const root = editorRef.current, bar = toolbarRef.current;
    if (!root || !bar) return;
    setActivePanel(null);
    const bounds = root.getBoundingClientRect(), toolbarBounds = bar.getBoundingClientRect();
    dragStart.current = { pointerId: event.pointerId, offsetX: event.clientX - toolbarBounds.left, offsetY: event.clientY - toolbarBounds.top, startX: event.clientX, startY: event.clientY };
    setDragPosition({ left: toolbarBounds.left - bounds.left, top: toolbarBounds.top - bounds.top });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveToolbarDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current, root = editorRef.current, bar = toolbarRef.current;
    if (!start || start.pointerId !== event.pointerId || !root || !bar) return;
    const bounds = root.getBoundingClientRect();
    bar.style.left = `${Math.max(8, Math.min(bounds.width - bar.offsetWidth - 8, event.clientX - bounds.left - start.offsetX))}px`;
    bar.style.top = `${Math.max(8, Math.min(bounds.height - bar.offsetHeight - 8, event.clientY - bounds.top - start.offsetY))}px`;
    event.preventDefault();
  };
  const endToolbarDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current, root = editorRef.current;
    if (!start || start.pointerId !== event.pointerId || !root) return;
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (Math.hypot(event.clientX - start.startX, event.clientY - start.startY) > 5) {
      const bounds = root.getBoundingClientRect();
      const distances = { top: event.clientY - bounds.top, bottom: bounds.bottom - event.clientY, left: event.clientX - bounds.left, right: bounds.right - event.clientX };
      const dock = (Object.keys(distances) as NoteDocumentSettings['toolbarPosition'][]).reduce((best, side) => distances[side] < distances[best] ? side : best, 'top');
      setDocumentSetting('toolbarPosition', dock);
    } else setActivePanel(value => value === 'toolbar' ? null : 'toolbar');
    setDragPosition(null);
  };
  void historyTick;
  return <div ref={editorRef} className={`${s.editor} ${compact ? s.editorCompact : ''} ${fullScreen ? s.editorFullscreen : ''}`} data-toolbar-dock={documentSettings.toolbarPosition}>
    <header className={s.editorHeader}>
      <IconButton icon={ArrowLeft} label={t.backLibrary} onClick={onBack} />
      <span className={s.bookPagePreview} aria-hidden="true"><PageThumbnail scope={scope} page={notebook.pages[0]} previewWidth={32} /></span>
      <div className={s.editorTitle}><strong>{notebook.title}</strong><span className={saveWarning ? s.warningText : ''}>{saveLabel}</span></div>
       <div className={s.headerActions}>{documentSettings.undoRedoPosition === 'header' && <><IconButton icon={Undo2} label={t.undo} disabled={locked || !past.current.length} onClick={undo} /><IconButton icon={Redo2} label={t.redo} disabled={locked || !future.current.length} onClick={redo} /><span className={s.separator} /></>}<button type="button" className={`${s.headerPill} ${activePanel === 'add' ? s.headerPillActive : ''}`} aria-expanded={activePanel === 'add'} onClick={() => setActivePanel(value => value === 'add' ? null : 'add')}><Plus size={18} />{t.add}</button><button type="button" className={`${s.headerPill} ${activePanel === 'document' ? s.headerPillActive : ''}`} aria-expanded={activePanel === 'document'} onClick={() => setActivePanel(value => value === 'document' ? null : 'document')}><FileText size={18} />{t.document}</button></div>
    </header>
    {!compact && <nav className={s.documentTabs} aria-label={t.openDocuments}>{openTabs.map(tab => <div key={tab.id} className={`${s.documentTab} ${tab.id === notebook.id ? s.activeDocumentTab : ''}`}><button type="button" aria-current={tab.id === notebook.id ? 'page' : undefined} onClick={() => onSwitchTab(tab.id)}>{tab.title}</button><button type="button" aria-label={`${t.closeDocument}: ${tab.title}`} onClick={() => onCloseTab(tab.id)}><X size={14} /></button></div>)}<button type="button" className={s.newTabButton} aria-label={t.newTab} onClick={onNewTab}><Plus size={17} /></button><div className={s.splitChoices} role="group" aria-label={t.splitTabs}>{([1, 2, 3, 4] as const).map(count => <button key={count} type="button" aria-label={`${t.splitTabs} ${count}`} aria-pressed={splitCount === count} onClick={() => onSplitChange(count)}>{count}</button>)}</div></nav>}
    {typeof document !== 'undefined' && createPortal(<AnimatePresence>{activePanel === 'shapes' && shapePickerPosition && <motion.div id={`shape-picker-${notebook.id}`} ref={shapePickerRef} className={s.shapePickerFloating} dir={language === 'ar' ? 'rtl' : 'ltr'} role="region" aria-label={t.chooseShape} style={{ ...shapePickerPosition, '--n-panel': darkMode ? '#16242b' : 'var(--color-surface)', '--n-ink': darkMode ? '#e8eef2' : 'var(--color-ink)', '--n-line': darkMode ? '#34444a' : 'var(--color-border)', '--n-accent': 'var(--color-primary)' } as React.CSSProperties} initial={reducedMotion ? false : { opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .97 }} transition={{ duration: reducedMotion ? 0 : .18 }}>
      <button type="button" className={s.shapeScroll} aria-label={t.previousShapes} onClick={() => shapeListRef.current?.scrollBy({ left: language === 'ar' ? 104 : -104, behavior: reducedMotion ? 'instant' : 'smooth' })}>{language === 'ar' ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
      <div ref={shapeListRef} className={s.shapePickerList} role="group" aria-label={t.shapes}>{NOTE_SHAPES.map(id => <IconButton key={id} icon={shapeIcons[id]} label={t[id]} active={tool === id} onClick={() => { selectTool(id, false); setActivePanel(null); }} />)}</div>
      <button type="button" className={s.shapeScroll} aria-label={t.nextShapes} onClick={() => shapeListRef.current?.scrollBy({ left: language === 'ar' ? -104 : 104, behavior: reducedMotion ? 'instant' : 'smooth' })}>{language === 'ar' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
      <button type="button" className={s.shapePickerSettings} aria-label={t.shapeStyle} title={t.shapeStyle} onClick={() => { selectTool(selectedShapeTool, false); setActivePanel('tool'); }}><Settings2 size={17} /></button>
    </motion.div>}</AnimatePresence>, document.body)}
    <motion.div ref={toolbarRef} className={`${s.toolbar} ${dragPosition ? s.toolbarDragging : ''}`} data-dock={documentSettings.toolbarPosition} data-shapes-open={activePanel === 'shapes'} role="toolbar" aria-label={t.tools} style={dragPosition ? { left: dragPosition.left, top: dragPosition.top, right: 'auto', bottom: 'auto' } : undefined} animate={{ opacity: dragPosition ? .92 : 1 }} transition={{ duration: reducedMotion ? 0 : .18 }}>
      <button type="button" className={s.toolbarGrip} aria-label={t.customizeToolbar} title={t.customizeToolbar} onPointerDown={startToolbarDrag} onPointerMove={moveToolbarDrag} onPointerUp={endToolbarDrag} onPointerCancel={() => { dragStart.current = null; setDragPosition(null); }}><GripVertical size={17} /></button>
      {fullScreen && <IconButton icon={Minimize} label={t.exitFullscreen} onClick={exitFullScreen} />}
      <div className={s.toolGroup}><IconButton icon={PanelLeft} label={showPages ? t.hidePages : t.showPages} active={showPages} onClick={() => setShowPages(!showPages)} />{documentSettings.undoRedoPosition === 'toolbar' && <><IconButton icon={Undo2} label={t.undo} disabled={locked || !past.current.length} onClick={undo} /><IconButton icon={Redo2} label={t.redo} disabled={locked || !future.current.length} onClick={redo} /></>}</div>
       <div className={s.toolGroup}>{toolbarTools.filter(id => !isShapeTool(id as DrawingTool)).map(id => { const entry = tools.find(([candidate]) => candidate === id); return entry ? <IconButton key={id} icon={entry[1]} label={t[id]} active={activeTool === id} indicator={activeTool === id && hasToolSettings(id)} aria-expanded={activeTool === id && hasToolSettings(id) ? activePanel === 'tool' : undefined} disabled={locked} onClick={() => selectTool(id)} /> : null; })}{documentSettings.showImageTool !== false && <IconButton icon={ImagePlus} label={t.image} disabled={locked || !!busy} onClick={() => { imageInput.current?.click(); setActivePanel(null); }} />}</div>
       {visibleShapes && <div ref={shapeToolRef} className={s.shapeTool} role="group" aria-label={t.shapes}><IconButton icon={shapeIcons[isShapeTool(activeTool as DrawingTool) ? activeTool as NoteShapeTool : selectedShapeTool]} label={t.shapes} active={isShapeTool(activeTool as DrawingTool)} aria-expanded={activePanel === 'shapes'} aria-controls={`shape-picker-${notebook.id}`} disabled={locked} onClick={() => { if (isShapeTool(tool as DrawingTool)) setActivePanel(value => value === 'shapes' ? null : 'shapes'); else selectTool(selectedShapeTool, false); }} /><button type="button" className={s.shapeArrow} aria-label={t.chooseShape} aria-expanded={activePanel === 'shapes'} aria-controls={`shape-picker-${notebook.id}`} disabled={locked} onClick={() => setActivePanel(value => value === 'shapes' ? null : 'shapes')}><ChevronDown size={12} /></button></div>}
    </motion.div>
     <AnimatePresence>{activePanel && activePanel !== 'shapes' && <motion.section ref={panelRef} initial={reducedMotion ? false : { opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: .985 }} transition={{ type: 'spring', stiffness: 420, damping: 35 }} className={s.contextPanel} aria-label={activePanel === 'tool' ? t[tool] : activePanel === 'toolbar' ? t.toolbarTools : activePanel === 'add' ? t.add : t.document}>
       <div className={s.contextHeading}><strong>{activePanel === 'tool' ? t[tool] : activePanel === 'toolbar' ? t.toolbarTools : activePanel === 'add' ? t.add : t.document}</strong><IconButton icon={X} label={t.dismiss} onClick={() => setActivePanel(null)} /></div>
       {activePanel === 'toolbar' && <div className={s.form}><p className={s.formHint}>{t.dragToolbarHint}</p><SettingChoices label={t.toolbarPosition} kind="dock" value={documentSettings.toolbarPosition} options={[{ value: 'top', label: t.top }, { value: 'bottom', label: t.bottom }, { value: 'left', label: t.left }, { value: 'right', label: t.right }]} onChange={value => setDocumentSetting('toolbarPosition', value)} /><SettingChoices label={t.undoRedoPosition} kind="undo" value={documentSettings.undoRedoPosition} options={[{ value: 'header', label: t.header }, { value: 'toolbar', label: t.toolbar }]} onChange={value => setDocumentSetting('undoRedoPosition', value)} />{toolbarChoices.map(id => <div key={id} className={s.toolbarToolRow}><label className={s.toggle}><span>{(() => { const Icon = tools.find(([candidate]) => candidate === id)?.[1]; return Icon ? <Icon size={18} aria-hidden="true" /> : null; })()}{t[id]}</span><input type="checkbox" checked={toolbarTools.includes(id)} onChange={event => toggleToolbarTool(id, event.target.checked)} /></label><IconButton icon={ArrowUp} label={`${t.moveToolEarlier}: ${t[id]}`} disabled={!toolbarTools.includes(id) || toolbarTools.indexOf(id) === 0} onClick={() => moveToolbarTool(id, -1)} /><IconButton icon={ArrowDown} label={`${t.moveToolLater}: ${t[id]}`} disabled={!toolbarTools.includes(id) || toolbarTools.indexOf(id) === toolbarTools.length - 1} onClick={() => moveToolbarTool(id, 1)} /></div>)}<label className={s.toggle}><span>{t.shapes}</span><input type="checkbox" checked={visibleShapes} onChange={event => toggleToolbarTool('line', event.target.checked)} /></label><label className={s.toggle}><span>{t.image}</span><input type="checkbox" checked={documentSettings.showImageTool !== false} onChange={event => setDocumentSetting('showImageTool', event.target.checked)} /></label></div>}
       {activePanel === 'add' && <div className={s.actionGrid}>
         <button disabled={locked} onClick={() => { addPage(); setActivePanel(null); }}><FileText size={19} />{t.newPage}</button>
         <button disabled={locked || !!busy} onClick={() => { imagePageInput.current?.click(); setActivePanel(null); }}><ImagePlus size={19} />{t.imagePage}</button>
         <button disabled={locked || !!busy} onClick={() => { pdfInput.current?.click(); setActivePanel(null); }}><FileText size={19} />{t.importPdf}</button>
         <button disabled={locked || !!busy} onClick={() => { cameraInput.current?.click(); setActivePanel(null); }}><Camera size={19} />{t.capturePhoto}</button>
         <button disabled={locked || !!busy} onClick={() => { scanInput.current?.click(); setActivePanel(null); }}><ScanSearch size={19} />{t.scanDocument}</button>
       </div>}
       {activePanel === 'document' && <><div className={s.actionGrid}>
         <button onClick={() => { setOutlineDraft(page.outlineTitle ?? ''); setDialog('paper'); setActivePanel(null); }}><FileText size={19} />{t.pageSettings}</button>
         <button onClick={() => { setDialog('export'); setActivePanel(null); }}><Download size={19} />{t.export}</button>
         <button onClick={() => { setSelected([]); setTextEdit(null); setDocumentSetting('locked', !locked); setActivePanel(null); }}>{locked ? <UnlockKeyhole size={19} /> : <LockKeyhole size={19} />}{locked ? t.unlockDocument : t.lockDocument}</button>
       </div><SettingChoices label={t.notesAppearance} kind="appearance" value={appearance} options={[{ value: 'auto', label: t.auto }, { value: 'light', label: t.light }, { value: 'dark', label: t.dark }]} onChange={onAppearanceChange} />
       <div className={s.documentZoomOptions}><label>{t.zoomMinimum}<input type="number" min={NOTE_ZOOM_LIMIT_RANGE.min * 100} max={(zoomLimits.max - .05) * 100} step="5" value={Math.round(zoomLimits.min * 100)} onChange={event => setZoomLimit('min', Number(event.target.value) / 100)} /></label><label>{t.zoomMaximum}<input type="number" min={(zoomLimits.min + .05) * 100} max={NOTE_ZOOM_LIMIT_RANGE.max * 100} step="5" value={Math.round(zoomLimits.max * 100)} onChange={event => setZoomLimit('max', Number(event.target.value) / 100)} /></label></div>
       <div className={s.documentOptions}><SettingChoices label={t.pageDirection} kind="direction" value={scrollDirection} options={[{ value: 'vertical', label: t.vertical }, { value: 'horizontal', label: t.horizontal }]} onChange={setPageDirection} /><label className={s.toggle}><span><SettingDiagram kind="pageNumber" />{t.showPageNumbers}</span><input type="checkbox" checked={documentSettings.showPageNumbers} onChange={event => setDocumentSetting('showPageNumbers', event.target.checked)} /></label><label className={s.toggle}><span><SettingDiagram kind="status" />{t.showStatusBar}</span><input type="checkbox" checked={documentSettings.showStatusBar !== false} onChange={event => setDocumentSetting('showStatusBar', event.target.checked)} /></label><label className={s.toggle}><span><SettingDiagram kind="pull" />{t.pullToAddPage}</span><input type="checkbox" checked={documentSettings.pullToAddPage === true} onChange={event => setDocumentSetting('pullToAddPage', event.target.checked)} /></label><label className={s.toggle}><span><SettingDiagram kind="hover" />{t.hoverPreview}</span><input type="checkbox" checked={documentSettings.hoverPreview !== false} onChange={event => { setDocumentSetting('hoverPreview', event.target.checked); setHoveredPage(null); }} /></label><label className={s.toggle}><span><SettingDiagram kind="zoom" />{t.autoAdvanceZoom}</span><input type="checkbox" checked={documentSettings.autoAdvanceZoom !== false} onChange={event => setDocumentSetting('autoAdvanceZoom', event.target.checked)} /></label><label className={s.toggle}><span><SettingDiagram kind="lock" />{t.autoScreenLock}</span><input type="checkbox" checked={documentSettings.autoScreenLock !== false} onChange={event => setDocumentSetting('autoScreenLock', event.target.checked)} /></label><label className={s.toggle}><span><SettingDiagram kind="tabs" />{t.openAsTabs}</span><input type="checkbox" checked={openAsTabs} onChange={event => { setOpenAsTabs(event.target.checked); saveNotesPreferences(scope, { openAsTabs: event.target.checked }); }} /></label><label className={s.toggle}><span><SettingDiagram kind="import" />{t.autoOpenImport}</span><input type="checkbox" checked={autoOpenImport} onChange={event => { setAutoOpenImport(event.target.checked); saveNotesPreferences(scope, { autoOpenImport: event.target.checked }); }} /></label><SettingChoices label={t.sidebarPosition} kind="sidebar" value={documentSettings.sidebarPosition} options={[{ value: 'start', label: t.startSide }, { value: 'end', label: t.endSide }]} onChange={value => setDocumentSetting('sidebarPosition', value)} /></div></>}
        {activePanel === 'document' && documentSettings.autoScreenLock === false && wakeLockUnavailable && <p className={s.formHint} role="status">{t.wakeLockUnavailable}</p>}
        {activePanel === 'tool' && <div className={s.toolInspector}>
         {(tool === 'pen' || tool === 'pencil' || tool === 'highlighter') && <div className={s.inkPreview}><InkPreview conversion={{ scope, fontFamily: handwriting.settings.fontFamily, label: t.testFontConversion, busyLabel: t.recognizingInk, errorLabel: t.recognitionFailed }} tool={tool} color={color} width={tool === 'highlighter' ? Math.max(12, width) : width} tuning={inkTuning} highlight={highlighterTuning} pressure={pressure} label={t.tryInk} clearLabel={t.clearInkPreview} hint={t.inkPreviewHint} /></div>}
         {tool === 'pen' && <div className={s.penStyles}>{([['fountain', PenTool, t.fountainPen], ['ball', Pencil, t.ballPen], ['brush', Highlighter, t.brushPen]] as const).map(([style, Icon, label]) => <button key={style} className={penStyle === style ? s.selectedStyle : ''} aria-pressed={penStyle === style} onClick={() => choosePenStyle(style)}><Icon size={20} /><span>{label}</span></button>)}</div>}
         {(tool === 'pen' || tool === 'pencil' || tool === 'highlighter' || isShapeTool(tool as DrawingTool) || tool === 'text') && <div className={s.toolBasics}><div className={s.toolColors}>{(tool === 'highlighter' ? ['#f2ce4f', '#73cdb7', '#89b8f0', '#ef9ab0', ...inkColors] : inkColors).map(c => <button key={c} className={`${s.swatch} ${color === c ? s.selectedSwatch : ''}`} style={{ '--swatch': c } as React.CSSProperties} aria-label={`${t.color} ${c}`} aria-pressed={color === c} onClick={() => changeColor(c)} />)}<label className={s.customColor} title={t.color}><input type="color" value={color} aria-label={t.color} onChange={e => changeColor(e.target.value)} /><Plus size={15} /></label></div>{tool !== 'text' && <label className={s.inspectorSlider}><span>{t.width}</span><input aria-label={t.width} type="range" min="1" max={tool === 'highlighter' ? '40' : '12'} step="0.5" value={width} onChange={e => changeWidth(Number(e.target.value))} /><output>{width}</output></label>}</div>}
         {(tool === 'pen' || tool === 'pencil' || tool === 'highlighter') && <ResponseSlider language={language} value={tool === 'highlighter' ? highlighterTuning.response : inkTuning.response} onChange={response => tool === 'highlighter' ? updateHighlighterTuning({ response }) : updateInkTuning({ response })} />}
         {(tool === 'pen' || tool === 'pencil') && <div className={s.advancedSliders}>{visibleInkSliders.map(key => <label key={key} className={s.inspectorSlider}><span>{t[key]}</span><input type="range" min="0" max="100" value={Math.round(inkTuning[key] * 100)} onChange={event => updateInkTuning({ [key]: Number(event.target.value) / 100 })} /><output>{Math.round(inkTuning[key] * 100)}%</output></label>)}</div>}
          {(tool === 'pen' || tool === 'pencil' || tool === 'highlighter') && <label className={s.inspectorCheck}><input type="checkbox" checked={pressure} onChange={event => setDocumentSetting('stylusPressure', event.target.checked)} />{t.pressure}</label>}
         {(tool === 'pen' || tool === 'pencil' || tool === 'highlighter') && <div className={s.advancedSliders}><label className={s.inspectorCheck}><input type="checkbox" checked={currentShapeHold.enabled} onChange={event => updateShapeHold({ enabled: event.target.checked })} />{t.holdToShape}</label>{currentShapeHold.enabled && <><div className={s.holdExample}><SettingDiagram kind="hold" /><p>{t.holdShapeHint}</p></div><label className={s.inspectorSlider}><span>{t.holdDuration}</span><input type="range" min="300" max="2000" step="100" value={currentShapeHold.delayMs} onChange={event => updateShapeHold({ delayMs: Number(event.target.value) })} /><output>{(currentShapeHold.delayMs / 1000).toFixed(1)} {t.seconds}</output></label></>}</div>}
         {(tool === 'pen' || tool === 'pencil' || tool === 'eraser') && <ScratchOptions language={language} settings={eraserSettings} onChange={updateEraserSettings} />}
         {tool === 'highlighter' && <div className={s.advancedSliders}><label className={s.inspectorSlider}><span>{t.stabilization}</span><input type="range" min="0" max="100" value={Math.round(highlighterTuning.stabilization * 100)} onChange={e => updateHighlighterTuning({ stabilization: Number(e.target.value) / 100 })} /><output>{Math.round(highlighterTuning.stabilization * 100)}%</output></label><label className={s.inspectorSlider}><span>{t.opacity}</span><input type="range" min="0" max="100" value={Math.round(highlighterTuning.opacity * 100)} onChange={e => updateHighlighterTuning({ opacity: Number(e.target.value) / 100 })} /><output>{Math.round(highlighterTuning.opacity * 100)}%</output></label><label className={s.inspectorCheck}><input type="checkbox" checked={highlighterTuning.straight} onChange={e => updateHighlighterTuning({ straight: e.target.checked })} />{t.straightHighlighter}</label></div>}
         {tool === 'eraser' && <div className={s.advancedSliders}><SettingChoices label={t.eraserMode} kind="eraser" value={eraserSettings.mode} options={[{ value: 'precision', label: t.precisionEraser }, { value: 'standard', label: t.standardEraser }, { value: 'stroke', label: t.strokeEraser }]} onChange={mode => updateEraserSettings({ mode })} /><SettingChoices label={t.convertedTextErase} kind="eraseText" value={eraserSettings.convertedText ?? 'word'} options={[{ value: 'word', label: t.eraseWord }, { value: 'line', label: t.eraseLine }]} onChange={convertedText => updateEraserSettings({ convertedText })} /><label className={s.inspectorSlider}><span>{t.eraserSize}</span><input type="range" min="4" max="80" value={eraserSettings.size} onChange={e => updateEraserSettings({ size: Number(e.target.value) })} /><output>{eraserSettings.size}</output></label></div>}
          {tool === 'eraser' && <div className={s.advancedSliders}><strong className={s.inspectorSubheading}>{t.eraserTargets}</strong><div className={s.inspectorChecks}>{(['pen', 'pencil', 'highlighter', 'shapes'] as const).map(target => <label key={target} className={s.inspectorCheck}><input type="checkbox" checked={eraserSettings.targets[target]} onChange={event => updateEraserSettings({ targets: { ...eraserSettings.targets, [target]: event.target.checked } })} />{t[target]}</label>)}</div><label className={s.inspectorCheck}><input type="checkbox" checked={eraserSettings.autoDeselect} onChange={event => updateEraserSettings({ autoDeselect: event.target.checked })} />{t.autoDeselectEraser}</label><label className={s.inspectorCheck}><input type="checkbox" checked={eraserSettings.ignoreStylus} onChange={event => updateEraserSettings({ ignoreStylus: event.target.checked })} />{t.ignoreStylusEraser}</label></div>}
         {isShapeTool(tool as DrawingTool) && <div className={s.advancedSliders}><label className={s.inspectorSlider}><span>{t.fillColor}</span><input type="color" value={fillColor} onChange={e => setFillColor(e.target.value)} /></label><label className={s.inspectorSlider}><span>{t.fillOpacity}</span><input type="range" min="0" max="100" value={Math.round(fillOpacity * 100)} onChange={e => setFillOpacity(Number(e.target.value) / 100)} /><output>{Math.round(fillOpacity * 100)}%</output></label>{(tool === 'square' || tool === 'rectangle') && <label className={s.inspectorSlider}><span>{t.corners}</span><input type="range" min="0" max="60" value={cornerRadius} onChange={e => setCornerRadius(Number(e.target.value))} /><output>{cornerRadius}</output></label>}</div>}
         {(tool === 'pen' || tool === 'pencil') && <div className={s.advancedSliders}>
           <label className={s.inspectorCheck}><input type="checkbox" checked={handwriting.settings.enabled} onChange={event => handwriting.update({ enabled: event.target.checked })} />{t.fontWriting}</label>
           <p className={s.toolHint}>{t.fontWritingHint}</p>
           <WritingFontPicker scope={scope} language={language} value={handwriting.settings.fontFamily} onChange={fontFamily => handwriting.update({ fontFamily })} />
           <label className={s.inspectorSlider}><span>{t.conversionPause}</span><input type="range" min="300" max="3000" step="100" value={handwriting.settings.delayMs} onChange={event => handwriting.update({ delayMs: Number(event.target.value) })} /><output>{(handwriting.settings.delayMs / 1000).toFixed(1)} s</output></label>
           <label className={s.inspectorSlider}><span>{t.textSize}</span><input type="range" min="12" max="64" value={handwriting.settings.fontSize} onChange={event => handwriting.update({ fontSize: Number(event.target.value) })} /><output>{handwriting.settings.fontSize}</output></label>
         </div>}
         {tool === 'lasso' && <p className={s.toolHint}>{t.selectHint}</p>}
         {tool === 'text' && <p className={s.toolHint}>{t.textHint}</p>}
         <div className={s.toolInputOptions}>{tool !== 'hand' && <label className={s.inspectorCheck}><input type="checkbox" checked={allowTouch} onChange={event => setDocumentSetting('drawWithFinger', event.target.checked)} />{t.touch}</label>}<label className={s.inspectorCheck}><input type="checkbox" checked={palmRejection} onChange={event => setDocumentSetting('palmRejection', event.target.checked)} />{t.palmRejection}</label></div>
          {tool === 'text' && <div data-note-text-format className={s.textFormatOptions}>
            <label className={s.inspectorSlider}><span>{t.textSize}</span><input type="range" min="12" max="64" step="1" value={textEdit?.size ?? textSize} onChange={event => { const value = Number(event.target.value); setTextSize(value); setTextEdit(current => current ? { ...current, size: value } : null); saveNotesPreferences(scope, { textSize: value }); }} /><output>{textEdit?.size ?? textSize}</output></label>
            <WritingFontPicker scope={scope} language={language} value={textEdit?.fontFamily ?? textFormatting.fontFamily} onChange={fontFamily => updateTextFormatting({ fontFamily })} />
            <div className={s.textFormatButtons}>{(['bold', 'italic', 'underline', 'strikethrough'] as const).map((style, index) => <button key={style} type="button" aria-label={t[style]} aria-pressed={textEdit?.[style] ?? textFormatting[style]} onPointerDown={event => event.preventDefault()} onClick={() => updateTextFormatting({ [style]: !(textEdit?.[style] ?? textFormatting[style]) })}>{['B', 'I', 'U', 'S'][index]}</button>)}</div>
            <SettingChoices label={t.textAlignment} kind="alignment" value={textEdit?.alignment ?? textFormatting.alignment} options={[{ value: 'auto', label: t.alignAuto }, { value: 'left', label: t.alignLeft }, { value: 'center', label: t.alignCenter }, { value: 'right', label: t.alignRight }]} onChange={alignment => updateTextFormatting({ alignment })} />
            <label className={s.inspectorSlider}><span>{t.lineSpacing}</span><input type="range" min="100" max="250" value={Math.round((textEdit?.lineSpacing ?? textFormatting.lineSpacing ?? 1.35) * 100)} onChange={event => updateTextFormatting({ lineSpacing: Number(event.target.value) / 100 })} /><output>{Math.round((textEdit?.lineSpacing ?? textFormatting.lineSpacing ?? 1.35) * 100)}%</output></label>
          </div>}
       </div>}
     </motion.section>}</AnimatePresence>
    {(error || busy || handwriting.status === 'error') && <div className={s.editorNotice} role="status">{busy ? `${busy}${progress ? ` · ${progress}%` : ''}` : error ? (t[error as keyof typeof t] || t.importFailed) : t.recognitionFailed}{(error || handwriting.status !== 'idle') && <IconButton icon={X} label={t.dismiss} onClick={() => { setError(''); handwriting.cancel(); }} />}</div>}
    <div className={`${s.editorBody} ${documentSettings.sidebarPosition === 'end' ? s.sidebarEnd : ''}`}>
      {showPages && <aside className={s.pageRail} aria-label={t.pages}>
         <div className={s.railHeading}><strong>{t.pages}</strong></div>
        <div className={s.thumbnails} onScroll={() => setHoveredPage(null)}>{notebook.pages.map((p, i) => <button key={p.id} className={`${s.thumbnail} ${p.id === page.id ? s.currentPage : ''}`} onClick={() => navigate(p.id)} onPointerEnter={event => previewPage(p.id, event.currentTarget)} onPointerLeave={() => setHoveredPage(null)} onFocus={event => previewPage(p.id, event.currentTarget)} onBlur={() => setHoveredPage(null)} aria-label={`${t.page} ${i + 1}`} aria-current={p.id === page.id ? 'page' : undefined}><PageThumbnail scope={scope} page={p} active={p.id === page.id} />{(documentSettings.showPageNumbers || p.bookmarked) && <span>{documentSettings.showPageNumbers ? i + 1 : null}{p.bookmarked && <Bookmark size={12} fill="currentColor" />}</span>}</button>)}</div>
        {notebook.pages.some(p => p.outlineTitle) && <nav className={s.outlineList} aria-label={t.outline}>{notebook.pages.map((p, i) => p.outlineTitle && <button key={p.id} onClick={() => navigate(p.id)}>{p.outlineTitle}<small>{i + 1}</small></button>)}</nav>}
      </aside>}
      <div className={`${s.viewport} ${scrollDirection === 'horizontal' ? s.horizontalViewport : ''}`} ref={viewport} dir="ltr" style={{ touchAction: nativeScrolling ? 'pan-x pan-y' : 'none' }}>
        <div className={`${s.paperStage} ${scrollDirection === 'horizontal' ? s.horizontalStage : ''}`} style={{ minWidth: stageWidth }}>
          {notebook.pages.map(p => <div key={p.id} ref={node => { if (node) pageNodes.current.set(p.id, node); else pageNodes.current.delete(p.id); }} onPointerDownCapture={() => { if (currentId.current !== p.id) { currentId.current = p.id; setPageId(p.id); setSelected([]); } }} data-note-page-id={p.id} className={s.pageSlot} style={{ width: p.width * pageScale(p), height: p.height * pageScale(p) }}>
            {mountedPageIds.has(p.id)
              ? <div className={s.paper} style={{ width: p.width * pageScale(p), height: p.height * pageScale(p) }}><PageSurface nativeScroll={nativeScrolling} renderingActive={!scrolling && (p.id === pageId || visiblePageIds.current.has(p.id))} onInkStart={handwriting.begin} onInkEnd={handwriting.end} scope={scope} page={p} tool={activeTool} color={color} width={tool === 'highlighter' ? Math.max(12, width) : width} pressure={pressure} tuning={inkTuning} highlighterTuning={highlighterTuning} shapeHold={currentShapeHold} eraserSettings={eraserSettings} fillColor={fillColor} fillOpacity={fillOpacity} cornerRadius={cornerRadius} allowTouch={allowTouch} palmRejection={palmRejection} scale={pageScale(p)} selectionIds={p.id === pageId ? selected : EMPTY_SELECTION} hiddenElementId={textEdit?.pageId === p.id ? textEdit.id : undefined} aspectLocked={aspectLocked} onChange={(elements: NoteElement[]) => changeInkElements(p.id, elements)} onSelect={ids => { currentId.current = p.id; setPageId(p.id); setSelected(ids); }} onTextRequest={(point, existingId) => requestText(p.id, point, existingId)} onPan={panBy} onEraserUsed={() => { if (eraserSettings.autoDeselect) selectTool(lastWritingTool.current, false); }} registerTouchCancellation={registerTouchCancellation} onError={reportError} loadingLabel={t.loadingPdfPage} errorLabel={t.pdfPageUnavailable} /></div>
              : <div className={`${s.paper} ${s.paperPlaceholder}`} aria-hidden style={{ width: p.width * pageScale(p), height: p.height * pageScale(p), background: p.paperColor }} />}
             {textEdit?.pageId === p.id && <div data-note-inline-text className={s.inlineTextEditor} style={{ left: textEdit.x * pageScale(p), top: textEdit.y * pageScale(p), width: Math.max(80, (textEdit.w ?? 260) * pageScale(p)), transform: `rotate(${textEdit.rotation ?? 0}deg) ${textEdit.transform ? `matrix(${textEdit.transform.join(',')},0,0)` : ''}` }}>
               <textarea ref={textInputRef} autoFocus rows={1} dir="auto" aria-label={t.text} placeholder={t.textPlaceholder} value={textEdit.value} onChange={event => setTextEdit(current => current ? { ...current, value: event.target.value } : null)} onPointerDown={event => { if (event.pointerType === 'pen') lastTextPencilDown.current = performance.now(); }} onSelect={event => { const input = event.currentTarget; if (performance.now() - lastTextPencilDown.current < 1200 && input.selectionStart !== input.selectionEnd) input.setSelectionRange(input.selectionEnd, input.selectionEnd); }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); setTextEdit(null); } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submitText(); } }} onBlur={event => { const next = event.relatedTarget; if (next instanceof Element && next.closest('[data-note-text-format]')) return; if (next instanceof Node && event.currentTarget.parentElement?.contains(next)) return; submitText(); }} style={{ fontFamily: textCssFamily(textEdit.fontFamily), fontSize: textEdit.size * pageScale(p), lineHeight: textEdit.lineSpacing, color: textEdit.color, fontWeight: textEdit.bold ? 700 : 400, fontStyle: textEdit.italic ? 'italic' : 'normal', textDecoration: [textEdit.underline && 'underline', textEdit.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none', textAlign: textEdit.alignment === 'auto' ? 'start' : textEdit.alignment }} />
               <div className={s.inlineTextActions}><button type="button" className={s.inlineTextMove} aria-label={t.moveText} title={t.moveText} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); textDrag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: textEdit.x, y: textEdit.y, pageId: p.id }; }} onPointerMove={event => { const drag = textDrag.current; if (!drag || drag.pointerId !== event.pointerId) return; const ratio = pageScale(p); setTextEdit(current => current && current.pageId === drag.pageId ? { ...current, x: Math.max(0, Math.min(p.width - 30, drag.x + (event.clientX - drag.clientX) / ratio)), y: Math.max(0, Math.min(p.height - 20, drag.y + (event.clientY - drag.clientY) / ratio)) } : current); }} onPointerUp={() => { textDrag.current = null; }} onPointerCancel={() => { textDrag.current = null; }}><Move size={15} /></button><button type="button" aria-label={t.save} onPointerDown={event => event.preventDefault()} onClick={submitText}><Check size={14} /></button><button type="button" aria-label={t.cancel} onPointerDown={event => event.preventDefault()} onClick={() => setTextEdit(null)}><X size={14} /></button></div>
             </div>}
          </div>)}
          {documentSettings.pullToAddPage && !locked && <button ref={pullIndicator} type="button" data-note-pull-page className={s.pullPage} onTouchStart={() => { suppressPullClick.current = true; }} onPointerDown={event => { if (event.pointerType !== 'touch') suppressPullClick.current = false; }} onClick={event => { if (event.detail && suppressPullClick.current) { suppressPullClick.current = false; return; } if ((event.nativeEvent as PointerEvent).pointerType !== 'touch') addPageAt('end'); }} style={{ '--pull-progress': '0%' } as React.CSSProperties}>{t.pullToAddPage}</button>}
        </div>
      </div>
      {showZoomWindow && <section className={s.zoomWindow} aria-label={t.zoomWindow}>
        <div className={s.zoomWindowHeader}><strong>{t.zoomWindow}</strong><span>{documentSettings.autoAdvanceZoom !== false ? t.autoAdvanceZoom : ''}</span><IconButton icon={ChevronRight} label={t.advanceZoomWindow} onClick={advanceZoomWindow} /><IconButton icon={X} label={t.closeZoomWindow} onClick={() => setShowZoomWindow(false)} /></div>
        <div ref={zoomWindowViewport} className={s.zoomWindowViewport} dir="ltr"><PageSurface onInkStart={handwriting.begin} onInkEnd={handwriting.end} scope={scope} page={page} tool={activeTool} color={color} width={tool === 'highlighter' ? Math.max(12, width) : width} pressure={pressure} tuning={inkTuning} highlighterTuning={highlighterTuning} shapeHold={currentShapeHold} eraserSettings={eraserSettings} fillColor={fillColor} fillOpacity={fillOpacity} cornerRadius={cornerRadius} allowTouch={allowTouch} palmRejection={palmRejection} scale={zoomWindowScale} selectionIds={selected} hiddenElementId={textEdit?.pageId === page.id ? textEdit.id : undefined} aspectLocked={aspectLocked} onChange={changeFromZoomWindow} onSelect={ids => setSelected(ids)} onTextRequest={(point, existingId) => requestText(page.id, point, existingId)} onPan={(dx, dy) => { const el = zoomWindowViewport.current; if (el) { el.scrollLeft -= dx; el.scrollTop -= dy; } }} onEraserUsed={() => { if (eraserSettings.autoDeselect) selectTool(lastWritingTool.current, false); }} registerTouchCancellation={registerTouchCancellation} onError={reportError} loadingLabel={t.loadingPdfPage} errorLabel={t.pdfPageUnavailable} /></div>
      </section>}
      {!locked && !!selected.length && <div className={`${s.selectionBar} ${showZoomWindow ? s.selectionBarRaised : ''}`} role="toolbar" aria-label={t.selection}>
        {page.elements.some(element => selected.includes(element.id) && isWritingInk(element)) && <IconButton icon={Type} label={t.convertWriting} disabled={handwriting.status === 'loading' || handwriting.status === 'recognizing'} onClick={() => void handwriting.convert(page.id, page.elements.filter((element): element is InkStroke => selected.includes(element.id) && isWritingInk(element)))} />}
        {selectedText?.sourceInk && <IconButton icon={Undo2} label={t.restoreWriting} onClick={() => { handwriting.cancel(); changePage(current => ({ ...current, elements: current.elements.flatMap(element => element.id === selectedText.id ? restoredInk(selectedText) : [element]) })); setSelected([]); }} />}
        <IconButton icon={aspectLocked ? LockKeyhole : UnlockKeyhole} label={aspectLocked ? t.keepAspect : t.freeResize} active={aspectLocked} onClick={() => setAspectLocked(value => !value)} />
        <IconButton icon={RotateCcw} label={t.rotateLeft} onClick={() => changePage(p => ({ ...p, elements: rotateElements(p.elements, selected, -15) }))} />
        <IconButton icon={RotateCw} label={t.rotateRight} onClick={() => changePage(p => ({ ...p, elements: rotateElements(p.elements, selected, 15) }))} />
        <IconButton icon={ZoomOut} label={t.smaller} onClick={() => changePage(p => ({ ...p, elements: resizeElements(p.elements, selected, .9) }))} />
        <IconButton icon={ZoomIn} label={t.larger} onClick={() => changePage(p => ({ ...p, elements: resizeElements(p.elements, selected, 1.1) }))} />
        <IconButton icon={ArrowUp} label={t.bringForward} onClick={() => changePage(p => ({ ...p, elements: reorderElements(p.elements, selected, 'forward') }))} />
        <IconButton icon={ArrowDown} label={t.sendBackward} onClick={() => changePage(p => ({ ...p, elements: reorderElements(p.elements, selected, 'backward') }))} />
        {selected.length > 1 && <IconButton icon={Group} label={t.group} onClick={() => changePage(p => ({ ...p, elements: groupElements(p.elements, selected, newId()) }))} />}
        {selectedHasGroup && <IconButton icon={Ungroup} label={t.ungroup} onClick={() => changePage(p => ({ ...p, elements: ungroupElements(p.elements, selected) }))} />}
        {selectedShape && <IconButton icon={Settings2} label={t.shapeStyle} onClick={() => setDialog('shapeStyle')} />}
        <IconButton icon={Copy} label={t.copySelection} onClick={() => { const groups = new Map<string, string>(); const copies = page.elements.filter(e => selected.includes(e.id)).map(e => { const groupId = e.groupId ? (groups.get(e.groupId) ?? (() => { const id = newId(); groups.set(e.groupId!, id); return id; })()) : undefined; return { ...e, id: newId(), ...(groupId ? { groupId } : {}) }; }); const ids = copies.map(e => e.id); changePage(p => ({ ...p, elements: [...p.elements, ...translateElements(copies, ids, 20, 20)] })); setSelected(ids); }} />
        {selectedText && <>
          <IconButton icon={Type} label={t.editText} onClick={() => requestText(page.id, { x: 0, y: 0 }, selectedText.id)} />
          <label className={s.contextTextField}><span>{t.textSize}</span><input type="number" min="6" max="144" value={selectedText.fontSize} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 6 && value <= 144) updateSelectedText({ fontSize: value }); }} /></label>
          <WritingFontPicker scope={scope} language={language} value={selectedText.fontFamily ?? 'sans'} onChange={fontFamily => updateSelectedText({ fontFamily })} />
          {(['bold', 'italic', 'underline', 'strikethrough'] as const).map((property, i) => <button key={property} type="button" className={`${s.textFormatButton} ${selectedText[property] ? s.activeTool : ''}`} aria-label={t[property]} title={t[property]} aria-pressed={!!selectedText[property]} onClick={() => updateSelectedText({ [property]: !selectedText[property] })}>{['B', 'I', 'U', 'S'][i]}</button>)}
          <SettingChoices label={t.textAlignment} kind="alignment" value={selectedText.alignment ?? 'auto'} options={[{ value: 'auto', label: t.alignAuto }, { value: 'left', label: t.alignLeft }, { value: 'center', label: t.alignCenter }, { value: 'right', label: t.alignRight }]} onChange={alignment => updateSelectedText({ alignment })} />
          <label className={s.contextTextField}><span>{t.lineSpacing}</span><input type="number" min="1" max="3" step="0.05" value={selectedText.lineSpacing ?? 1.35} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 1 && value <= 3) updateSelectedText({ lineSpacing: value }); }} /></label>
        </>}
        <IconButton icon={Trash2} label={t.deleteSelection} onClick={() => { changePage(p => ({ ...p, elements: p.elements.filter(e => !selected.includes(e.id)) })); setSelected([]); }} />
        <IconButton icon={X} label={t.clearSelection} onClick={() => setSelected([])} />
      </div>}
    </div>
    <footer className={`${s.editorFooter} ${documentSettings.showStatusBar === false ? s.footerCompact : ''}`}>
       <div><IconButton icon={ChevronLeft} label={t.earlier} disabled={index === 0} onClick={() => navigate(notebook.pages[index - 1].id)} />{documentSettings.showStatusBar !== false && documentSettings.showPageNumbers && <span dir="ltr">{index + 1} / {notebook.pages.length}</span>}<IconButton icon={ChevronRight} label={t.later} disabled={index === notebook.pages.length - 1} onClick={() => navigate(notebook.pages[index + 1].id)} /></div>
      {documentSettings.showStatusBar !== false && <span className={s.penHint}>{locked ? t.lockedHint : tool === 'lasso' ? t.selectHint : t.palm}</span>}
       <div><IconButton icon={ScanSearch} label={showZoomWindow ? t.closeZoomWindow : t.zoomWindow} active={showZoomWindow} onClick={() => setShowZoomWindow(value => !value)} /><IconButton icon={ZoomOut} label={t.zoomOut} onClick={() => zoomAt(1 / 1.2)} /><button className={s.zoomLabel} onClick={() => setZoom(clampZoom(1))} title={t.fit}>{Math.round(zoom * 100)}%</button><IconButton icon={ZoomIn} label={t.zoomIn} onClick={() => zoomAt(1.2)} /><IconButton icon={Maximize} label={t.fullscreen} onClick={enterFullScreen} /></div>
    </footer>
    <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void doImport(e.target.files?.[0], true)} />
    <input ref={imagePageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void addImagePage(e.target.files?.[0])} />
    <input ref={cameraInput} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => void addImagePage(e.target.files?.[0])} />
    <input ref={scanInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { setScanFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
    <input ref={pdfInput} hidden type="file" accept="application/pdf,.pdf" onChange={e => void doImport(e.target.files?.[0], false)} />
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'export'} onClose={() => setDialog(null)} title={t.export}><div className={s.form}><button className={s.optionButton} onClick={() => void doExport(true)}><FileText size={22} />{t.pdf}</button><button className={s.optionButton} onClick={() => void doExport(false)}><ImageIcon size={22} />{t.png}</button><p className={s.formHint}>{t.exportHint}</p></div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'shapeStyle'} onClose={() => setDialog(null)} title={t.shapeStyle}><div className={s.form}>
      <label>{t.strokeColor}<input type="color" value={selectedShape?.color ?? color} onChange={event => updateSelectedShapes({ color: event.target.value })} /></label>
      <label>{t.width}<input type="range" min="1" max="24" step=".5" value={selectedShape?.width ?? width} onChange={event => updateSelectedShapes({ width: Number(event.target.value) })} /></label>
      <label>{t.fillColor}<input type="color" value={selectedShape?.fillColor ?? fillColor} onChange={event => updateSelectedShapes({ fillColor: event.target.value })} /></label>
      <label>{t.fillOpacity}<input type="range" min="0" max="100" value={Math.round((selectedShape?.fillOpacity ?? 0) * 100)} onChange={event => updateSelectedShapes({ fillOpacity: Number(event.target.value) / 100 })} /></label>
      {selectedShape && (selectedShape.tool === 'rectangle' || selectedShape.tool === 'square') && <label>{t.corners}<input type="range" min="0" max="60" value={selectedShape.cornerRadius ?? 0} onChange={event => updateSelectedShapes({ cornerRadius: Number(event.target.value) })} /></label>}
    </div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'inkSettings'} onClose={() => setDialog(null)} title={t.inkSettings}><div className={s.form}>
      <InkPreview conversion={{ scope, fontFamily: handwriting.settings.fontFamily, label: t.testFontConversion, busyLabel: t.recognizingInk, errorLabel: t.recognitionFailed }} tool={tool === 'pencil' ? 'pencil' : 'pen'} color={color} width={width} tuning={inkTuning} pressure={pressure} label={t.tryInk} clearLabel={t.clearInkPreview} hint={t.inkPreviewHint} />
      {tool === 'pen' && <SettingChoices label={t.penStyle} kind="pen" value={penStyle} options={[{ value: 'fountain', label: t.fountainPen }, { value: 'ball', label: t.ballPen }, { value: 'brush', label: t.brushPen }]} onChange={choosePenStyle} />}
      <ResponseSlider language={language} value={inkTuning.response} onChange={response => updateInkTuning({ response })} />
      <ScratchOptions language={language} settings={eraserSettings} onChange={updateEraserSettings} />
      {visibleInkSliders.map(key => <label key={key}>{t[key]}<input type="range" min="0" max="100" value={Math.round(inkTuning[key] * 100)} onChange={event => updateInkTuning({ [key]: Number(event.target.value) / 100 })} /><output>{Math.round(inkTuning[key] * 100)}%</output></label>)}
      <label className={s.toggle}><span>{t.pressure}</span><input type="checkbox" checked={pressure} onChange={event => setDocumentSetting('stylusPressure', event.target.checked)} /></label>
      <p className={s.formHint}>{t.stylusRotationHint}</p>
    </div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'highlighterSettings'} onClose={() => setDialog(null)} title={t.highlighterSettings}><div className={s.form}>
      <InkPreview conversion={{ scope, fontFamily: handwriting.settings.fontFamily, label: t.testFontConversion, busyLabel: t.recognizingInk, errorLabel: t.recognitionFailed }} tool="highlighter" color={color} width={Math.max(12, width)} tuning={inkTuning} highlight={highlighterTuning} pressure={false} label={t.tryInk} clearLabel={t.clearInkPreview} hint={t.inkPreviewHint} />
      <label>{t.highlighterColors}</label><div className={s.colorChoices}>{['#f2ce4f', '#73cdb7', '#89b8f0', '#ef9ab0'].map(value => <button key={value} type="button" className={`${s.swatch} ${color === value ? s.selectedSwatch : ''}`} style={{ '--swatch': value } as React.CSSProperties} aria-label={`${t.highlighterColors} ${value}`} onClick={() => setColor(value)} />)}</div>
      <SettingChoices label={t.highlighterSizes} kind="width" value={width} options={[12, 20, 30, 40].map(value => ({ value, label: String(value) }))} onChange={setWidth} />
      <ResponseSlider language={language} value={highlighterTuning.response} onChange={response => updateHighlighterTuning({ response })} />
      <label>{t.stabilization}<input type="range" min="0" max="100" value={Math.round(highlighterTuning.stabilization * 100)} onChange={event => updateHighlighterTuning({ stabilization: Number(event.target.value) / 100 })} /></label>
      <label>{t.opacity}<input type="range" min="0" max="100" value={Math.round(highlighterTuning.opacity * 100)} onChange={event => updateHighlighterTuning({ opacity: Number(event.target.value) / 100 })} /></label>
      <label className={s.toggle}><span>{t.straightHighlighter}</span><input type="checkbox" checked={highlighterTuning.straight} onChange={event => updateHighlighterTuning({ straight: event.target.checked })} /></label>
    </div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'eraserSettings'} onClose={() => setDialog(null)} title={t.eraserSettings}><div className={s.form}>
      <ScratchOptions language={language} settings={eraserSettings} onChange={updateEraserSettings} />
      <SettingChoices label={t.eraserMode} kind="eraser" value={eraserSettings.mode} options={[{ value: 'precision', label: t.precisionEraser }, { value: 'standard', label: t.standardEraser }, { value: 'stroke', label: t.strokeEraser }]} onChange={mode => updateEraserSettings({ mode })} /><SettingChoices label={t.convertedTextErase} kind="eraseText" value={eraserSettings.convertedText ?? 'word'} options={[{ value: 'word', label: t.eraseWord }, { value: 'line', label: t.eraseLine }]} onChange={convertedText => updateEraserSettings({ convertedText })} />
      <label>{t.eraserSize}<input type="range" min="4" max="80" value={eraserSettings.size} onChange={event => updateEraserSettings({ size: Number(event.target.value) })} /><output>{eraserSettings.size}</output></label>
      <label>{t.eraserTargets}</label>
      {(['pen', 'pencil', 'highlighter', 'shapes'] as const).map(target => <label key={target} className={s.toggle}><span>{t[target]}</span><input type="checkbox" checked={eraserSettings.targets[target]} onChange={event => updateEraserSettings({ targets: { ...eraserSettings.targets, [target]: event.target.checked } })} /></label>)}
      <label className={s.toggle}><span>{t.autoDeselectEraser}</span><input type="checkbox" checked={eraserSettings.autoDeselect} onChange={event => updateEraserSettings({ autoDeselect: event.target.checked })} /></label>
      <label className={s.toggle}><span>{t.ignoreStylusEraser}</span><input type="checkbox" checked={eraserSettings.ignoreStylus} onChange={event => updateEraserSettings({ ignoreStylus: event.target.checked })} /></label>
    </div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'paper'} onClose={() => setDialog(null)} title={t.pageSettings}><div className={s.form}>
      <button className={s.optionButton} onClick={() => { setGoToNumber(index + 1); setDialog('goToPage'); }}><FileText size={19} />{t.goToPage}</button>
      <div className={s.paperChoices}><button onClick={() => { changePage(p => rotateNotePage(p, 'counterclockwise')); setDialog(null); }}><RotateCcw size={16} />{t.rotatePageLeft}</button><button onClick={() => { changePage(p => rotateNotePage(p, 'clockwise')); setDialog(null); }}><RotateCw size={16} />{t.rotatePageRight}</button></div>
      <label>{t.outlineTitle}<input maxLength={100} value={outlineDraft} onChange={event => setOutlineDraft(event.target.value)} placeholder={t.outlineTitle} /></label><button className={s.optionButton} onClick={() => { changePage(p => ({ ...p, outlineTitle: outlineDraft.trim() || undefined })); setDialog(null); }}><Bookmark size={19} />{outlineDraft.trim() ? t.addToOutline : t.removeFromOutline}</button>
      <button className={s.optionButton} disabled={!page.elements.length} onClick={() => setDialog('clearPage')}><Eraser size={19} />{t.clearPage}</button>
      {!page.background && <><SettingChoices label={t.paper} kind="paper" value={page.paper} options={PAPER_STYLES.map(value => ({ value, label: t[value] }))} onChange={value => { changePage(old => ({ ...old, paper: value })); rememberTemplate(value); }} /><label>{t.pageColor}</label><div className={s.colorChoices}>{['#fffef9', '#ffffff', '#f8f1dc', '#edf4ef', '#eef3f9'].map(c => <button key={c} className={`${s.swatch} ${page.paperColor === c ? s.selectedSwatch : ''}`} style={{ '--swatch': c } as React.CSSProperties} aria-label={`${t.pageColor} ${c}`} onClick={() => changePage(p => ({ ...p, paperColor: c }))} />)}</div></>}
      <button className={s.optionButton} onClick={() => changePage(p => ({ ...p, bookmarked: !p.bookmarked }))}><Bookmark size={19} fill={page.bookmarked ? 'currentColor' : 'none'} />{t.bookmark}</button>
      <button className={s.optionButton} onClick={() => { const next = { ...page, id: newId(), elements: page.elements.map(e => ({ ...e, id: newId() })) }; const pages = [...notebook.pages]; pages.splice(index + 1, 0, next); commit(pages); navigate(next.id); setDialog(null); }}><Copy size={19} />{t.duplicatePage}</button>
      <div className={s.inlineActions}><button disabled={index === 0} onClick={() => { const pages = [...notebook.pages]; [pages[index - 1], pages[index]] = [pages[index], pages[index - 1]]; commit(pages); }}><ArrowUp size={16} />{t.earlier}</button><button disabled={index === notebook.pages.length - 1} onClick={() => { const pages = [...notebook.pages]; [pages[index + 1], pages[index]] = [pages[index], pages[index + 1]]; commit(pages); }}><ArrowDown size={16} />{t.later}</button></div>
      <button className={s.optionButton} onClick={() => setDialog('pageTrash')}><Trash2 size={19} />{t.pageTrash}{notebook.pageTrash?.length ? ` (${notebook.pageTrash.length})` : ''}</button>
      <button className={`${s.optionButton} ${s.danger}`} disabled={notebook.pages.length === 1} onClick={() => setDialog('deletePage')}><Trash2 size={19} />{t.deletePage}</button>
    </div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'goToPage'} onClose={() => setDialog(null)} title={t.goToPage}><form className={s.form} onSubmit={event => { event.preventDefault(); const target = notebook.pages[Math.min(notebook.pages.length, Math.max(1, goToNumber)) - 1]; if (target) { navigate(target.id); setDialog(null); } }}><label>{t.pageNumber}<input type="number" min="1" max={notebook.pages.length} value={goToNumber} onChange={event => setGoToNumber(Number(event.target.value))} /></label><button type="submit" className={s.primaryButton}>{t.goToPage}</button></form></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'clearPage'} onClose={() => setDialog(null)} title={t.clearPage}><p>{t.clearPageHint}</p><div className={s.dialogActions}><button onClick={() => setDialog(null)}>{t.cancel}</button><button className={s.dangerButton} onClick={() => { changePage(p => ({ ...p, elements: [] })); setSelected([]); setDialog(null); }}>{t.clearPage}</button></div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'pageTrash'} onClose={() => setDialog(null)} title={t.pageTrash}><div className={s.form}>{notebook.pageTrash?.length ? notebook.pageTrash.map(entry => <button key={entry.page.id} className={s.optionButton} onClick={() => { const pages = [...live.current.pages]; pages.splice(Math.min(entry.index, pages.length), 0, entry.page); commit(pages, live.current.pageTrash?.filter(item => item.page.id !== entry.page.id)); navigate(entry.page.id); setDialog(null); }}>{t.restorePage} · {entry.page.outlineTitle || `${t.page} ${entry.index + 1}`}</button>) : <p>{t.emptyPageTrash}</p>}</div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog === 'deletePage'} onClose={() => setDialog(null)} title={t.deletePage}><p>{t.deletePageHint}</p><div className={s.dialogActions}><button onClick={() => setDialog(null)}>{t.cancel}</button><button className={s.dangerButton} onClick={() => { const remaining = notebook.pages.filter(p => p.id !== page.id); const next = remaining[Math.min(index, remaining.length - 1)]; commit(remaining, [...(notebook.pageTrash ?? []), { page, index, deletedAt: Date.now() }]); navigate(next.id); setDialog(null); }}>{t.delete}</button></div></Modal>
    {hoveredPage && showPages && documentSettings.hoverPreview !== false && typeof document !== 'undefined' && createPortal(<div className={s.hoverPreview} role="tooltip" style={{ left: hoveredPage.left, top: hoveredPage.top }}><PageThumbnail scope={scope} page={notebook.pages.find(item => item.id === hoveredPage.id) ?? page} active previewWidth={280} /><span>{t.page} {notebook.pages.findIndex(item => item.id === hoveredPage.id) + 1}</span></div>, document.body)}
    {scanFile && <DocumentScanner file={scanFile} language={language} onClose={() => setScanFile(null)} onSave={saveScan} />}
  </div>;
}
