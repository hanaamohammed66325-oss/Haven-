'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, ChevronDown, FileUp, Settings2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { importNoteFont, loadNoteFont, noteFontFamily, WRITING_FONTS, type ImportedNoteFont, type NoteFontFamily } from '@/lib/notes/fonts';
import { readNotesPreferences, saveNotesPreferences } from '@/lib/notes/notesPreferences';
import { notesCopy } from '@/lib/notes/copy';
import s from './notes.module.css';

export function WritingFontPicker({ scope, language, value, onChange }: { scope: string; language: 'ar' | 'en'; value: NoteFontFamily; onChange: (font: NoteFontFamily) => void }) {
  const t = notesCopy(language), reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [imported, setImported] = useState<ImportedNoteFont[]>([]), [order, setOrder] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null), generation = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  useEffect(() => { if (!open) { generation.current++; setBusy(false); } }, [open]);
  useEffect(() => {
    if (open && position) panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed=true]')?.focus();
  }, [open, position]);
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const update = () => {
      const anchor = trigger.current!;
      const rect = anchor.getBoundingClientRect(), width = Math.min(360, window.innerWidth - 24);
      const height = Math.min(510, window.innerHeight - 24), below = window.innerHeight - rect.bottom;
      const top = below > Math.min(height, 350) ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
      const style = getComputedStyle(anchor);
      const variables = Object.fromEntries(['--n-ink', '--n-panel', '--n-muted', '--n-line', '--n-accent', '--n-soft'].map(name => [name, style.getPropertyValue(name)]));
      setPosition({ ...variables, width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top, maxHeight: window.innerHeight - top - 12 } as React.CSSProperties);
    };
    const dismiss = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    update(); window.addEventListener('resize', update); document.addEventListener('pointerdown', dismiss, true); document.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('resize', update); document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  useEffect(() => {
    const prefs = readNotesPreferences(scope); setImported(prefs.importedFonts ?? []); setOrder(prefs.fontOrder ?? []);
    return () => { generation.current++; };
  }, [scope]);
  const choices: { id: NoteFontFamily; title: string }[] = [...WRITING_FONTS, ...imported,
    { id: 'sans', title: t.fontSans }, { id: 'serif', title: t.fontSerif }, { id: 'mono', title: t.fontMono }];
  const ranks = new Map(choices.map((font, index) => [font.id, order.includes(font.id) ? order.indexOf(font.id) : order.length + index]));
  choices.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);
  useEffect(() => { if (open) for (const font of choices) void loadNoteFont(scope, font.id).catch(() => {}); }, [open, scope, imported]); // FontFace updates previews when ready.
  const choose = async (font: NoteFontFamily) => {
    const ticket = ++generation.current; setBusy(true); setError('');
    try { await loadNoteFont(scope, font); if (ticket === generation.current) { onChange(font); setOpen(false); } }
    catch { if (ticket === generation.current) setError(t.invalidFont); }
    finally { if (ticket === generation.current) setBusy(false); }
  };
  const move = (index: number, direction: -1 | 1) => {
    const next = choices.map(font => font.id), other = index + direction;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other], next[index]]; setOrder(next); saveNotesPreferences(scope, { fontOrder: next });
  };
  return <div className={s.fontChooser}>
    <button ref={trigger} type="button" className={s.fontChooserTrigger} aria-expanded={open} onClick={() => setOpen(!open)}><span>{t.writingFont}</span><strong style={{ fontFamily: noteFontFamily(value) }}>{choices.find(font => font.id === value)?.title ?? t.fontFamily}</strong><ChevronDown size={16} /></button>
    {open && position && createPortal(<motion.div ref={panel} data-note-font-picker data-note-text-format dir={language === 'ar' ? 'rtl' : 'ltr'} style={position} className={s.fontChooserPanel} initial={reducedMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}>
      <div className={s.fontChooserHeader}><button type="button" disabled={busy || imported.length >= 32} onClick={() => input.current?.click()}><FileUp size={18} /><span>{t.importFonts}<small>TTF · OTF</small></span></button><button type="button" title={t.reorderFonts} aria-label={t.reorderFonts} aria-pressed={editing} onClick={() => setEditing(!editing)}><Settings2 size={18} /></button></div>
      <input ref={input} type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        const ticket = ++generation.current; setBusy(true); setError('');
        try {
          const font = await importNoteFont(scope, file); if (ticket !== generation.current) return;
          const next = [...imported, font];
          if (!saveNotesPreferences(scope, { importedFonts: next })) throw new Error('preferences');
          setImported(next); onChange(font.id); setOpen(false);
        } catch { if (ticket === generation.current) setError(t.invalidFont); }
        finally { if (ticket === generation.current) setBusy(false); }
      }} />
      <div className={s.fontChooserList} role="group" aria-label={t.writingFont}>{choices.map((font, index) => <div key={font.id} className={s.fontChooserRow}>
        <button type="button" aria-pressed={value === font.id} disabled={busy} onClick={() => void choose(font.id)}><span dir="auto" style={{ fontFamily: noteFontFamily(font.id) }}>{font.title}</span>{value === font.id && <Check size={19} />}</button>
        {editing && <span className={s.fontReorder}><button type="button" disabled={index === 0} title={t.earlier} aria-label={`${t.earlier}: ${font.title}`} onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button type="button" disabled={index === choices.length - 1} title={t.later} aria-label={`${t.later}: ${font.title}`} onClick={() => move(index, 1)}><ArrowDown size={15} /></button></span>}
      </div>)}</div>
      {busy && <small role="status">{t.loadingFont}</small>}{error && <small role="alert">{error}</small>}
    </motion.div>, document.body)}
  </div>;
}
