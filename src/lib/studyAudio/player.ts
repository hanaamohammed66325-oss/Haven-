import { audioFileProblem, DEFAULT_AUDIO_PREFS, parseAudioPreferences, STUDY_TRACKS, type AudioPreferences } from "./catalog";
import { deletePersonalTrack, listPersonalTracks, readPersonalFile, savePersonalTrack, type PersonalTrack } from "./storage";

export type AudioProblem = "size" | "format" | "play" | "storage" | "temporary" | "missing";
export interface AudioState extends AudioPreferences {
  files: PersonalTrack[];
  playing: boolean;
  busy: boolean;
  importing: boolean;
  problem: AudioProblem | null;
}
const PREF_KEY = "haven-study-audio-prefs";

/** One media element per study page. No fetching, decoding or autoplay on mount. */
export class StudyAudioPlayer {
  private state: AudioState = { ...DEFAULT_AUDIO_PREFS, files: [], playing: false, busy: false, importing: false, problem: null };
  private listeners = new Set<() => void>();
  private media: HTMLAudioElement | null = null;
  private mediaId: string | null = null;
  private objectUrl: string | null = null;
  private temporary = new Map<string, Blob>();
  private revision = 0;
  private lifecycle = 0;
  private context: AudioContext | null = null;
  private duckUntil = 0;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private update(patch: Partial<AudioState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  async load() {
    const generation = ++this.lifecycle;
    try { this.update(parseAudioPreferences(JSON.parse(localStorage.getItem(PREF_KEY) ?? "null"))); }
    catch { /* Storage can be disabled without disabling playback. */ }
    try {
      const files = await listPersonalTracks();
      if (generation !== this.lifecycle) return;
      const exists = STUDY_TRACKS.some((t) => t.id === this.state.selected) || files.some((t) => t.id === this.state.selected);
      this.update({ files, selected: exists ? this.state.selected : null });
    } catch { if (generation === this.lifecycle) this.update({ problem: "storage" }); }
  }
  preferences(patch: Partial<AudioPreferences>) {
    this.update(parseAudioPreferences({ ...this.state, ...patch }));
    if (this.media) { this.media.loop = this.state.loop; this.applyVolume(); }
    const { selected, volume, loop, alerts } = this.state;
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ selected, volume, loop, alerts })); }
    catch { /* Playback remains usable with volatile preferences. */ }
  }
  private applyVolume() {
    if (this.media) this.media.volume = this.state.volume * (Date.now() < this.duckUntil ? .25 : 1);
  }
  /** Called only inside a real pointer/keyboard gesture, before any awaits. */
  arm = () => {
    try {
      if (!this.context || this.context.state === "closed") {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) this.context = new AC();
      }
      if (this.context?.state === "suspended") void this.context.resume().catch(() => {});
    } catch { /* The browser may not offer Web Audio. */ }
  };
  async notify(kind: "study" | "break", preview = false): Promise<boolean> {
    if ((!this.state.alerts && !preview) || !this.context) return false;
    const ctx = this.context;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { return false; }
    }
    if (ctx !== this.context || ctx.state !== "running") return false;
    const notes = kind === "study" ? [660, 880] : [880, 660];
    for (const [i, frequency] of notes.entries()) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      oscillator.connect(gain); gain.connect(ctx.destination);
      const start = ctx.currentTime + i * .2;
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.2, start + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .45);
      oscillator.start(start); oscillator.stop(start + .47);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    this.duckUntil = Date.now() + 1000;
    this.applyVolume();
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => this.applyVolume(), 1050);
    return true;
  }
  private releaseMedia() {
    if (this.media) {
      this.media.onplaying = this.media.onpause = this.media.onended = this.media.onerror = null;
      this.media.pause(); this.media.removeAttribute("src"); this.media.load();
      this.media = null;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null; this.mediaId = null;
  }
  async play(id = this.state.selected) {
    if (!id) return;
    this.arm();
    const rev = ++this.revision;
    this.preferences({ selected: id });
    this.update({ busy: true, problem: null });
    try {
      if (this.mediaId !== id || !this.media) {
        this.releaseMedia();
        this.update({ playing: false });
        const ready = STUDY_TRACKS.find((t) => t.id === id);
        let url = ready?.url;
        if (!url) {
          const file = this.temporary.get(id) ?? await readPersonalFile(id);
          if (rev !== this.revision) return;
          if (!file) { this.update({ problem: "missing", busy: false }); return; }
          this.objectUrl = URL.createObjectURL(file);
          url = this.objectUrl;
        }
        const media = new Audio(url);
        media.preload = "none";
        media.loop = this.state.loop;
        this.media = media; this.mediaId = id; this.applyVolume();
        media.onplaying = () => this.update({ playing: true, busy: false });
        media.onpause = media.onended = () => this.update({ playing: false });
        media.onerror = () => this.update({ playing: false, busy: false, problem: "format" });
      }
      await this.media.play();
      if (rev === this.revision) this.update({ playing: true, busy: false });
    } catch {
      if (rev === this.revision) this.update({ playing: false, busy: false, problem: "play" });
    }
  }
  pause = () => {
    ++this.revision;
    this.media?.pause();
    if (this.state.busy && !this.state.importing) this.releaseMedia();
    this.update({ playing: false, busy: false });
  };
  async add(file: File) {
    const problem = audioFileProblem(file);
    if (problem) { this.update({ problem }); return; }
    this.pause();
    this.update({ busy: true, importing: true, problem: null });
    const rev = this.revision;
    // Test the actual file, not just its extension. Unsupported codecs stay out.
    const url = URL.createObjectURL(file), probe = new Audio();
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error("unsupported")), 15_000);
        const finish = (error?: Error) => {
          clearTimeout(timeout); probe.onloadeddata = probe.onerror = null;
          if (error) reject(error); else resolve();
        };
        probe.onloadeddata = () => finish();
        probe.onerror = () => finish(new Error("unsupported"));
        probe.preload = "auto"; probe.src = url; probe.load();
      });
      if (rev !== this.revision) return;
      const track: PersonalTrack = { id: `local-${crypto.randomUUID()}`, name: file.name.replace(/\.[^.]+$/, "").slice(0, 160), size: file.size };
      let temporary = false;
      try { await savePersonalTrack(track, file); }
      catch { this.temporary.set(track.id, file); track.temporary = temporary = true; }
      if (rev !== this.revision) return;
      this.update({ files: [...this.state.files, track], busy: false, importing: false, problem: temporary ? "temporary" : null });
      this.preferences({ selected: track.id });
      // Saving is independent of autoplay restrictions after the picker closes.
    } catch { if (rev === this.revision) this.update({ busy: false, importing: false, problem: "format" }); }
    finally { probe.pause(); probe.removeAttribute("src"); probe.load(); URL.revokeObjectURL(url); }
  }
  async remove(id: string) {
    this.update({ busy: true, problem: null });
    try {
      if (!this.temporary.has(id)) await deletePersonalTrack(id);
      this.temporary.delete(id);
      if (this.state.selected === id) { this.pause(); this.releaseMedia(); this.preferences({ selected: null }); }
      this.update({ files: this.state.files.filter((t) => t.id !== id), busy: false });
    } catch { this.update({ busy: false, problem: "storage" }); }
  }
  dispose() {
    ++this.lifecycle; ++this.revision; this.releaseMedia();
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = null; this.duckUntil = 0;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.update({ playing: false, busy: false, importing: false });
  }
}
