'use client';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { notesCopy } from '@/lib/notes/copy';
import s from './notes.module.css';

type Crop = { left: number; top: number; right: number; bottom: number };
type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
type ScanMode = 'color' | 'gray' | 'document';
const corners: Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const initialCrop: Crop = { left: .03, top: .03, right: .97, bottom: .97 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function changeCorner(crop: Crop, corner: Corner, x: number, y: number): Crop {
  return {
    left: corner.endsWith('Left') ? clamp(x, 0, crop.right - .12) : crop.left,
    right: corner.endsWith('Right') ? clamp(x, crop.left + .12, 1) : crop.right,
    top: corner.startsWith('top') ? clamp(y, 0, crop.bottom - .12) : crop.top,
    bottom: corner.startsWith('bottom') ? clamp(y, crop.top + .12, 1) : crop.bottom,
  };
}

async function scannedFile(image: HTMLImageElement, crop: Crop, mode: ScanMode): Promise<File> {
  const sx = Math.round(crop.left * image.naturalWidth), sy = Math.round(crop.top * image.naturalHeight);
  const sw = Math.max(1, Math.round((crop.right - crop.left) * image.naturalWidth));
  const sh = Math.max(1, Math.round((crop.bottom - crop.top) * image.naturalHeight));
  const scale = Math.min(1, 3000 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext('2d', { willReadFrequently: mode !== 'color' });
  if (!context) throw new Error('scanFailed');
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  if (mode !== 'color') {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const gray = pixels.data[offset] * .2126 + pixels.data[offset + 1] * .7152 + pixels.data[offset + 2] * .0722;
      const value = mode === 'document' ? clamp((gray - 128) * 1.65 + 154, 0, 255) : gray;
      pixels.data[offset] = value; pixels.data[offset + 1] = value; pixels.data[offset + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('scanFailed')), 'image/png'));
  return new File([blob], 'document-scan.png', { type: 'image/png' });
}

export function DocumentScanner({ file, language, onClose, onSave }: { file: File; language: 'ar' | 'en'; onClose: () => void; onSave: (file: File) => Promise<void> }) {
  const t = notesCopy(language);
  const stage = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState('');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [mode, setMode] = useState<ScanMode>('document');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (file.size > 60 * 1024 * 1024) { setError('fileTooLarge'); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('invalidImage'); return; }
    const objectUrl = URL.createObjectURL(file), loaded = new Image();
    let active = true;
    loaded.src = objectUrl;
    void loaded.decode().then(() => {
      if (!active) return;
      if (loaded.naturalWidth * loaded.naturalHeight > 48000000) setError('fileTooLarge');
      else { setImage(loaded); setUrl(objectUrl); }
    }).catch(() => { if (active) setError('invalidImage'); });
    return () => { active = false; URL.revokeObjectURL(objectUrl); };
  }, [file]);
  const move = (corner: Corner, clientX: number, clientY: number) => {
    const rect = stage.current?.getBoundingClientRect(); if (!rect) return;
    setCrop(current => changeCorner(current, corner, (clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height));
  };
  const save = async () => {
    if (!image || saving) return;
    setSaving(true); setError('');
    try { await onSave(await scannedFile(image, crop, mode)); onClose(); }
    catch (cause) { setError(cause instanceof Error && cause.message in t ? cause.message : 'scanFailed'); }
    finally { setSaving(false); }
  };
  return <Modal open onClose={onClose} title={t.scanDocument}><div className={s.form}>
    {url && <div className={s.scanStage} ref={stage}><img src={url} alt="" className={mode === 'color' ? '' : mode === 'gray' ? s.scanGray : s.scanDocumentTone} /><div className={s.scanCrop} style={{ left: `${crop.left * 100}%`, top: `${crop.top * 100}%`, right: `${(1 - crop.right) * 100}%`, bottom: `${(1 - crop.bottom) * 100}%` }}>{corners.map(corner => <button key={corner} type="button" className={`${s.scanHandle} ${s[corner]}`} aria-label={`${t.scanCrop} ${t[corner]}`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (event.buttons) move(corner, event.clientX, event.clientY); }} onKeyDown={event => { const step = event.shiftKey ? .05 : .01; const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0; const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0; if (dx || dy) { event.preventDefault(); setCrop(current => changeCorner(current, corner, (corner.endsWith('Left') ? current.left : current.right) + dx, (corner.startsWith('top') ? current.top : current.bottom) + dy)); } }} />)}</div></div>}
    <p className={s.formHint}>{t.scanHint}</p>
    <label>{t.scanMode}<select value={mode} onChange={event => setMode(event.target.value as ScanMode)}><option value="document">{t.scanEnhanced}</option><option value="gray">{t.scanGrayscale}</option><option value="color">{t.scanColor}</option></select></label>
    {error && <p className={s.inlineNotice} role="alert">{t[error as keyof typeof t] || t.scanFailed}</p>}
    <div className={s.dialogActions}><button type="button" onClick={onClose}>{t.cancel}</button><button type="button" className={s.primaryButton} disabled={!image || saving} onClick={() => void save()}>{saving ? t.importBusy : t.scanPage}</button></div>
  </div></Modal>;
}
