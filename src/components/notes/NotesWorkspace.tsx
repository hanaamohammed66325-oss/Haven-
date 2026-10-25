'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookOpen, Folder, Plus, Search, Star, Clock3, CalendarDays, Bell, BellOff, Trash2, MoreHorizontal, Upload, ChevronRight, X, HardDrive, LayoutGrid, FileText, RefreshCw, Settings2, Download, Loader2, NotebookTabs, PanelLeftClose, GraduationCap, StickyNote, ClipboardList, Shield, Timer } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store';
import type { ThemeId } from '@/types';
import { plural } from '@/lib/format';
import { useNotesLibrary } from '@/lib/notes/useNotesLibrary';
import { notesCopy } from '@/lib/notes/copy';
import { DEFAULT_NOTE_DOCUMENT_SETTINGS, newId, newNotebook, newPage } from '@/lib/notes/types';
import type { Notebook, NoteFolder, PaperStyle, NoteDocumentSettings, NoteScrollDirection } from '@/lib/notes/types';
import { folderSection, notebookSection, moveLibraryItem, canMoveLibraryItem, type LibraryItemRef, type LibraryDestination } from '@/lib/notes/libraryActions';
import { readNotesPreferences, saveNotesPreferences } from '@/lib/notes/notesPreferences';
import { COVER_COLORS, PAPER_STYLES, importPdf, importImage, exportPdf } from '@/lib/notes/media';
import { NotebookEditor, IconButton } from './NotebookEditor';
import { SettingChoices, SettingDiagram } from './SettingChoices';
import { CourseTimeCarousel } from './CourseTimeCarousel';
import { PageThumbnail } from './PageSurface';
import { useLibraryDrag } from './useLibraryDrag';
import { FolderOpen, GripVertical, Move } from 'lucide-react';
import s from './notes.module.css';

type View = 'all' | 'recent' | 'favorites' | 'trash' | 'folder';
type Dialog = { type: 'note' | 'folder' | 'divider' | 'editDivider' | 'removeDivider' | 'info' | 'removeFolder' | 'newTab' | 'add'; id?: string } | null;
type DividerId = 'courses' | 'personal' | string;

export function NotesWorkspace({ preview = false }: { preview?: boolean }) {
  const { language, accountId, hydrated } = useStore();
  const t = notesCopy(language);
  if (!preview && (!hydrated || !accountId)) return <div className={s.loading}>{t.loading}</div>;
  return <Workspace key={preview ? 'preview' : accountId!} scope={preview ? 'notes-preview-v1' : `account:${accountId}`} preview={preview} />;
}

