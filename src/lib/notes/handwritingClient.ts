type Crop = { pixels: ArrayBuffer; width: number; height: number };
export type RecognitionStatus = 'idle' | 'loading' | 'recognizing' | 'error';
let worker: Worker | undefined;
let queue: Promise<unknown> = Promise.resolve();
let sequence = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let preparation: Promise<void> | undefined;

/** One shared worker prevents split panes from loading multiple model copies. */
function requestHandwriting(action: 'prepare' | 'recognize', lines: Crop[], status: (status: RecognitionStatus) => void, current: () => boolean): Promise<string[]> {
  const task = queue.catch(() => {}).then(() => new Promise<string[]>((resolve, reject) => {
    if (!current()) { reject(new Error('cancelled')); return; }
    clearTimeout(idleTimer);
    try { worker ??= new Worker('/notes-handwriting/recognizer.worker.mjs', { type: 'module' }); }
    catch { reject(new Error('recognitionFailed')); return; }
    const active = worker, id = ++sequence;
    const cleanup = () => {
      clearTimeout(timeout); active.removeEventListener('message', message); active.removeEventListener('error', fail);
      idleTimer = setTimeout(() => { worker?.terminate(); worker = undefined; preparation = undefined; }, 300000);
    };
    const fail = () => { cleanup(); active.terminate(); if (worker === active) { worker = undefined; preparation = undefined; } reject(new Error('recognitionFailed')); };
    const message = (event: MessageEvent) => {
      if (event.data?.id !== id) return;
      if (event.data.status === 'loading' || event.data.status === 'recognizing') { if (current()) status(event.data.status); return; }
      cleanup();
      if (event.data.status === 'done' && Array.isArray(event.data.texts) && event.data.texts.every((text: unknown) => typeof text === 'string')) resolve(event.data.texts);
      else reject(new Error('recognitionFailed'));
    };
    const timeout = setTimeout(fail, 120000);
    active.addEventListener('message', message); active.addEventListener('error', fail);
    try { active.postMessage({ id, action, lines }, lines.map(line => line.pixels)); }
    catch { fail(); }
  }));
  queue = task.catch(() => {});
  return task;
}
/** Start model preparation when the user enables the mode, not after the pause. */
export function prepareHandwriting(): Promise<void> {
  if (!preparation) {
    preparation = requestHandwriting('prepare', [], () => {}, () => true).then(() => {});
    void preparation.catch(() => { preparation = undefined; });
  }
  return preparation;
}
export function recognizeHandwriting(lines: Crop[], status: (status: RecognitionStatus) => void, current: () => boolean): Promise<string[]> {
  return requestHandwriting('recognize', lines, status, current);
}