function Workspace({ scope, preview }: { scope: string; preview: boolean }) {
  const { language, courses, theme } = useStore();
  const t = notesCopy(language);
  const { library, update, status, retry } = useNotesLibrary(scope);
  const reducedMotion = useReducedMotion();
  const [expandedDivider, setExpandedDivider] = useState<string | null>(null);
  const [activeDivider, setActiveDivider] = useState<DividerId>('courses');
  const [folderOptions, setFolderOptions] = useState<string | null>(null);
  const [clockFormat, setClockFormat] = useState<'12' | '24'>(() => readNotesPreferences(scope).clockFormat);
  const [previewTheme, setPreviewTheme] = useState<ThemeId | null>(null);
  const [classPrompt, setClassPrompt] = useState<{ folderId: string; courseName: string } | null>(null);
  const [view, setView] = useState<View>('all');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [splitCount, setSplitCount] = useState<1 | 2 | 3 | 4>(1);
  const [paneIds, setPaneIds] = useState<(string | null)[]>([]);
  const [activePane, setActivePane] = useState(0);
  const [maximizedPane, setMaximizedPane] = useState<number | null>(null);
  const [splitX, setSplitX] = useState(50);
  const [splitY, setSplitY] = useState(50);
  const [thirdWidths, setThirdWidths] = useState<[number, number, number]>([33.3, 33.3, 33.4]);
  const splitRoot = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('updated');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COVER_COLORS[0]);
  const [cover, setCover] = useState<Notebook['cover']>('none');
  const [documentDraft, setDocumentDraft] = useState<NoteDocumentSettings>(DEFAULT_NOTE_DOCUMENT_SETTINGS);
  const [directionDraft, setDirectionDraft] = useState<NoteScrollDirection>('vertical');
  const [starredDraft, setStarredDraft] = useState(false);
  const [targetSection, setTargetSection] = useState('personal');
  const [moveItem, setMoveItem] = useState<LibraryItemRef | null>(null);
  const [moveDestination, setMoveDestination] = useState<LibraryDestination>({ dividerId: 'personal', folderId: null });
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  const [paper, setPaper] = useState<PaperStyle>('ruled');
  const [notebookKind, setNotebookKind] = useState<'lecture' | 'note'>('note');
  const [defaultDirection, setDefaultDirection] = useState(() => readNotesPreferences(scope).scrollDirection);
  const [appearance, setAppearance] = useState<'auto' | 'light' | 'dark'>(() => readNotesPreferences(scope).appearance);
  const changeAppearance = (value: 'auto' | 'light' | 'dark') => { setAppearance(value); saveNotesPreferences(scope, { appearance: value }); };
  const activeTheme = preview && previewTheme ? previewTheme : theme;
  const folderColor = (folder: NoteFolder) => courses.find(course => course.id === folder.courseId)?.color || folder.color;
  const darkMode = appearance === 'dark' || (appearance === 'auto' && activeTheme === 'midnight');
  const [targetFolder, setTargetFolder] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [dividerName, setDividerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [railOpen, setRailOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const fileInput = useRef<HTMLInputElement>(null);
  const libraryImageInput = useRef<HTMLInputElement>(null);
  const newTabPdfInput = useRef<HTMLInputElement>(null);
  const newTabImageInput = useRef<HTMLInputElement>(null);
  const performMove = useCallback((item: LibraryItemRef, destination: LibraryDestination) => {
    update(old => moveLibraryItem(old, item, destination));
    setMoveItem(null); setDialog(null); setFolderOptions(null); setMoveAnnouncement(t.moved);
  }, [update, t.moved]);
  const drag = useLibraryDrag(library, performMove);
  useEffect(() => { setDefaultDirection(readNotesPreferences(scope).scrollDirection); }, [scope]);
  useEffect(() => {
    if (!preview) return;
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', activeTheme);
    return () => { if (previous) root.setAttribute('data-theme', previous); else root.removeAttribute('data-theme'); };
  }, [preview, activeTheme]);
  useEffect(() => {
    if (!library || !courses.length) return;
    const unlinked = courses.filter(course => !library.folders.some(folder => folder.courseId === course.id));
    if (!unlinked.length) return;
    update(old => {
      const folders = [...old.folders];
      for (const course of courses) {
        if (folders.some(folder => folder.courseId === course.id)) continue;
        const match = folders.find(folder => !folder.parentId && folder.title.trim().toLocaleLowerCase() === course.name.trim().toLocaleLowerCase() && (!folder.courseId || !courses.some(item => item.id === folder.courseId)));
        if (match) folders[folders.indexOf(match)] = { ...match, courseId: course.id, dividerId: undefined };
        else folders.push({ id: newId(), parentId: null, title: course.name, color: course.color || COVER_COLORS[0], courseId: course.id, promptAtClass: false });
      }
      return { ...old, folders };
    });
  }, [courses, library?.folders, update]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!library || classPrompt) return;
    const minute = now.getHours() * 60 + now.getMinutes();
    for (const folder of library.folders) {
      if (!folder.promptAtClass || !folder.courseId) continue;
      const course = courses.find(item => item.id === folder.courseId);
      const session = course?.sessions.find(item => {
        if (item.day !== now.getDay() || !item.time) return false;
        const [hour, min] = item.time.split(':').map(Number);
        return minute >= hour * 60 + min && minute < hour * 60 + min + Math.min(item.minutes, 30);
      });
      if (!course || !session) continue;
      const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      const key = `haven-notes:class-prompt:${scope}:${day}:${session.id}`;
      if (localStorage.getItem(key)) continue;
      localStorage.setItem(key, 'shown');
      setClassPrompt({ folderId: folder.id, courseName: course.name });
      break;
    }
  }, [library, courses, now, classPrompt, scope]);
  useEffect(() => { const previous = document.title; document.title = `${t.notes} · Haven`; return () => { document.title = previous; }; }, [t.notes]);
  useEffect(() => {
    if (!folderOptions) return;
    const dismiss = (event: PointerEvent) => { if (!(event.target as Element).closest('[data-notes-folder-menu]')) setFolderOptions(null); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [folderOptions]);
  const setNotebook = useCallback((notebook: Notebook) => update(old => ({ ...old, notebooks: old.notebooks.map(n => n.id === notebook.id ? notebook : n) })), [update]);
  const saveWarning = status === 'error' || status === 'conflict';
  const saveLabel = status === 'saving' ? t.saving : saveWarning ? t.error : t.saved;
  const notebook = library?.notebooks.find(n => n.id === openId && !n.deletedAt);
  const openTabs = openIds.flatMap(id => { const tab = library?.notebooks.find(note => note.id === id && !note.deletedAt); return tab ? [tab] : []; });
  const openNotebook = (id: string, forceTab = false) => {
    setOpenIds(ids => forceTab || splitCount > 1 || readNotesPreferences(scope).openAsTabs ? ids.includes(id) ? ids : [...ids, id] : [id]);
    if (splitCount > 1) setPaneIds(ids => { const next = [...ids]; const empty = next.indexOf(null); next[empty >= 0 ? empty : activePane] = id; return next; });
    setOpenId(id);
  };
  const closeTab = (id: string) => {
    if (paneIds[maximizedPane ?? -1] === id) setMaximizedPane(null);
    const remaining = openIds.filter(open => open !== id);
    setOpenIds(remaining);
    setPaneIds(ids => ids.map(open => open === id ? null : open));
    if (openId === id) setOpenId(remaining.at(-1) ?? null);
    if (!remaining.length) { setSplitCount(1); setPaneIds([]); }
  };
  const changeSplitCount = (count: 1 | 2 | 3 | 4) => {
    setMaximizedPane(null);
    if (count === 1) { setSplitCount(1); setOpenId(paneIds[activePane] ?? openId); return; }
    const occupied = [openId, ...openIds.filter(id => id !== openId)].filter((id): id is string => !!id);
    setPaneIds(previous => Array.from({ length: count }, (_, index) => previous[index] ?? occupied[index] ?? null));
    setActivePane(0);
    setSplitCount(count);
  };
  const assignPane = (index: number, id: string) => {
    if (maximizedPane === index && paneIds[index] !== id) setMaximizedPane(null);
    setPaneIds(ids => ids.map((current, at) => at === index ? id : current));
    setActivePane(index); setOpenId(id);
  };
  const startSplitResize = (axis: 'x' | 'y', boundary: number, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const root = splitRoot.current; if (!root) return;
    const start = axis === 'x' ? event.clientX : event.clientY;
    const span = axis === 'x' ? root.clientWidth : root.clientHeight;
    const initial = splitCount === 3 ? [...thirdWidths] : axis === 'x' ? splitX : splitY;
    const onMove = (move: PointerEvent) => {
      const delta = ((axis === 'x' ? move.clientX : move.clientY) - start) / Math.max(1, span) * 100 * (language === 'ar' && axis === 'x' ? -1 : 1);
      if (splitCount === 3 && Array.isArray(initial)) {
        const next = [...initial] as [number, number, number];
        const adjusted = Math.max(20, Math.min(initial[boundary] + initial[boundary + 1] - 20, initial[boundary] + delta));
        next[boundary + 1] += next[boundary] - adjusted; next[boundary] = adjusted;
        setThirdWidths(next);
      } else if (axis === 'x') setSplitX(Math.max(22, Math.min(78, Number(initial) + delta)));
      else setSplitY(Math.max(22, Math.min(78, Number(initial) + delta)));
    };
    const onEnd = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onEnd); window.removeEventListener('pointercancel', onEnd); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };
  const currentFolder = library?.folders.find(f => f.id === folderId);
  const counts = (n: number, kind: 'pages' | 'notebooks') => plural(n, language === 'ar' ? kind === 'pages' ? ['صفحة واحدة', 'صفحتان', '# صفحات', '# صفحة'] : ['دفتر واحد', 'دفتران', '# دفاتر', '# دفترًا'] : kind === 'pages' ? ['# page', '# pages'] : ['# notebook', '# notebooks']);
  const openDialog = (type: 'note' | 'folder', id?: string) => {
    const item = type === 'note' ? library?.notebooks.find(n => n.id === id) : library?.folders.find(f => f.id === id);
    setName(item?.title ?? ''); setColor(item?.color ?? COVER_COLORS[0]);
    setCover(type === 'note' && item && 'cover' in item ? item.cover : 'none'); setPaper('ruled');
    setNotebookKind(type === 'note' && item && 'kind' in item && item.kind === 'lecture' ? 'lecture' : type === 'note' && !id && activeDivider === 'courses' ? 'lecture' : 'note');
    const note = type === 'note' && item && 'pages' in item ? item : undefined;
    setTargetFolder(note ? note.folderId : view === 'folder' ? folderId : null);
    setTargetSection(note ? notebookSection(note, library?.folders ?? []) : activeDivider);
    setDocumentDraft({ ...DEFAULT_NOTE_DOCUMENT_SETTINGS, ...note?.documentSettings });
    setDirectionDraft(note?.scrollDirection ?? defaultDirection);
    setStarredDraft(note?.starred ?? false);
    setCourseId(type === 'folder' && item && 'courseId' in item ? item.courseId : null);
    setDialog({ type, id });
  };
  const submit = () => {
    if (!dialog) return;
    if (dialog.type === 'divider' || dialog.type === 'editDivider') {
      if (!dividerName.trim()) return;
      if (dialog.type === 'editDivider') {
        update(old => ({ ...old, dividers: old.dividers?.map(divider => divider.id === dialog.id ? { ...divider, title: dividerName.trim() } : divider) }));
        setDialog(null); setDividerName(''); return;
      }
      const next = { id: newId(), title: dividerName.trim(), createdAt: Date.now() };
      update(old => ({ ...old, dividers: [...(old.dividers ?? []), next] }));
      setActiveDivider(next.id); setExpandedDivider(next.id); setView('all'); setFolderId(null); setDialog(null); setDividerName('');
      return;
    }
    if (!name.trim()) return;
    if (dialog.type === 'note') {
      if (dialog.id) update(old => ({ ...old, notebooks: old.notebooks.map(n => n.id === dialog.id ? { ...n, title: name.trim(), color, cover, folderId: targetFolder, dividerId: targetFolder ? undefined : targetSection, kind: notebookKind, documentSettings: documentDraft, scrollDirection: directionDraft, starred: starredDraft, updatedAt: Date.now() } : n) }));
      else {
        const next = { ...newNotebook(name.trim(), targetFolder, color, paper, directionDraft), cover, kind: notebookKind, dividerId: targetFolder ? undefined : targetSection, documentSettings: documentDraft, starred: starredDraft };
        update(old => ({ ...old, notebooks: [...old.notebooks, next] }));
        openNotebook(next.id, true);
        const recent = readNotesPreferences(scope).recentTemplates;
        saveNotesPreferences(scope, { recentTemplates: [paper, ...recent.filter(item => item !== paper)].slice(0, 3) });
      }
    } else if (dialog.type === 'folder') {
      if (dialog.id) update(old => ({ ...old, folders: old.folders.map(f => f.id === dialog.id ? { ...f, title: name.trim(), color, courseId } : f) }));
      else {
        const next: NoteFolder = { id: newId(), title: name.trim(), color, courseId, parentId: view === 'folder' ? folderId : null, dividerId: view === 'folder' ? undefined : activeDivider };
        update(old => ({ ...old, folders: [...old.folders, next] }));
        setView('folder'); setFolderId(next.id);
      }
    }
    setDialog(null);
  };
  const trash = (id: string) => { update(old => ({ ...old, notebooks: old.notebooks.map(n => n.id === id ? { ...n, deletedAt: Date.now() } : n) })); closeTab(id); setDialog(null); };
  const duplicate = (id: string) => {
    const original = library?.notebooks.find(n => n.id === id); if (!original) return;
    const copy = { ...original, id: newId(), title: `${original.title} · ${t.duplicateSuffix}`, createdAt: Date.now(), updatedAt: Date.now(), pages: original.pages.map(p => ({ ...p, id: newId(), elements: p.elements.map(e => ({ ...e, id: newId() })) })) };
    update(old => ({ ...old, notebooks: [...old.notebooks, copy] })); setDialog(null);
  };
  const doImport = async (file: File | undefined, forceOpen = false) => {
    if (!file || busy) return; setBusy(true); setError('');
    try {
      const title = file.name.replace(/\.[^.]+$/, '');
      const next = newNotebook(title, view === 'folder' ? folderId : null, currentFolder?.color, 'ruled', defaultDirection);
      next.dividerId = view === 'folder' ? undefined : activeDivider;
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) next.pages = await importPdf(scope, file);
      else {
        const result = await importImage(scope, file); const page = newPage('plain');
        const ratio = Math.min((page.width - 60) / result.width, (page.height - 60) / result.height);
        const w = result.width * ratio, h = result.height * ratio;
        page.elements = [{ id: newId(), kind: 'image', assetId: result.assetId, x: (page.width - w) / 2, y: (page.height - h) / 2, w, h }]; next.pages = [page];
      }
      update(old => ({ ...old, notebooks: [...old.notebooks, next] }));
      if (forceOpen || readNotesPreferences(scope).autoOpenImport) openNotebook(next.id, forceOpen);
    } catch (e) { if (process.env.NODE_ENV === 'development') console.warn('Notes import failed:', e); setError(e instanceof Error ? e.message : 'importFailed'); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const exportCurrent = async (id: string) => {
    const note = library?.notebooks.find(n => n.id === id); if (!note) return;
    setBusy(true); setDialog(null);
    try { await exportPdf(scope, note, () => {}); } catch { setError('exportFailed'); } finally { setBusy(false); }
  };

  if (!library) return <div className={s.loading} dir={language === 'ar' ? 'rtl' : 'ltr'}><BookOpen size={38} /><p>{saveWarning ? t.saveError : t.loading}</p>{saveWarning && <button onClick={retry}>{t.retry}</button>}</div>;
  const folderInDivider = (folder: NoteFolder): boolean => folderSection(folder, library.folders) === activeDivider;
  const belongsToDivider = (note: Notebook): boolean => notebookSection(note, library.folders) === activeDivider;
  const items = library.notebooks.filter(n => {
    if ((view === 'trash') !== !!n.deletedAt) return false;
    if ((view === 'all' || view === 'recent' || view === 'favorites') && !belongsToDivider(n)) return false;
    if (view === 'all' && n.folderId !== null) return false;
    if (view === 'favorites' && !n.starred) return false;
    if (view === 'folder' && n.folderId !== folderId) return false;
    const q = search.trim().toLocaleLowerCase();
    return !q || n.title.toLocaleLowerCase().includes(q) || n.pages.some(p => p.elements.some(e => e.kind === 'text' && e.text.toLocaleLowerCase().includes(q)));
  }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, language) : b.updatedAt - a.updatedAt);
  const childFolders = view === 'all' || view === 'folder' ? library.folders.filter(f => f.parentId === (view === 'folder' ? folderId : null) && (view === 'folder' || folderInDivider(f))) : [];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const lecture = courses.find(c => c.sessions.some(session => {
    if (session.day !== now.getDay() || !session.time) return false;
    const [h, m] = session.time.split(':').map(Number); const start = h * 60 + m;
    return minutes >= start && minutes < start + session.minutes;
  }));
  const goView = (next: View, folder: string | null = null) => { setView(next); setFolderId(folder); setSearch(''); setRailOpen(false); };
  const goDivider = (id: DividerId) => { setActiveDivider(id); setExpandedDivider(current => current === id ? null : id); goView('all'); setFolderOptions(null); };
  const sections = [{ id: 'courses', title: t.subjects }, { id: 'personal', title: t.personal }, ...(library.dividers ?? [])];
  const showMove = (item: LibraryItemRef) => { setMoveDestination({ folderId: null, dividerId: activeDivider }); setMoveItem(item); setDialog(null); setFolderOptions(null); };
  const folderPath = (folder: NoteFolder) => {
    const names = [folder.title]; const seen = new Set([folder.id]); let parent = folder.parentId;
    while (parent && !seen.has(parent)) { seen.add(parent); const ancestor = library.folders.find(item => item.id === parent); if (!ancestor) break; names.unshift(ancestor.title); parent = ancestor.parentId; }
    return names.join(' / ');
  };
  const changeClock = () => { const next = clockFormat === '24' ? '12' : '24'; setClockFormat(next); saveNotesPreferences(scope, { clockFormat: next }); };
  const clock = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: clockFormat === '24' ? 'h23' : 'h12' }).format(now);
  const dayLabel = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const breadcrumbs: NoteFolder[] = [];
  let cursor = currentFolder; const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); breadcrumbs.unshift(cursor); cursor = library.folders.find(f => f.id === cursor!.parentId); }
  const splitPane = (index: number, gridColumn: string, gridRow: string) => {
    const id = paneIds[index], note = library.notebooks.find(item => item.id === id && !item.deletedAt);
    return <section key={index} className={`${s.splitPane} ${activePane === index ? s.splitPaneActive : ''} ${maximizedPane === index ? s.splitPaneMaximized : ''}`} style={{ gridColumn, gridRow }} onPointerDownCapture={() => { if (activePane !== index) { setActivePane(index); if (id) setOpenId(id); } }}>
      <div className={s.splitPaneHeading}><select aria-label={`${t.splitPane} ${index + 1}`} value={note?.id ?? ''} onChange={event => assignPane(index, event.target.value)}><option value="" disabled>{t.chooseTab}</option>{openTabs.map(tab => <option key={tab.id} value={tab.id}>{tab.title}</option>)}</select><span>{index + 1}</span></div>
      {note ? <NotebookEditor key={`${index}:${note.id}`} notebook={note} onChange={setNotebook} onBack={() => setOpenId(null)} openTabs={openTabs} onSwitchTab={id => assignPane(index, id)} onCloseTab={closeTab} onNewTab={() => setDialog({ type: 'newTab' })} splitCount={splitCount} onSplitChange={changeSplitCount} onFullscreenChange={fullscreen => setMaximizedPane(fullscreen ? index : null)} compact active={activePane === index} scope={scope} language={language} saveLabel={saveLabel} saveWarning={saveWarning} appearance={appearance} onAppearanceChange={changeAppearance} darkMode={darkMode} /> : <div className={s.splitEmpty}><BookOpen size={30} /><p>{t.chooseTab}</p><button onClick={() => setDialog({ type: 'newTab' })}><Plus size={18} />{t.newTab}</button></div>}
    </section>;
  };
  const splitHandle = (axis: 'x' | 'y', boundary: number, gridColumn: string, gridRow: string) => <div key={`${axis}-${boundary}`} className={`${s.splitHandle} ${axis === 'x' ? s.splitHandleX : s.splitHandleY}`} style={{ gridColumn, gridRow }} role="separator" aria-label={t.resizeSplit} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} tabIndex={0} onPointerDown={event => startSplitResize(axis, boundary, event)} onKeyDown={event => { const step = event.shiftKey ? 5 : 2; if (axis === 'x' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); const delta = (event.key === 'ArrowRight' ? 1 : -1) * step * (language === 'ar' ? -1 : 1); if (splitCount === 3) setThirdWidths(widths => { const next = [...widths] as [number, number, number]; const adjusted = Math.max(20, Math.min(widths[boundary] + widths[boundary + 1] - 20, widths[boundary] + delta)); next[boundary + 1] += next[boundary] - adjusted; next[boundary] = adjusted; return next; }); else setSplitX(value => Math.max(22, Math.min(78, value + delta))); } if (axis === 'y' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); setSplitY(value => Math.max(22, Math.min(78, value + (event.key === 'ArrowDown' ? step : -step)))); } }} />;
  const splitGrid = splitCount === 2
    ? <div ref={splitRoot} className={s.splitGrid} style={{ gridTemplateColumns: `${splitX}fr 12px ${100 - splitX}fr` }}>{splitPane(0, '1', '1')}{splitHandle('x', 0, '2', '1')}{splitPane(1, '3', '1')}</div>
    : splitCount === 3
      ? <div ref={splitRoot} className={s.splitGrid} style={{ gridTemplateColumns: `${thirdWidths[0]}fr 12px ${thirdWidths[1]}fr 12px ${thirdWidths[2]}fr` }}>{splitPane(0, '1', '1')}{splitHandle('x', 0, '2', '1')}{splitPane(1, '3', '1')}{splitHandle('x', 1, '4', '1')}{splitPane(2, '5', '1')}</div>
      : <div ref={splitRoot} className={s.splitGrid} style={{ gridTemplateColumns: `${splitX}fr 12px ${100 - splitX}fr`, gridTemplateRows: `${splitY}fr 12px ${100 - splitY}fr` }}>{splitPane(0, '1', '1')}{splitHandle('x', 0, '2', '1 / 4')}{splitPane(1, '3', '1')}{splitHandle('y', 0, '1 / 4', '2')}{splitPane(2, '1', '3')}{splitPane(3, '3', '3')}</div>;
  return <div className={s.workspace} dir={language === 'ar' ? 'rtl' : 'ltr'} data-notes-theme={darkMode ? 'dark' : 'light'} data-notes-appearance={appearance} data-haven-theme={activeTheme} data-glass={appearance === 'auto' && ['aurora', 'coral', 'ambassador'].includes(activeTheme)} data-havi-avoid>
    {saveWarning && <div className={s.saveWarning} role="alert"><span>{status === 'conflict' ? t.conflict : t.saveError}</span>{status !== 'conflict' && <button onClick={retry}>{t.retry}</button>}</div>}
    {notebook ? splitCount === 1 ? <NotebookEditor key={notebook.id} notebook={notebook} onChange={setNotebook} onBack={() => setOpenId(null)} openTabs={openTabs} onSwitchTab={setOpenId} onCloseTab={closeTab} onNewTab={() => setDialog({ type: 'newTab' })} splitCount={splitCount} onSplitChange={changeSplitCount} scope={scope} language={language} saveLabel={saveLabel} saveWarning={saveWarning} appearance={appearance} onAppearanceChange={changeAppearance} darkMode={darkMode} /> : <div className={s.splitWorkspace}><nav className={s.documentTabs} aria-label={t.openDocuments}><button className={s.splitBack} onClick={() => { setSplitCount(1); setOpenId(null); }} aria-label={t.backLibrary}><ArrowLeft size={17} /></button>{openTabs.map(tab => <div key={tab.id} className={`${s.documentTab} ${tab.id === openId ? s.activeDocumentTab : ''}`}><button onClick={() => assignPane(activePane, tab.id)}>{tab.title}</button><button aria-label={`${t.closeDocument}: ${tab.title}`} onClick={() => closeTab(tab.id)}><X size={14} /></button></div>)}<button className={s.newTabButton} aria-label={t.newTab} onClick={() => setDialog({ type: 'newTab' })}><Plus size={17} /></button><div className={s.splitChoices} role="group" aria-label={t.splitTabs}>{([1, 2, 3, 4] as const).map(count => <button key={count} aria-label={`${t.splitTabs} ${count}`} aria-pressed={splitCount === count} onClick={() => changeSplitCount(count)}>{count}</button>)}</div></nav>{splitGrid}</div> : <>
      <div className={s.libraryBody} onDragOver={drag.over} onDrop={drag.drop}>
        <nav className={s.dividerRail} aria-label={t.dividers}>
          <div className={s.dividerSpine}><BookOpen size={17} /></div>
          {[{ id: 'courses', label: t.subjects, Icon: GraduationCap }, { id: 'personal', label: t.personal, Icon: StickyNote }, ...(library.dividers ?? []).map(divider => ({ id: divider.id, label: divider.title, Icon: Folder }))].map(({ id, label, Icon }) => <div className={s.bookmarkSlot} key={id}><motion.button data-notes-drop-section={id} data-drop-active={drag.target?.valid && !drag.target.folderId && drag.target.dividerId === id} className={`${s.dividerTab} ${activeDivider === id ? s.dividerTabActive : ''} ${expandedDivider === id ? s.bookmarkExpanded : ''}`} onClick={() => goDivider(id)} title={label} aria-label={label} aria-expanded={expandedDivider === id} aria-current={activeDivider === id ? 'page' : undefined} initial={false} animate={{ width: expandedDivider === id || drag.dragging ? 166 : 48 }} whileHover={reducedMotion ? undefined : { width: 166 }} transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 350, damping: 30 }}><span className={s.bookmarkHole} /><Icon size={18} /><span aria-hidden className={s.bookmarkLabel}>{label}</span></motion.button></div>)}
          <button className={s.dividerAdd} aria-label={t.newDivider} title={t.newDivider} onClick={() => { setDividerName(''); setDialog({ type: 'divider' }); }}><Plus size={19} /></button>
        </nav>
        <div className={s.libraryContent}>
      <header className={s.libraryHeader}>
        <div className={s.brandLockup}><span className={s.brandEyebrow}>HAVEN / NOTES</span><strong>{activeDivider === 'courses' ? t.subjects : activeDivider === 'personal' ? t.personal : library.dividers?.find(divider => divider.id === activeDivider)?.title}</strong></div>
        {activeDivider !== 'courses' && activeDivider !== 'personal' && <button className={s.dividerSettings} aria-label={t.editDivider} onClick={() => { setDividerName(library.dividers?.find(divider => divider.id === activeDivider)?.title ?? ''); setDialog({ type: 'editDivider', id: activeDivider }); }}><Settings2 size={17} /></button>}
        <div className={s.headerActions}>{preview && <select className={s.previewThemeSelect} aria-label={t.previewTheme} value={activeTheme} onChange={event => { setPreviewTheme(event.target.value as ThemeId); changeAppearance('auto'); }}>{(['haven','midnight','rose','lavender','sand','forest','ocean','mono','aurora','coral','ambassador'] as ThemeId[]).map(id => <option key={id} value={id}>{id.charAt(0).toUpperCase() + id.slice(1)}</option>)}</select>}<button className={s.clockButton} onClick={changeClock} title={t.clockFormat} aria-label={t.clockFormat}><span>{dayLabel}</span><strong dir="ltr">{clock}</strong><small>{clockFormat === '24' ? '24H' : '12H'}</small></button><button className={s.libraryToggle} aria-expanded={railOpen} onClick={() => setRailOpen(value => !value)}><Folder size={17} /><span>{t.library}</span></button><button className={s.storageBadge} onClick={() => setDialog({ type: 'info' })} aria-label={saveLabel} title={saveLabel}><HardDrive size={16} /></button><IconButton className={s.mobileRailButton} icon={Folder} label={t.folders} onClick={() => setRailOpen(!railOpen)} /></div>
      </header>
      <div className={s.libraryInterior}>
        <aside className={`${s.libraryRail} ${railOpen ? s.railOpen : ''}`} aria-hidden={!railOpen} inert={!railOpen}>
          <div className={s.railBrand}><span className={s.railBrandDot} /><span>{t.library}</span><button className={s.railClose} onClick={() => setRailOpen(false)} aria-label={t.close}><PanelLeftClose size={17} /></button></div>
          <nav aria-label={t.library}>{([['all', LayoutGrid], ['recent', Clock3], ['favorites', Star], ['trash', Trash2]] as const).map(([key, Icon]) => <button key={key} className={view === key ? s.activeNav : ''} onClick={() => goView(key)}><Icon size={18} /><span>{t[key]}</span>{key === 'all' && <small>{library.notebooks.filter(n => !n.deletedAt).length}</small>}</button>)}</nav>
          <div className={s.folderHeading}><span>{t.folders}</span></div>
          <div className={s.folderLinks}>{library.folders.filter(f => !f.parentId && folderInDivider(f)).map(f => <button data-notes-drop-section={folderSection(f, library.folders)} data-notes-drop-folder={f.id} data-drop-active={drag.target?.valid && drag.target.folderId === f.id} key={f.id} className={view === 'folder' && folderId === f.id ? s.activeNav : ''} onClick={() => goView('folder', f.id)}><Folder size={18} style={{ color: folderColor(f) }} fill={`${folderColor(f)}20`} /><span>{f.title}</span></button>)}</div>
        </aside>
        <main className={s.libraryMain} data-notes-drop-section={activeDivider} data-notes-drop-folder={view === 'folder' ? folderId ?? undefined : undefined}>
          <div className={s.libraryTitleRow}><div><div className={s.breadcrumbs}><button data-notes-drop-section={activeDivider} onClick={() => goView('all')}>{activeDivider === 'courses' ? t.subjects : activeDivider === 'personal' ? t.personal : library.dividers?.find(divider => divider.id === activeDivider)?.title}</button>{view === 'folder' && breadcrumbs.map(f => <span key={f.id}><ChevronRight size={13} /><button data-notes-drop-section={folderSection(f, library.folders)} data-notes-drop-folder={f.id} onClick={() => goView('folder', f.id)}>{f.title}</button></span>)}</div><h1>{view === 'folder' ? currentFolder?.title : view === 'all' ? t.yourSpace : t[view]}</h1><p>{view === 'trash' ? t.trashHint : activeDivider === 'courses' && view === 'all' ? t.courseSpaceHint : counts(items.length, 'notebooks')}</p></div>
            <div className={s.createActions}>{view === 'folder' && <IconButton icon={Settings2} label={t.rename} onClick={() => openDialog('folder', folderId!)} />}
              <button className={s.primaryButton} onClick={() => setDialog({ type: 'add' })} disabled={busy}><Plus size={19} />{t.add}</button></div>
          </div>
          {lecture && view !== 'trash' && activeDivider === 'courses' && <div className={s.lectureSuggestion}><span className={s.lectureMark} style={{ background: lecture.color || COVER_COLORS[0] }} /><div><small>{t.lecture}</small><strong>{lecture.name}</strong></div><button onClick={() => { const folder = library.folders.find(f => f.courseId === lecture.id); if (folder) goView('folder', folder.id); else { openDialog('folder'); setName(lecture.name); setCourseId(lecture.id); setColor(lecture.color || COVER_COLORS[0]); } }}>{library.folders.some(f => f.courseId === lecture.id) ? t.openCourse : t.newCourse}<ChevronRight size={16} /></button></div>}
          <div className={s.searchRow}><label className={s.search}><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} />{search && <button aria-label={t.dismiss} onClick={() => setSearch('')}><X size={16} /></button>}</label><select value={sort} onChange={e => setSort(e.target.value)} aria-label={t.sort}><option value="updated">{t.updated}</option><option value="title">{t.alphabetical}</option></select></div>
          {(error || busy) && <div className={s.inlineNotice} role="status">{busy ? <><Loader2 size={18} className={s.spinner} />{t.importBusy}</> : <>{t[error as keyof typeof t] || t.importFailed}<IconButton icon={X} label={t.dismiss} onClick={() => setError('')} /></>}</div>}
          {(view === 'all' || view === 'folder') && !search && <section className={s.folderGrid} aria-label={t.folders}>{childFolders.map((f, index) => {
            const course = courses.find(item => item.id === f.courseId);
            const notebooks = library.notebooks.filter(note => !note.deletedAt && note.folderId === f.id);
            const dropActive = drag.target?.valid && drag.target.folderId === f.id;
            const FolderIcon = dropActive ? FolderOpen : Folder;
            return <motion.article key={f.id} data-notes-drop-section={folderSection(f, library.folders)} data-notes-drop-folder={f.id} data-drop-active={dropActive} draggable onDragStartCapture={event => drag.startNative(event, { kind: 'folder', id: f.id })} onDragEnd={drag.cancel} className={`${s.courseCard} ${drag.dragging?.id === f.id ? s.itemDragging : ''}`} style={{ '--folder-accent': folderColor(f) } as React.CSSProperties} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .32, delay: Math.min(index * .045, .25) }} whileHover={reducedMotion ? undefined : { y: -4 }}>
              <div className={s.courseCardTop}><span className={s.courseCardIcon}><FolderIcon size={21} strokeWidth={1.7} /></span><div className={s.cardActions}><button className={s.dragGrip} aria-label={`${t.dragItem}: ${f.title}`} title={t.dragItem} onPointerDown={event => drag.startPointer(event, { kind: 'folder', id: f.id })}><GripVertical size={17} /></button><button data-notes-folder-menu className={s.courseCardOptions} aria-label={`${t.folderOptions}: ${f.title}`} aria-expanded={folderOptions === f.id} onClick={() => setFolderOptions(folderOptions === f.id ? null : f.id)}><MoreHorizontal size={20} /></button></div></div>
              <button className={s.courseCardOpen} onClick={() => { setFolderOptions(null); goView('folder', f.id); }}><small>{course ? t.courseFolder : t.personalFolder}</small><strong>{f.title}</strong>{!course && <span>{t.openFolder}<ChevronRight size={15} /></span>}</button>
              {course && <CourseTimeCarousel sessions={course.sessions} now={now} language={language} clockFormat={clockFormat} />}
              <div className={s.courseCardStats}><div><span>{course?.sessions.length ?? 0}</span><small>{t.weeklyLectures}</small></div><div><span>{notebooks.filter(note => note.kind === 'lecture').length}</span><small>{t.lectureNotebooks}</small></div><div><span>{notebooks.filter(note => note.kind !== 'lecture').length}</span><small>{t.noteNotebooks}</small></div></div>
              <AnimatePresence>{folderOptions === f.id && <motion.div data-notes-folder-menu className={s.courseCardMenu} initial={reducedMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}><button onClick={() => { setFolderOptions(null); openDialog('folder', f.id); }}><Settings2 size={15} />{t.folderOptions}</button><button onClick={() => showMove({ kind: 'folder', id: f.id })}><Move size={15} />{t.moveItem}</button>{course && <button onClick={() => { update(old => ({ ...old, folders: old.folders.map(folder => folder.id === f.id ? { ...folder, promptAtClass: !folder.promptAtClass } : folder) })); setFolderOptions(null); }}>{f.promptAtClass ? <BellOff size={15} /> : <Bell size={15} />}{f.promptAtClass ? t.disableClassPrompt : t.enableClassPrompt}</button>}</motion.div>}</AnimatePresence>
            </motion.article>;
          })}</section>}
          {items.length ? <section className={s.notebookGrid} aria-label={t.all}>{items.map(n => <article key={n.id} draggable={!n.deletedAt} onDragStart={event => drag.startNative(event, { kind: 'notebook', id: n.id })} onDragEnd={drag.cancel} className={`${s.notebookCard} ${drag.dragging?.id === n.id ? s.itemDragging : ''}`}>
            <button className={`${s.cover} ${n.cover === 'none' ? s.coverPreview : s[n.cover]}`} style={{ '--cover': n.color } as React.CSSProperties} onClick={() => { if (n.deletedAt) update(old => ({ ...old, notebooks: old.notebooks.map(note => note.id === n.id ? { ...note, deletedAt: null } : note) })); else openNotebook(n.id); }} aria-label={n.deletedAt ? `${t.restore}: ${n.title}` : n.title}>
              {n.cover === 'none' ? <PageThumbnail scope={scope} page={n.pages[0]} previewWidth={260} /> : <><div className={s.coverBinding} /><div className={s.coverLabel}><span>Haven Notes</span><strong>{n.title}</strong><i /></div><span className={s.coverFoot}>{n.pages[0]?.background ? 'PDF' : t.notes}</span></>}
            </button>
            <div className={s.notebookMeta}><div><button onClick={() => !n.deletedAt && openNotebook(n.id)}><strong>{n.title}</strong></button><span>{counts(n.pages.length, 'pages')}<i />{new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(n.updatedAt)}</span></div>{n.deletedAt ? <IconButton icon={RefreshCw} label={t.restore} onClick={() => update(old => ({ ...old, notebooks: old.notebooks.map(note => note.id === n.id ? { ...note, deletedAt: null } : note) }))} /> : <div className={s.cardActions}><button className={s.dragGrip} aria-label={`${t.dragItem}: ${n.title}`} title={t.dragItem} onPointerDown={event => drag.startPointer(event, { kind: 'notebook', id: n.id })}><GripVertical size={17} /></button><IconButton icon={MoreHorizontal} label={`${t.rename}: ${n.title}`} onClick={() => openDialog('note', n.id)} /></div>}</div>
            {!n.deletedAt && <button className={`${s.favoriteButton} ${n.starred ? s.isFavorite : ''}`} aria-label={n.starred ? t.removeFavorite : t.addFavorite} aria-pressed={n.starred} onClick={() => setNotebook({ ...n, starred: !n.starred })}><Star size={17} fill={n.starred ? 'currentColor' : 'none'} /></button>}
          </article>)}</section> : (childFolders.length && view === 'all' && !search) ? null : <div className={s.emptyState}><div className={s.emptyPaper}><PenLine /></div><h2>{search ? t.noResults : view === 'folder' ? t.folderEmpty : view === 'trash' ? t.trash : t.empty}</h2>{!search && view !== 'trash' && <p>{t.emptySub}</p>}</div>}
        </main>
      </div>
      </div>
      </div>
      <input hidden ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={e => void doImport(e.target.files?.[0])} />
      <input hidden ref={libraryImageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
    </>}
    <input hidden type="file" accept="application/pdf,.pdf" onChange={e => { void doImport(e.target.files?.[0], true); e.target.value = ''; }} ref={newTabPdfInput} />
    <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void doImport(e.target.files?.[0], true); e.target.value = ''; }} ref={newTabImageInput} />
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog?.type === 'add'} onClose={() => setDialog(null)} title={t.add}><div className={s.form}><button className={s.optionButton} onClick={() => openDialog('note')}><BookOpen size={20} />{t.newNote}</button><button className={s.optionButton} onClick={() => { setDialog(null); openDialog('folder'); }}><Folder size={20} />{t.newFolder}</button><button className={s.optionButton} onClick={() => { setDialog(null); fileInput.current?.click(); }}><FileText size={20} />{t.importPdf}</button><button className={s.optionButton} onClick={() => { setDialog(null); libraryImageInput.current?.click(); }}><Upload size={20} />{t.importImageNotebook}</button></div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog?.type === 'newTab'} onClose={() => setDialog(null)} title={t.newTab}><div className={s.form}><button className={s.optionButton} onClick={() => openDialog('note')}><BookOpen size={20} />{t.newNote}</button><button className={s.optionButton} onClick={() => { setDialog(null); newTabPdfInput.current?.click(); }}><FileText size={20} />{t.importPdf}</button><button className={s.optionButton} onClick={() => { setDialog(null); newTabImageInput.current?.click(); }}><Upload size={20} />{t.importImageTab}</button></div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog?.type === 'divider' || dialog?.type === 'editDivider'} onClose={() => setDialog(null)} title={dialog?.type === 'editDivider' ? t.editDivider : t.newDivider}><form className={s.form} onSubmit={event => { event.preventDefault(); submit(); }}><p className={s.formHint}>{t.dividerHint}</p><label>{t.title}<input autoFocus maxLength={40} value={dividerName} onChange={event => setDividerName(event.target.value)} placeholder={t.dividerName} required /></label><button className={s.primaryButton} type="submit" disabled={!dividerName.trim()}>{dialog?.type === 'editDivider' ? t.save : t.create}</button>{dialog?.type === 'editDivider' && <button className={s.danger} type="button" onClick={() => setDialog({ type: 'removeDivider', id: dialog.id })}>{t.removeDivider}</button>}</form></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog?.type === 'removeDivider'} onClose={() => setDialog(null)} title={t.removeDivider}><p>{t.removeDividerHint}</p><div className={s.dialogActions}><button onClick={() => setDialog(null)}>{t.cancel}</button><button className={s.dangerButton} onClick={() => { const id = dialog?.id; if (id) update(old => ({ ...old, dividers: old.dividers?.filter(divider => divider.id !== id), folders: old.folders.map(folder => folder.dividerId === id ? { ...folder, dividerId: 'personal' } : folder), notebooks: old.notebooks.map(note => note.dividerId === id ? { ...note, dividerId: 'personal' } : note) })); setActiveDivider('personal'); setExpandedDivider(null); goView('all'); setDialog(null); }}>{t.confirm}</button></div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={!!classPrompt} onClose={() => setClassPrompt(null)} title={t.classPromptTitle}><div className={s.form}><p>{t.classPromptText.replace('{course}', classPrompt?.courseName ?? '')}</p><div className={s.dialogActions}><button onClick={() => setClassPrompt(null)}>{t.classPromptLater}</button><button className={s.primaryButton} onClick={() => { if (classPrompt) { setActiveDivider('courses'); goView('folder', classPrompt.folderId); } setClassPrompt(null); }}>{t.openCourse}</button></div></div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog?.type === 'note' || dialog?.type === 'folder'} onClose={() => setDialog(null)} title={dialog?.id ? t.rename : dialog?.type === 'note' ? t.newNote : t.newFolder}>
      <form className={s.form} onSubmit={e => { e.preventDefault(); submit(); }}><p className={s.formHint}>{dialog?.type === 'note' ? t.newDocumentHint : t.newFolderHint}</p>
        <label>{t.title}<input autoFocus maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder={dialog?.type === 'note' ? t.untitled : t.folderName} required /></label>
        <label>{t.color}</label><div className={s.colorChoices}>{COVER_COLORS.map(c => <button key={c} type="button" className={`${s.swatch} ${c === color ? s.selectedSwatch : ''}`} style={{ '--swatch': c } as React.CSSProperties} aria-label={`${t.color} ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />)}<input type="color" aria-label={t.color} value={color} onChange={e => setColor(e.target.value)} /></div>
        {dialog?.type === 'note' ? <>
          <SettingChoices label={t.notebookType} kind="type" value={notebookKind} options={[{ value: 'lecture', label: t.lectureNotebook }, { value: 'note', label: t.noteNotebook }]} onChange={setNotebookKind} />
          <SettingChoices label={t.cover} kind="cover" value={cover} options={(['linen', 'minimal', 'arch', 'none'] as const).map(value => ({ value, label: t[value] }))} onChange={setCover} color={color}/>
          {cover === 'none' && <><p className={s.formHint}>{t.coverPreviewHint}</p>{dialog.id && <div className={s.coverSample}><PageThumbnail scope={scope} page={library.notebooks.find(item => item.id === dialog.id)!.pages[0]} previewWidth={220} /></div>}</>}
          {!dialog.id && <><SettingChoices label={t.paper} kind="paper" value={paper} options={PAPER_STYLES.map(value => ({ value, label: t[value] }))} onChange={setPaper} /></>}
          <label>{t.section}<select value={targetSection} onChange={event => { setTargetSection(event.target.value); setTargetFolder(null); }}><option value="courses">{t.subjects}</option><option value="personal">{t.personal}</option>{library.dividers?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label>{t.moveTo}<select value={targetFolder ?? ''} onChange={e => setTargetFolder(e.target.value || null)}><option value="">{t.noFolder}</option>{library.folders.filter(item => folderSection(item, library.folders) === targetSection).map(f => <option key={f.id} value={f.id}>{f.title}</option>)}</select></label>
          <details className={s.notebookPreferences}><summary>{t.notebookSettings}</summary><div className={s.form}>
            <SettingChoices label={t.pageDirection} kind="direction" value={directionDraft} options={[{ value: 'vertical', label: t.vertical }, { value: 'horizontal', label: t.horizontal }]} onChange={setDirectionDraft} />
            <SettingChoices label={t.toolbarPosition} kind="dock" value={documentDraft.toolbarPosition} options={[{ value: 'top', label: t.top }, { value: 'bottom', label: t.bottom }, { value: 'left', label: t.left }, { value: 'right', label: t.right }]} onChange={value => setDocumentDraft(current => ({ ...current, toolbarPosition: value }))} />
            <label className={s.toggle}><span><SettingDiagram kind="pageNumber" />{t.showPageNumbers}</span><input type="checkbox" checked={documentDraft.showPageNumbers} onChange={event => setDocumentDraft(current => ({ ...current, showPageNumbers: event.target.checked }))} /></label>
            <label className={s.toggle}><span><SettingDiagram kind="status" />{t.showStatusBar}</span><input type="checkbox" checked={documentDraft.showStatusBar !== false} onChange={event => setDocumentDraft(current => ({ ...current, showStatusBar: event.target.checked }))} /></label>
            <label className={s.toggle}><span><SettingDiagram kind="lock" />{t.lockDocument}</span><input type="checkbox" checked={documentDraft.locked} onChange={event => setDocumentDraft(current => ({ ...current, locked: event.target.checked }))} /></label>
            <label className={s.toggle}><span><SettingDiagram kind="favorite" />{t.favorites}</span><input type="checkbox" checked={starredDraft} onChange={event => setStarredDraft(event.target.checked)} /></label>
          </div></details>
        </> : <label>{t.course}<select value={courseId ?? ''} onChange={e => setCourseId(e.target.value || null)}><option value="">{t.noCourse}</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <button className={s.primaryButton} type="submit" disabled={!name.trim()}>{dialog?.id ? t.save : t.create}</button>
        {dialog?.id && dialog.type === 'note' && <div className={s.manageActions}><button type="button" onClick={() => showMove({ kind: 'notebook', id: dialog.id! })}><Move size={16} />{t.moveItem}</button><button type="button" onClick={() => duplicate(dialog.id!)}><FileText size={16} />{t.duplicate}</button><button type="button" onClick={() => void exportCurrent(dialog.id!)}><Download size={16} />{t.export}</button><button type="button" className={s.danger} onClick={() => trash(dialog.id!)}><Trash2 size={16} />{t.moveTrash}</button></div>}
        {dialog?.id && dialog.type === 'folder' && <div className={s.manageActions}><button type="button" onClick={() => showMove({ kind: 'folder', id: dialog.id! })}><Move size={16} />{t.moveItem}</button><button type="button" className={s.danger} onClick={() => setDialog({ type: 'removeFolder', id: dialog.id })}>{t.deleteFolder}</button></div>}
      </form>
    </Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={!!moveItem} onClose={() => setMoveItem(null)} title={t.moveItem}>
      <div className={s.form}><p className={s.formHint}>{t.moveHint}</p><label>{t.section}<select value={moveDestination.dividerId} onChange={event => setMoveDestination({ dividerId: event.target.value, folderId: null })}>{sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
        <div className={s.destinationList} role="group" aria-label={t.destination}>
          <button type="button" aria-pressed={!moveDestination.folderId} onClick={() => setMoveDestination(current => ({ ...current, folderId: null }))}><BookOpen size={18} /><span>{sections.find(section => section.id === moveDestination.dividerId)?.title}</span></button>
          {library.folders.filter(folder => folderSection(folder, library.folders) === moveDestination.dividerId).sort((a, b) => folderPath(a).localeCompare(folderPath(b), language)).map(folder => <button type="button" key={folder.id} aria-pressed={moveDestination.folderId === folder.id} disabled={!!moveItem && !canMoveLibraryItem(library, moveItem, { dividerId: moveDestination.dividerId, folderId: folder.id })} onClick={() => setMoveDestination(current => ({ ...current, folderId: folder.id }))}><Folder size={18} /><span>{folderPath(folder)}</span></button>)}
        </div><button className={s.primaryButton} disabled={!moveItem || !canMoveLibraryItem(library, moveItem, moveDestination)} onClick={() => { if (moveItem) performMove(moveItem, moveDestination); }}>{t.moveHere}</button>
      </div>
    </Modal>
    <span className={s.screenReaderStatus} role="status">{moveAnnouncement}</span>
    {drag.point && drag.dragging && createPortal(<div className={s.libraryDragGhost} style={{ left: drag.point.x + 18, top: drag.point.y + 14 }}><FolderOpen size={20} /><span>{drag.target?.valid ? t.dragToFolder : t.moveItem}</span></div>, document.body)}
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog?.type === 'removeFolder'} onClose={() => setDialog(null)} title={t.deleteFolder}><p>{t.folderDeleteHint}</p><div className={s.dialogActions}><button onClick={() => setDialog(null)}>{t.cancel}</button><button className={s.dangerButton} onClick={() => { const folder = library.folders.find(f => f.id === dialog?.id); if (folder) { update(old => ({ ...old, folders: old.folders.filter(f => f.id !== folder.id).map(f => f.parentId === folder.id ? { ...f, parentId: folder.parentId, dividerId: folder.parentId ? undefined : folderSection(folder, old.folders) } : f), notebooks: old.notebooks.map(n => n.folderId === folder.id ? { ...n, folderId: folder.parentId, dividerId: folder.parentId ? undefined : folderSection(folder, old.folders) } : n) })); goView('all'); } setDialog(null); }}>{t.confirm}</button></div></Modal>
    <Modal tone={darkMode ? 'notes' : undefined} open={dialog?.type === 'info'} onClose={() => setDialog(null)} title={t.deviceStorage}><div className={s.form}><HardDrive size={28} /><p>{t.localHint}</p><p className={s.formHint}>{preview ? t.localVersion : 'Haven Notes'}</p></div></Modal>
  </div>;
}
function PenLine() { return <><span /><span /><span /><BookOpen size={27} strokeWidth={1.2} /></>; }
