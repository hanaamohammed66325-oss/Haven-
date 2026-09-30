# Pomodoro — build log & spec (Haven)

> Living document. **Every change we make to the Pomodoro feature is recorded here**
> so a fresh session has full context and never re-invents the design. Update this
> file whenever the Pomodoro scene, timer, or scenario changes.

Conversation language is Arabic; this file and all code/commits stay English.

---

## Current status (2026-09-29)

- **Live**: `src/lib/featureFlags.ts` → `POMODORO_ENABLED = true` (launched; the
  old "locked behind coming soon" notes in the change log are history).
- The page's pond window and "your lake" were rebuilt on 2026-09-29 (change logs
  (15)–(20)) and approved by Hanaa; local work, not pushed yet. The throwaway
  `/lake-preview` harness used to review them was deleted after her approval.
- Pomodoro for tasks (21), the page redesign (22) and the full-screen scene (24),
  2026-09-29: reviewed by Hanaa (she saw the morning, then "put it in the real
  app"); the `/task-preview` harness was deleted. Local, not pushed yet.

---

## The vision (from Hanaa, verbatim intent)

A cozy animated **pond** where Havi studies. Reference art she showed: the
"DillybyDally" cozy illustrations ("For my whole life", "The moon for the night",
"And you") — warm, soft, bedtime-cozy. **We do NOT copy that art (it's
copyrighted); we build original art in the same warm vibe.**

### Scenario (one focus session)
1. Havi **waits/watches** on a single lily pad.
2. Session starts → Havi **reels a small study desk up out of the water** (fishing).
3. Havi **studies** on the desk. **Papers advance left → right in an orderly row
   (no scattered papers), then wrap to a fresh page.**
4. The **next lily pad fades in, faint**, to the right, while the session runs.
5. Session ends → Havi **jumps onto the new pad** → **celebration** animation
   (confetti, happy face).
6. Havi **rests** a bit — a nap (zzz) or idly on his phone.
7. Next session repeats the scenario; a new pad each time.

### Environment
- **Lily pads are LINEAR, in the reading direction** (one line, not scattered):
  left → right, right → left in Arabic (the whole pond is mirrored; the timer and
  Havi are not). One new pad per completed session.
- The **camera scrolls horizontally** to follow Havi (his pad sits ~38% from the
  left so the next fading pad stays visible on the right).
- **Animated**: water ripples/drifts; the treeline parallax-scrolls behind the camera.
- **Day / night by the user's real clock** (`getTimeOfDay`):
  - **Night**: warm deep sage-green sky, a **big golden crescent moon in a soft
    glow (no outline)**, **chunky golden 4-point stars**, a **lit lamp on Havi's pad**,
    and **fireflies** drifting over the water.
  - **Day**: cozy cream-and-sage sky, sun; **lamp is off**, no fireflies.
- Setting: a lake with a forest behind it.

### Fixed decisions (do not change without asking)
- **Havi stays the existing pixel-frog sprite** (consistency with the rest of the
  app). Do NOT repaint him to match the smooth scene.
- **The sad face (V7) is already designed and approved — DO NOT change it.** It is
  the `act === "sad"` branch in `drawFace` (pondRenderer.ts). Havi "looking at" a
  dying pad is done by panning the CAMERA toward it, never by editing the face.
- **Smooth cartoon is the ONLY style.** The pixel-art option was removed on
  2026-09-10 — do not reintroduce a pixel/style toggle.
- The environment is a soft hand-drawn **cartoon** look (thick dark ink
  outlines `#33403a` + cream halo via the `inked()` helper), inspired by (not
  copied from) the cozy reference art. **Exception: the sun and the moon have no
  outline** (Hanaa, 2026-09-29 / 2026-09-30) — a soft glowing disc, a glowing
  crescent.
- The page's one action (start / resume / "yes, it's done") takes **the student's
  theme colour** (`ACTION` in `glass.ts` = `--grad-primary`, white text, like the
  app's own buttons), never bright or glowing (Hanaa, 2026-09-30: the gold
  lantern was hard on the eye; then "make it follow the theme").
- The Pomodoro page is a **scene page** in the app shell (`SCENE_PAGES` in
  `AppShell.tsx`): no padding, banners or footer; the pond fills the space under
  the phone's top bar (Hanaa, 2026-09-30).
- Page copy is **white colloquial Arabic** (Hanaa, 2026-09-29): «ابدأ الجلسة، كمّل،
  خلصت الجلسة، قضيت فيها…»; avoid the ر-ك-ز root; durations in words.
- A focus session counts only when its time is up — **no skip during a session**.
- **The page is the scene** (Hanaa asked for a "wow" page, 2026-09-29): the pond
  fills the screen, the timer is written into its sky (drawn by `pondView.ts`),
  and every control floats over it as the lake's dark glass (`glass.ts`). No
  cards or cream sections on the page itself; sheets open over it.
- Personalization-first, no fixed numbers, plain React + Canvas + CSS (no heavy libs).

---

## Architecture

Store is React Context + `useState` (not Zustand). Pomodoro data lives in
`profiles.preferences` JSONB (no new Supabase table), same as `gamification`/`notifPrefs`.

### Files
| File | Role |
|------|------|
| `src/app/(app)/pomodoro/page.tsx` | Page: timer state machine, countdown (deadline-based, catches up when tab was hidden), drives `baseMood` + `celebrateSignal`/`witherSignal` + `lilyPadCount` + `padSpecs` + `focusProgress`/`focusColor` + the sky's `hud`; `lifted` → the pond rises, then opens the lake. Lays the glass HUD over the scene (top: lake · progress · notifications · full screen; under the timer: the task chip / "is it done?" / done note; bottom: the action + settings chip); full screen (`immersive`); the zen fade while a session runs |
| `src/components/pomodoro/PondScene.tsx` | The pond window's host: canvas + rAF loop (~30 fps, paused when scrolled away or the tab is hidden), the trail's story (pads firming up / dying for good, the pad growing with the session, flowers opening), Havi's mood + jump, the camera, mouse look-around, tap on Havi, the rise into the clouds; calls `PondView.draw` |
| `src/lib/pomodoro/pondView.ts` | **The pond window** (pure canvas): the lake's shore from the side. Sky (sun/moon, stars, clouds, birds), two ridges, the far bank strip (forest, subject groves, dock + boat, lanterns, reeds) that repeats along the lake, water that mirrors all of it with a path of light and perspective ripples, pads + flowers, Havi + lamp, near reeds, leaves in the top corners, the rise into the clouds. See change log (18). |
| `src/lib/pomodoro/pondRenderer.ts` | **Shared pond art** (pure canvas): the ink style (`INK`, `inked`), Havi's pixel sprite + moods (`drawHaviSprite` for the pond window, `drawGroveHavi` for the lake), lily pads (`drawLilyPad`, `drawGrovePad` species), flowers, rock, ladybug, butterfly, dragonfly. |
| `src/lib/pomodoro/lakeWorld.ts` | **"Your lake" world** (pure canvas): `LakeWorld` (layout that grows with the harvest, subject groves, zoom levels, ground tiles painted on demand + low-res base, per-frame living parts incl. leaning/swaying trees, cameras) and `Sky` (the dive's clouds + thin clouds below the top zoom level). See change logs (15) and (17). |
| `src/components/pomodoro/GroveModal.tsx` | Full-screen portal opened from the "your lake / بحيرتك" button: runs the dive then the landed world (own rAF loop) with zoom levels (buttons, wheel, pinch, double tap, +/−) and panning (drag with glide, arrows), and a floating glass HUD (title + count + tree rule, auto/day/night, zoom + back to Havi, subject filter + colours) |
| `src/lib/pomodoro/timeOfDay.ts` | `getTimeOfDay()` (hour cutoffs 6/12/17/20) + `SKY_PALETTES` |
| `src/lib/pomodoro/math.ts` | Helpers shared by the pond, the lake, the sprites and the scenes: `clamp`, `lerp`, `mod`, `smooth`, `easeInOut`, `easeOutCubic`, `hash`, `hashString`, and colour mixing (`mixColor`, `rgbOf`, cached per colour) |
| `src/lib/pomodoro/focusTasks.ts` | Pomodoro for tasks: task keys, `focusTasks()` (what can be focused on now), `readTaskFocus()`; the focus per task lives in `preferences.taskFocus` (see change log (21)) |
| `src/lib/pomodoro/timerEngine.ts` | Pure timer state machine (idle/focus/shortBreak/longBreak/paused); `phaseOf(timer)` → the states the page and its controls tell apart (idle, onBreak, running, pausedFocus, breakWaiting, inSession) |
| `src/components/pomodoro/TimerControls.tsx` | One action per state over the water: the `ACTION` pill in the theme's colour (start / resume / start break), glass for pause, end, skip break (the timer itself is in the sky, change log (24)) |
| `src/components/pomodoro/TaskPicker.tsx` | The glass chip under the timer (+ a line of time spent) and the sheet of courses and open tasks (due dates, time spent); a chosen task's estimate question sits at the top of the sheet |
| `src/components/pomodoro/PomodoroSettings.tsx` | The glass settings chip + sheet: presets 25/5, 50/10, 90/20, steppers, sound, auto-start |
| `src/components/pomodoro/PomodoroStats.tsx` | "Your progress" sheet content: today's line, four totals, the last 7 days |
| `src/components/pomodoro/glass.ts` | The HUD styles shared with the lake: `GLASS` (dark frosted glass), `ACTION` (the one clear action, in the theme's colour), `ON_SCENE` (text on the scene) |

### PondScene → PondView contract
- `build(PondInput)`: `w, h, dpr, tod, padSpecs, count, haviPad, reducedMotion, rtl`
  (per size / time of day); `setData(padSpecs, count, haviPad)` on new sessions
  (repaints the far bank, cross-faded, only when a grove grew or changed colour);
  `crossfade(canvas)` before a time-of-day rebuild.
- `draw(ctx, PondFrame)`: `now, tick (15/s, Havi's pixel steps), camX, look,
  pads: TrailPad[] {i, alpha, grow, dying, bud, open, color?}, havi {pad, jump,
  mood, fish} | null, rise, hud: PondHud | null` (`clock, progress, label,
  color, dim, pulse`).
- `hud()` → `HudBox` (`top, cy, size, width, lineY, labelY, label, chipTop`,
  CSS px) for the page to place its task chip; `resetHud()` once the fonts arrive.
- Geometry: `padX/padY/padRx(i)`, `camFor(x)`, `padRange(cam)`, `seat(i, cam)`,
  `onHavi(i, cam, x, y)` (the tap on Havi, sized from his sprite).
- Arabic (`rtl`, read from the page's direction): the whole frame is mirrored once
  (`mirror()`); the timer and its reflection undo it; Havi is moved, never
  flipped (`drawHaviSprite` uses `|m.a|`); PondScene mirrors the pointer's x.
- `HaviMood`: `idle | studying | resting | celebrating | sad | jumping | fishing`.

### Signals (page → scene)
- `baseMood` from timer phase: focus→`studying`, break→`resting`, else `idle`.
- `focusProgress` (0..1 while a focus session runs or is paused) → the next pad
  grows with it; `focusColor` → the bud on it (subject colour).
- `celebrateSignal` bump → the grown pad firms up, its flower opens, Havi jumps onto it.
- `witherSignal` bump → the pad behind Havi browns and sinks for good while he is
  `sad`. Only a **focus** abandon costs a pad.
- `lifted` → the camera rises into the clouds, then `onLifted` opens the lake;
  back to `false` when the lake closes → it comes back down.

---

## Key parameters (pondView.ts / PondScene.tsx)
- Scale `u = clamp(min(w/440, h/380), 0.6, 1.4)`; the far bank meets the water at
  `0.47·h`; the row of pads at 56% of the water's depth.
- The timer in the sky: centred between the top buttons (`HUD_TOP = 60`) and the
  far bank, with room for the chip (`HUD_CHIP = 38` + 12); numerals Fraunces 400,
  `min(0.2w (0.19 on phones), 0.62·room)` clamped 56–150 px, digit boxes 0.6em,
  colon 0.3em; ink/halo per time of day (`hudInk`/`hudGlow` in `SKY_PALETTES`:
  day deep green on a light halo, sunset deep plum on a warm halo, night cream on
  a gold halo); line 2.5–4 px; reflection at `hz + (hz − bottom)·0.5`, squashed
  0.55, 18–24% strength; clouds behind the numerals thin to 35%; the sun/moon
  keeps `R + 0.6·size` clear of the timer (`R + 24` on phones); the numerals
  swell with light for 1.8 s when a session starts and when it ends.
- Pads: `padX(i) = u·(170 + 250·i)`, home `rx = 112u`, others `90–102u`, `ry = 0.35·rx`;
  no cap on the count (only the pads in view are drawn).
- Camera: Havi at 36% of the width (30% under 640 px) so the next pad stays in view;
  eased `1 − 0.91^(dt/66)`. Layers move with it by: sky bodies 0 (only the
  look-around), clouds 0.05, far ridge 0.07, near ridge 0.13, far bank 0.25, water
  0.25 → 1 by depth, pads 1, near reeds 1.3. Look-around 16u at the pads.
- Far bank strip: `BANK_H = 84u`, period `max(1.7w, 1500u, groves + dock + 360u)`,
  laid out so the groves face Havi; ≤ 8192 device px wide (lower resolution past that).
  Grove tree canopy 12.5u, 1–4 rows (≤6 / ≤20 / ≤48 / more trees).
- Flowers on pads: `FLOWER = 19u` at `(+0.55rx, −0.2rx)` (clear of Havi and the slit).
- Timing (PondScene, ms): frame 33, jump 1070, reel the desk 2800, react 3470,
  firm up 1700, death 2770, flower opens 1400, rise 750, growing pad in/out 600;
  Havi's pixel animation still steps at 15 a second.
- Light: pads/land get `source-atop` light — morning `rgba(255,221,158,0.1)`,
  evening `rgba(236,132,64,0.16)`, night `rgba(8,26,34,0.44)`; Havi is never tinted.

---

## Change log

### 2026-09-30 (26) — the scene fills the page, a calmer button, a moon without outline
- Hanaa saw the white strip above the pond (the early-access banner, half covered)
  and the policy links under it: gone from this page. The app shell now knows
  "scene pages" (`SCENE_PAGES` = /pomodoro): no padding, no banners, no footer,
  and `main` becomes a column the page fills (`flex-1`), so the pond is exactly
  the space under the phone's top bar (the whole window on desktop). The page no
  longer undoes the shell's padding with negative margins and a height formula,
  and never scrolls.
- The start / resume / "yes, it's done" button: the gold lantern (bright, glowing)
  → calm sage green with light text (`ACTION`); then, the same day, Hanaa asked
  for it to follow the theme: it now uses the theme's `--grad-primary` with white
  text, like every primary button in the app.
- The moon has no outline, like the sun: the crescent is cut out of the disc
  (an even-odd clip) so the sky and stars show through where the bite was; the
  cream rim and both ink strokes are gone.
- Checked (view only): day and a forced night, English; the dashboard keeps its
  padding, banner and footer.

### 2026-09-30 (25) — right → left in Arabic, and a clean-up pass
- Hanaa (2026-09-29): the pads run right → left in Arabic, done as a general fix in
  the next code-simplification pass. The pond mirrors the whole frame once when
  the page is right-to-left; the timer, its line (it still fills from the right)
  and its reflection read the right way; Havi keeps his sprite; the mouse
  look-around and the tap on Havi follow the mirror. The lake is seen from above
  (a spiral), so it has no direction to flip.
- Clean-up (/simplify, four reviews: reuse, simplification, efficiency, depth):
  - One `math.ts` for the helpers the pond, the lake, the sprites and GroveModal
    each kept a copy of; `lerpColor` (hex only) gone, `mixColor` reads each colour
    once and remembers it (it ran ~30 colour parses a frame).
  - Night: fireflies and lanterns (pond and lake) draw one cached glow per colour
    instead of a new gradient each, every frame. The sky and water gradients are
    made once per size; the timer's line of state is painted once per change (it
    ran a text shadow every frame); the numerals reuse last second's canvas.
  - `phaseOf(timer)` replaces the same checks written in the page and in
    TimerControls (which now takes the timer). The tab's clock goes through
    `usePageTitle(key, { prefix })` instead of the page writing the title itself.
  - Modal and the lake read `onClose` live, so the page's one-second tick no
    longer re-binds their keys (the lake used to reset its zoom and bars every
    second while open during a break). The task sheet is built only while open.
  - The entrance fades (`haven-fade-in/up`, stagger) no longer keep a transform
    once done (`backwards` fill), so a `fixed` child inside a faded page works;
    the page's opacity-only fade workaround is gone.
  - Smaller: settings rows from a list with the app's shared switch; "is it
    done?" labels from one table; `plannerIdOf`; exam types from `upcoming.ts`;
    the lake's subject filter passed one way; six unused copy keys removed.
- Checked in the real page (view only): Arabic, day and a forced night, no console
  errors.

### 2026-09-29 (24) — the page becomes the scene
- Hanaa: the redesign (22) still felt primitive and foreign under the pond; she
  asked for a "wow" page on the lake's level, no ideas of her own, "give me an
  impressive result". The reference apps students love (Flocus, LifeAt, Focus
  Friend…) share one pattern: a full-screen living scene, a big elegant clock in
  it, and very light glass controls.
- The pond fills the page (the viewport minus the phone's top bar; the whole
  window on desktop), edge to edge, no feathered edges. The timer is written into
  its sky by `pondView.ts`: big Fraunces numerals with a halo in the time of day's
  ink, a thin line that fills with the session in the subject's colour (green on
  a break, faint while paused) with a small light at its head, and a line of
  state under it (session n of N / paused / break over / short break · n of N
  done). The water mirrors the numerals faintly, rippled. The sun or moon moves
  aside, big stars skip the timer, clouds thin out behind it.
- Everything else floats as the lake's dark glass: top — "your lake", "your
  progress" (now a sheet), a bell while notifications are undecided (replaces the
  banner), full screen; under the timer — the task chip with a line of time
  spent; after a session on a task the "is it done?" card takes its place, 2 s
  later so Havi's jump is seen first, then the done note; bottom — the lantern
  pill (start / resume / start break) or glass (pause / skip break / end), the
  settings chip, the premium line.
- The estimate question moved into the task sheet (top of it, for the chosen
  task; asked once when a task without one is picked, "edit" later).
- Full screen: the scene covers the app's bars (`fixed`, z-40) and asks the
  browser for full screen where it can; Esc or the button ends it. The page's
  wrapper fades in by opacity only — a lingering transform would pin the fixed
  scene to the page.
- While a session runs, the buttons and the pointer fade away after 4 still
  seconds and come back with any movement, tap or key.
- The roaming Havi mascot never perches on the scene (`data-havi-avoid`): Havi
  already lives in the pond.
- `u` grows on phones (`w/440`) so Havi and the pads keep their presence in the
  taller scene; the horizon moved to 0.47 for more sky.

### 2026-09-29 (23) — «تركيز» gone from the whole app
- Hanaa: change every «تركيز» wording to something better, like «جلسات بومودورو».
  Outside the page, a session is now «جلسة بومودورو» (so it is never confused
  with a class session in the timetable); inside the page it stays «الجلسة».
- Changed (ar + en): `smart_examTomorrow` and `gam_ch_examPrep` (جلسة بومودورو),
  `gam_ch_pomodoroFocus` (أكمل جلستَي بومودورو اليوم), `gam_ch_pomodoroStreak`
  (أكمل جلسة بومودورو كل يوم لمدة ٣ أيام متتالية — what the challenge really
  checks), `land_pomDesc`, `land_pomTitle` (en: "Pomodoro"), `land_subtitle`
  (— وقت أكثر لمذاكرتك، وفوضى أقل), `smart_finalsWeek` (— بالتوفيق!), and the
  admin's top-users hint. No UI string in ar.ts uses the root ر-ك-ز any more.

### 2026-09-29 (22) — the page redesigned; the copy rewritten
- Hanaa: the page felt primitive; she wanted a new, clean, seamless design that is
  easy to use, and the copy («أذاكر / أركّز / ركّزت») felt unnatural. She approved
  the proposal and chose: **white colloquial Arabic** across the page; **no skip
  during a session** (skipping counted a full session — "it was a mistake"); **no
  ring**, with a fitting replacement where the time stays visible; care with the
  colours; and **the sun without its black outline**.
- Layout (`pomodoro/page.tsx`): no title or subtitle; the pond is the stage and
  the timer continues from it (`-mt-2`, pond `clamp(260px, 42vh, 440px)`). Under
  it: the task chip, the task's line (time spent / estimate), the timer, the
  settings chip. "Your progress" below. While a session is on (running or
  paused), the task line, the settings chip, the notification row and the stats
  fold away (`CollapseBody`), so only the pond, the task and the time remain.
- Task picker (`TaskPicker.tsx`, new): replaces the native `<select>`. A chip
  (course colour dot, task · course) opens a sheet (`Modal variant="sheet"`, new:
  rises from the bottom on phones): free session, courses, then assignments /
  exams / planner tasks with due labels (today, tomorrow, in n days, past due;
  this week / next week) and the time spent. The tour's `pom-focus-course` beat
  now only points at the chip (its `selectFirst` needed a `<select>`).
- Timer (`TimerControls.tsx`): the ring is gone. Big numerals (`font-display`,
  500, `clamp(4.25rem, 19vw, 5.75rem)`), each character in a fixed box so they
  never shift; a 6px line under them fills with the phase (the course's colour in
  a session, green on a break, faded while paused); "Session n of N" before and
  during a session, "n of N done" on its break. Idle shows the session's length
  (25:00), not 00:00. One action per state: Start session → Pause → (Resume +
  End session + "end it now and its pad withers") ; a break not started: Start
  break + Skip break; a running break: Skip break. **Skip only exists for breaks**
  and is silent (no chime / notification); a session counts only when its time
  is up. The time left shows in the browser tab while a session or break is on.
- Settings (`PomodoroSettings.tsx`): a chip ("25 min session · 5 min break") opens
  a sheet with presets short 25/5/15, medium 50/10/20, long 90/20/30, the steppers
  (values in words) and the three switches; only between sessions.
- Stats (`PomodoroStats.tsx`): a `Card` "Your progress" with today's line, a 2×2
  (4 on wide screens) grid of soft tiles (no dark `divide-x` lines), durations in
  words ("5 ساعات و50 دقيقة"), streak in days ("يومين"), rounded day bars.
- Durations in words everywhere on the page and on the tasks page:
  `spokenDuration()` in `lib/format.ts` + `dur_*` strings (نص ساعة، ساعة ونص،
  ساعتين، 3 ساعات، ساعتين و15 دقيقة).
- Copy (ar + en): every Pomodoro string rewritten, the tour's Pomodoro lines too;
  «ستريك» for the streak; «جلسة حرة» instead of «عام»; removed `pom_subtitle`,
  `pom_idle`, `pom_focus`, `pom_skip`, `pom_focusOn`, `pom_minutes`, `pom_hours`,
  `pom_days`, `pom_todaySessions`.
- Sun (`pondView.ts` `drawSun`): no ink outline or cream halo; a soft glow and a
  disc with a lighter heart (the palette's `celestialGlow`). The moon is unchanged.
- Fixes found while testing: (a) a session could be **counted twice** when a
  countdown tick and the tab coming back into view landed in the same moment
  (before React re-rendered) — the deadline is cleared before the session is
  finished; (b) a dark line under the pond at 125% screen scaling (the last
  device row was only half erased) — the feathered bands now run past the edges.

### 2026-09-29 (21) — Pomodoro for tasks
- Hanaa (plan approved earlier the same day, `council/expansions.md` idea 4): a
  focus session can be spent on a task, not only a course. Her answers: the
  tasks are a course's assessments (assignments/projects apart from exams) and
  the planner's tasks; an optional "how long do you expect it to take?" compared
  with the real time; after a session ask whether it's done, for every kind.
- `src/lib/pomodoro/focusTasks.ts` (new): task keys `component:<id>` /
  `planner:<id>`; `focusTasks()` = ungraded assessments not marked done (an exam
  until its day, an assignment up to 14 days past its date), soonest first, then
  the planner's open tasks of this week and the next; `readTaskFocus()`.
- Store: `taskFocus` (`preferences.taskFocus`, no DB change):
  `{ minutes, sessions, estimate?, done?, doneAt? }` per task.
  `recordPomodoroComplete(courseId, task)` adds the session to the task and tags
  the pad (`PomodoroPad.task`); `setTaskFocus(key, patch)` for the estimate /
  done. The pad's colour is the task's course (planner tasks: general).
- Page: the "focus on" picker has groups (courses, assignments and projects,
  exam preparation, planner tasks). A chosen task shows the time on it, or its
  estimate chips (30 min to 3 h, "not now"), then "X of Y expected" with a bar
  and "change estimate". After each session on a task: "Done with «X»? Yes, I
  submitted it / No, I'll continue later", "Finished preparing for «X»? Yes / I
  need another session", "Is «X» done? Yes / No" (a planner task is then ticked
  in the planner, with its usual XP). Yes → the task leaves the list, the picker
  goes back to its course, a note shows the estimate next to the real time
  (neutral, no judgement) with undo. `/pomodoro?task=<key>` picks a task (read
  from `window.location`, the static export has no search params on the server).
- Assignments page: each assessment shows its focus time, a "focus on it" button
  (Pomodoro on, task still open) and a "Submitted" / "Prepared" chip once done
  (until the grade is in).
- Checked with demo data in a throwaway `/task-preview` page (writes nothing to
  any account): the link, estimate, a session, "another session", "yes" (exam,
  assignment, planner task), undo, the assignments page, phone + desktop; `tsc`
  clean. Hanaa's test account was only looked at, never written to.

### 2026-09-29 (20) — hide the bars for a clean view of the lake
- Hanaa: a small button that hides the bars so the picture is clean.
- `GroveModal`: an eye button at the end of the side column (under the zoom
  column; beside it on short screens). It fades out the title card, day/night,
  close, the zoom column, "back to Havi" and the subjects bar with its colour
  panel; only the eye stays (60% until hovered) to bring them back. Dragging,
  pinching, the wheel, taps and Esc keep working. Shown again every time the lake
  opens. Labels `pom_hideHud` / `pom_showHud` ("إخفاء الأشرطة" / "إظهار الأشرطة").
- `hud` now carries `pointer-events-auto` itself (a `fade(on)` helper), so hidden
  bars never catch a drag; the side column is always there (it holds the eye).

### 2026-09-29 (19) — every screen size checked
- Hanaa: make sure the lake and the new pond window work on every kind of screen.
  Checked both at 320×568, 430×932, 568×320, 667×375, 812×375, 768×1024,
  1024×768, 1280×800 and 2560×1080 (no blank pixels across the ultrawide canvas).
- **Fixed (lake, phone held sideways)**: an open colour panel ran into the zoom
  column. The HUD is now one flex column (top bar, a middle band, subjects bar)
  and the zoom column is centred in the middle band, so nothing can cover it; on
  short screens (`max-height: 500px`) it lies down as a row with "back to Havi"
  beside it. Many subjects: the colour list scrolls (`max-h-[24vh]`) instead of
  pushing the panel up the screen. The HUD keeps clear of the notch in landscape
  (`env(safe-area-inset-left/right)`; the app uses `viewportFit: "cover"`).
- Pond window: no change needed; the next pad stays in view from 320 px up.

### 2026-09-29 (18) — the pond window rebuilt to the lake's level
- Hanaa: improve the small window at the top of the page (Havi studying) to the
  same level as the map. Issues found and fixed:
  - **Bug**: after 80 sessions (all-time) the window stopped (no next pad while
    studying, Havi jumped in place): `MAX_PADS`/`PAD_SLOT_COUNT` are gone; only the
    pads in view are built.
  - A wall of identical pines hid the sky (sun, moon, stars, clouds); the scene was
    flat (one tree row, a one-colour lake, no reflections); pads ignored the time of
    day; on a phone one fixed-size pad filled the screen and the next pad was off it
    (grass tufts covered it); pads had no subject colour; the next pad reached half
    opacity in 8 s regardless of the session; 15 fps; it looked like a different
    place from "your lake".
- New `pondView.ts` (`PondView`), driven by a rewritten `PondScene.tsx`:
  - **Depth**: open sky, two hazy ridges (the palettes' `hillFar`/`hillNear`), the
    far bank as a strip that repeats along the lake, near reeds in front, leafy
    branches in the top corners; every layer moves at its own speed with the camera
    and with the mouse (look-around).
  - **Same lake**: the lake's palette and trees (`lakePalette`, `drawCanopy`,
    `leafFrom`), its dock + rowboat and lanterns, and the student's **groves** on
    the far bank (`groveList`, one tree per `SESSIONS_PER_TREE` sessions, white
    blossoms, a bed of flowers in the subject's colour), laid out to face Havi. Round
    crowns drawn crisp on the bank are always subject trees (the rest of the forest
    stays soft behind; only pines in front).
  - **Water**: mirrors the bank and ridges (rippled, fading with depth; short enough
    that clouds' outlines never sink in), a bright line at the far bank, a path of
    light under the sun or moon, lantern light running down the water at night,
    ripples in perspective (smaller, slower, farther), a fish ring now and then,
    Havi's reflection while he leaps.
  - **Light by the clock**: morning sun low on the left, afternoon high, a big
    sunset behind the ridge in the evening, the golden moon + stars at night;
    pads/land/branches take the time of day's light; the whole window cross-fades
    when it turns. Havi is never tinted.
  - **The session is the timer**: the next pad grows from the water with
    `focusProgress` (running or paused); from 70% a bud in the subject's colour
    comes up on it; on completion the pad firms up, the flower opens (after Havi
    lands) and stays. Every earned pad carries its subject's water lily (side view,
    `drawLily`). Abandoning sinks the growing pad and still costs the pad behind Havi.
  - **Phone**: scale `u` with the window; Havi at 30% so the next pad is always in
    view; no corner grass over the pads.
  - **Performance**: static parts painted once (bank strip, clouds, branches, pad
    sprites per colour); ~30 fps; nothing drawn while scrolled away or hidden.
    Measured 300 pads, desktop: 0.9–1.0 ms median per frame, ≤ 1.9 ms max.
  - **Rise into the lake**: "your lake" now lifts the camera into the clouds
    (`lifted` → `onLifted`), ending in the lake's dive colour; the lake fades in
    over it (`haven-overlay-in`) and closing it brings the camera back down.
  - Tap Havi (when not studying) → he is happy.
- `pondRenderer.ts` is now shared art only: added `drawHaviSprite` (crisp at any
  size, optional mirrored reflection); removed the old side-scroll renderer
  (`renderPond`, forest, water, lamp, fireflies, `buildLilyPads`, `padWorldX`,
  `PAD_SLOT_COUNT`, `PondState`) and the old top-down lake `renderGrove` + its
  helpers (approved replacement). `drawFace`/body/moods untouched (sad face V7 kept).
- `lakeWorld.ts`: exported the helpers above (+ `clamp`, `smooth`, `hash`,
  `makeCanvas`, `release`, `mixColor`, `drawBushBlooms`, `drawTinyFlower`);
  `groveList` factored out of `layoutGroves` (same result). `timeOfDay.ts`:
  removed the unused `lerpPalette`.
- Page: passes `padSpecs`, `focusProgress`, `focusColor`, `lifted`/`onLifted`;
  dropped the unused `dir`. The pad direction stays left → right in both languages
  (Hanaa: keep it for now; flip it for Arabic in the next code-simplification pass).
- Checked day / morning / evening / night, 19 / 24 / 40 / 85 / 300 pads, phone +
  desktop, a full session (reel → grow → bud → complete → jump → flower opens),
  abandon, the rise and the way back; `tsc` clean; no console errors.

### 2026-09-29 (17) — the lake grows instead of the pads shrinking; zoom levels; subject groves
- Hanaa: instead of shrinking the pads, **make the lake and the map bigger**, let
  the student zoom out in a few steps with a short **rising** animation each time,
  and have **trees in each subject's colour** that stand for the subject like the
  pads do. Later: pad shapes and tree shapes for personalisation. Tree rule agreed:
  **every 5 sessions in a subject grow one tree** (`SESSIONS_PER_TREE`).
- Pads keep one size (`padR = clamp(min(w,h)·0.048, 22, 34)`, room 2.3·padR). The
  lake is at least the screen-fitted size and past that grows with the count
  (area ∝ pads); every pad floats (no more shore bushes for extras; cap 2000).
- **Zoom levels**: 2–4 log-spaced scales from 1 (landing) to the one that fits the
  lake + groves (≤ 0.55). Flight between levels: `ZOOM_MS 900`, log-scale ease,
  slight turn and settle. Thin clouds hang halfway between the two highest levels:
  the camera rises through them and they drift below it at the top. A light haze
  grows with altitude. From high up a pulsing ring marks Havi.
- Controls: + / − buttons (with level dots) and "back to Havi" (shown once Havi is
  near/off the edge), mouse wheel / trackpad (one step per gesture, about the
  cursor), two-finger pinch, double tap / double click (zoom in there), keys + / −,
  drag to pan with a glide, arrow keys. Camera clamped over the lake and groves.
- **Groves**: each subject with ≥ 5 sessions gets a grove on the shore (one tree per
  5 sessions), spread evenly round the lake in the order subjects were first
  studied, skipping the dock and the stream, in 1–6 rows; a grove grows along the
  shore. Grove trees: canopy in the subject's colour (shaded/lit/night-dimmed),
  white blossoms, planted in a small garden bed ringed with flowers in that colour
  (so a green subject still reads as a grove). Generic trees are now all green
  (the pink cherry trees became spring green; bush blooms only white/yellow) so a
  colour on a tree always means a subject.
- **Rendering for a big world**: ground painted on demand into 512-px tiles per
  level of detail (2-px bleed, world-anchored scatter so tiles match), LRU budget
  ~6 screens, painted within a per-frame time budget (landing spot first during the
  dive, a zoom's destination first while flying, the next levels up/down when
  idle); missing tiles fall back to a coarser/finer tile or the low-res base.
  Trees are drawn live from sprites, leaning out from the view's centre like real
  height and swaying in the wind; their shadows are in the tiles. Sprites per level
  of detail, cached on each pad/tree. Only screen, day/night, lake size or groves
  repaint the ground; a colour change only redraws sprites.
- **Dive**: for a big lake it starts higher (`s0 = min(0.3, top·0.72)`), so the
  clouds part over the whole lake in its forest before coming down to Havi (dive
  ≤ 1.22× longer; cloud layers scale with the height).
- Subject filter no longer re-lays out: the other pads fade (0.16).
- New copy: `pom_treeRule`, `pom_zoomIn/Out` (تكبير/تصغير), `pom_backToHavi`.
- Checked 24 / 120 / 300 pads, phone + desktop, day + night, dive + zoom frames;
  frame cost 0.8–3.5 ms (300 pads, desktop), a tile ≈ 2 ms.

### 2026-09-29 (16) — pads spread over the whole lake
- With many pads (120) they had crowded into a solid, overlapping ring around
  Havi with empty water near the shore. `layout()` now gives every floating pad
  room (`room(r) = 2.3·r·√(rx·ry)/min(rx,ry)` centre-to-centre) on an area-uniform
  sunflower spiral from Havi's clear circle outwards: few pads gather near him,
  more spread over the lake, then shrink (max `max(40, m·0.15)` → min 18); only
  when even min-size pads can't fit do the extra sessions become flowering bushes
  on the shore (subject colour). Small hash jitter in size/position so it reads
  as drifting pads, not a grid; pads keep off the sand and clear of the dock/boat.
- Checked 24 / 120 / 300 pads (day + night) and the dive frames.

### 2026-09-29 (15) — "your lake" becomes a game world with a dive from the sky
- Hanaa: tapping the lake should play a **3D animation, as if we come down from the
  sky fast, the clouds part, then we see the lake from above with Havi in the
  middle surrounded by his pads**; a bigger, more beautiful lake with more detail,
  "like we are in a game".
- Approach (no libraries, per the stack rule): a **2.5D camera** over canvas
  layers. Clouds sit at real heights, so they grow and rush past with true
  perspective parallax while the ground zooms (log-scale) and the camera turns.
  Chosen over three.js to keep the hand-drawn ink style, pixel Havi, bundle size
  and iPad memory in check.
- New `src/lib/pomodoro/lakeWorld.ts`:
  - World units = CSS px when landed; lake centre = origin. Deterministic layout
    (seeded), so a student's world looks the same every visit.
  - Cached layers: `far` (whole world, ≤2048px, seen only during the dive),
    `ground` (landed view at full res: meadow + tufts + flowers, dirt path, beach
    with wet sand + pebbles, stream, lake with a soft shallow band + deep core +
    lake-bed stones/plants, foam line, wooden dock + tied rowboat) and `over`
    (trees with ink outlines + cast shadows: round, pine, blossom, bushes; rocks,
    reeds, lantern posts). Near layers get a 64-unit margin for camera drift and a
    5.5M-device-px budget each.
  - Living parts per frame: koi under the pads, bobbing/turning pad sprites
    (cached per species/colour/size), Havi on his home pad (greets on landing,
    celebrates on tap), ripple rings, drifting wind-ripple dashes, sun glints /
    moon reflection + star glints, breathing foam line, butterflies, a dragonfly,
    a passing bird flock with ground shadows, cloud shadows (multiply), and at
    night lantern glow + fireflies. Morning/evening get a multiply light wash;
    night pads are dimmed.
  - Pads keep the old rules: sunflower spiral around Havi (centre kept clear), the
    lake grows with the harvest (`grow = earned/36`), outer sessions become
    flowering bushes on the shore (in the subject's colour), filter = all pads.
  - Dive (`DIVE_MS 1900`): starts inside a cloud layer, falls fast (log zoom from
    `S0 0.3`), clouds part and slide off, camera turns `ROT0 0.36` rad and sweeps
    in from over the path, small dip-and-settle landing. Clouds are anchored to
    where the camera passes their height. Haze fades with altitude. A tap skips
    (finishes in 260ms); reduced motion skips it entirely.
  - Landed camera: gentle idle drift + mouse hover / touch drag to look around;
    the `over` layer shifts 20% more (parallax, so trees feel tall).
- `GroveModal.tsx` rewritten: full screen, dark frosted-glass HUD that slides in
  after landing (title + count; auto/day/night — one cycling button on phones;
  subject filter chips in a scroll row + a palette button for colours), close
  always visible, Esc closes, safe-area insets. No new i18n strings.
- `pondRenderer.ts`: exported `INK`, `inked`, `drawLilyPad`, `drawGrovePad`,
  `drawGroveBloom`, `drawGroveHavi`, `drawButterfly`, `drawDragonfly`,
  `drawLadybug`, `drawRock` (no behaviour change).
- Measured (desktop): build 50–120ms (iPad-size, 160 pads ≈ 100ms), landed frame
  ≈ 0.6ms at ~30fps, dive frame ≈ 6ms. `tsc` clean. Verified dive frames, landed
  day + night, phone + desktop sizes, tap Havi / tap water, via a throwaway
  `/lake-preview` harness (never commit it).
- Pending Hanaa's review; after approval delete `renderGrove` + its private
  helpers and the harness.

### 2026-09-11 (14) — uniform pad shape (for now) + timer redesign
- Hanaa: keep **all pads the same shape for now**; new leaf shapes / flowers /
  creatures will **unlock later via challenge rewards**. So the page forces every
  pad to `species:0, flower:0` (only COLOUR varies by subject); the per-subject
  leaf-shape `<select>` was removed from `GroveModal` (colour picker + filter +
  day/night stay). `padSpecies` type/store kept for the future unlock system.
- Timer redesign (`TimerControls`): the old ring had a mismatched viewBox (128) vs
  render size (148) and the phase label sat *inside* the ring, overflowing it. Now
  `SIZE=184` with a matching viewBox, only the clock inside (46px), and the phase
  label moved **below** the ring (tinted to the ring colour while running).
- `tsc` clean; verified both timer states + uniform-shape lake. Committed (pomodoro
  files only; `POMODORO_ENABLED` stays committed-false = still locked).

### 2026-09-11 (13) — per-subject bloom colour picker
- Hanaa asked where to set a subject's colour. Added an inline **colour swatch**
  (`<input type="color">`) next to each subject in the modal, beside the leaf-shape
  select. Heading now "لون وورقة كل مادة" (`pom_customizePlant`; `pom_color`).
- `PomodoroSettings.padColors` (courseId → hex). Page `courseColor()` prefers the
  override, then the course's own colour, then the hashed fallback. `setCourseColor`
  → `setPomodoroSettings` (persisted). `GroveModal` gained `onSetColor`.
- Base colour still comes from the course's colour (Courses page); this overrides it
  just for the pond. Verified: changing Math → red re-blooms all Math pads live.
- Note: pads only bloom for course-tagged sessions; "General" sessions stay plain
  green (that is why an all-General lake shows no flowers).

### 2026-09-11 (12) — subject filter, per-subject shape picker, day/night view
- Hanaa: a button to **filter to one subject** (hide the others), **choose the leaf
  shape per subject**, and **preview the scene by day**.
- Filter: `GrovePadSpec.key` (courseId or `__general`) + `GroveState.filterKey`.
  When set, `renderGrove` shows only that subject's pads (all rendered as pads, no
  shore greenery). Filter chips in the modal ("Show: All / <subjects>").
- Leaf shape: `PomodoroSettings.padSpecies` (courseId → species idx), set from a
  per-subject `<select>` in the modal (`onSetSpecies` → `setPomodoroSettings`,
  persisted). `padSpecs` in the page applies the override, else the id-hash default.
- Day/night: modal header toggle (Auto / Day / Night) picks the palette
  (`SKY_PALETTES.afternoon` / `.night` / `getTimeOfDay()`); only `palette.night`
  matters to `renderGrove`.
- i18n: `pom_filterSubject`, `pom_allSubjects`, `pom_leafShape`, `pom_viewAuto/Day/
  Night`, `pom_leaf{Classic,Ruffled,Victoria,Lotus,Heart}` (en + ar). `GroveModal`
  props gained `species` + `onSetSpecies`; legend entries gained `key`.
- `tsc` clean; verified filter (Math only), live shape change (Math → Heart), day view.

### 2026-09-10 (11) — lily-pad & flower species
- Hanaa: give the pads/flowers real **types** (she researched real lily-pad
  varieties). Each course now grows a distinct plant = species + flower + colour,
  deterministic from `courseId` (so a subject is always the same plant). Beats
  Forest's cosmetic variety because the type is *meaningful*.
- Renderer: `GrovePadSpec {color, species, flower}` replaces the old `padColors`.
  `PAD_SPECIES=5`: 0 classic Nymphaea (slit+veins), 1 ruffled (scalloped edge),
  2 Victoria (raised rim + many ribs), 3 lotus leaf (round, centre-hub veins,
  cooler green), 4 heart/arrow leaf. `PAD_FLOWERS=4`: 0 star lily (`drawLotus`),
  1 lotus cup, 2 daisy, 3 closed bud. New `drawGrovePad` + `drawGroveBloom` and
  pad-shape helpers (`padInnerRim`/`padTopHi`/`padVeins`/`padWedge`); `drawLotus`
  now takes a base colour.
- Page: `padSpecs` derived per pad via `hashId(courseId)` → `{color, species=h%5,
  flower=(h>>3)%4}`; General pads plain. Passed to `GroveModal` → `GroveState`.
- `tsc` clean; verified all 5 species + 4 flowers across subjects.

### 2026-09-10 (10) — subject-mapped lake (Phase 1 of "better than Forest")
- Vision: beat Forest's *cosmetic* tree variety by making the pond **mean** something
  — every pad reflects the real course it was studied on. Hanaa picked all four
  directions; building in phases. **Phase 1 = per-session course + colour-by-subject
  + legend.** (Phases 2–4 pending: tap-a-pad detail + rare plants; habit-driven
  wildlife; themes + naming + share.)
- Data: new `PomodoroPad {date, courseId|null, minutes}` type; `PomodoroStats.pads[]`
  (newest last, capped `POMODORO_PAD_LIMIT=200`). `recordPomodoroComplete(courseId?)`
  pushes a pad; hydration migrates `pads` (default `[]`). Legacy sessions have no pad
  record → render as plain pads.
- Page: a **"Studying / أذاكر" course picker** (the student's courses + "General"),
  disabled while running; its choice is passed into `recordPomodoroComplete`.
  Builds `padColors` (course `color` or a deterministic `fallbackColor`) + a `legend`
  (subject → colour + count) from `pomodoroStats.pads`.
- Grove: `GroveState.padColors`; each pad blooms a **lotus in its course colour**
  (`drawLotus(…, base)` derives petals via `lerpColor`); plain pads = General. The
  modal shows a **legend** under the canvas ("كل زهرة تمثّل مادة"). i18n:
  `pom_focusOn`, `pom_generalFocus`, `pom_lakeLegend` (en + ar). `DemoStore` pads:[].
- `tsc` clean; verified 12 pads with 4 subjects + legend.

### 2026-09-10 (9) — tap-to-react Havi + shore greenery
- Hanaa: tapping Havi should make him react, and the **outer ring of pads should
  become trees & grass** (feels more natural than a solid raft of pads).
- Pad/greenery split in `renderGrove`: each session spirals out; within `RT=0.82`
  of the open radius it's a lily pad on the water, beyond it it's pushed onto the
  shore ring (out to `0.46*frame`) as a top-down `drawGroveTree` canopy or a
  `drawGrassTuft` (alternating). So the pond sits inside a green ring that grows
  with the harvest.
- Tap interaction: `GroveState.haviReact`; `GroveModal` adds a `pointerdown` on the
  canvas — a tap within `0.18*min(w,h)` of the centre sets `reactStart`, and for
  `REACT_FRAMES=34` (~2.3s) `drawGroveHavi` renders the `celebrating` mood (happy
  face + upward bounce + confetti). Canvas gets `cursor:pointer` + `touchAction`.
- `drawGroveHavi` now takes a `HaviMood`. `tsc` clean; verified 12 / 80 + the tap.

### 2026-09-10 (8) — a living, growing lake
- Hanaa: more life in the pond (not just pads), and the **lake should grow bigger
  as the pad count grows** — don't just shrink the whole picture. Wants trees,
  rocks, butterflies and insects in the scene.
- `renderGrove` now scales with `grow = min(1, earned/36)`: the open-water ellipse
  widens (`openR = 0.33→0.44` of the frame) and the foliage `band` thins
  (`0.185→0.11` of min-dim), so a big grove reads as a bigger lake while pads keep
  a sensible size (`padBase` floor 15).
- Added life helpers: `drawGroveDuckweed` (floating specks), `drawGroveRocks`/
  `drawRock` (mossy shore stones + stepping stones), `drawGroveWillow`/
  `…Strand` (willow branches hanging from the top corners = trees),
  `drawGroveReeds` (cattails at the shore), `drawLadybug` (on ~1/9 of pads),
  `drawButterfly` + `drawDragonfly` via `drawGroveInsects` (butterflies by day, a
  dragonfly always, glowing motes by night). Factored `groveGreens(night)`.
- `drawGroveFoliage` now takes the computed `band`. Tested 12 / 80. `tsc` clean.

### 2026-09-10 (7) — "your lake" reworked to a top-down pond
- Hanaa rejected the isometric island ("like they're in a box"). Reference: a lush
  pond shot **straight down from above** — water filling the frame, leafy foliage
  framing the edges, lily pads floating, **Havi in the centre watching**. (Don't
  copy the refs, just the camera + vibe.)
- `renderGrove` rewritten again as a **top-down** scene: full-frame water gradient
  (green-teal day / near-black-green night) + a centre glow, concentric ripple
  rings from the middle, earned pads sunflower-scattered over an open ellipse with
  the centre kept clear, some pads blooming a pink `drawLotus`, Havi small & idle
  ("watching") on the centre home pad, a `drawGroveFoliage` canopy of `drawLeafBush`
  clusters ringing the top+sides (bottom-centre left open), night `drawGroveMotes`
  fireflies, and a vignette. Pads drawn near-circular (`ry = r*0.86`) for the
  overhead look.
- New helpers: `drawLeaf`, `drawLeafBush`, `drawGroveFoliage`, `drawLotus`,
  `drawGroveMotes`, `Greens` type. Removed the iso projection, `drawGroveLake`, the
  tree ring and `FLOWER_COLS`. `drawGroveHavi` (scaled sprite) kept.
- Tested 1 / 12 / 80. `tsc --noEmit` clean. Verified via throwaway `/grove-preview`.

### 2026-09-10 (6) — grove reworked into an isometric floating island
- Hanaa: the flat "clearing" looked like the pads were sitting in a box/plate.
  She wants the **Forest-app look**: a small floating isometric island, everything
  small & realistic, **lake in the centre with trees ringing it**. Renamed the
  feature **"your lake" / بحيرتك** (`pom_grove` + `pom_groveTitle` values only).
- `renderGrove` rewritten: an iso projection `iso(u,v)` maps a unit plane square to
  a screen diamond. Draws sky+day/night, a floating shadow, a soil taper + two lit
  slab side-faces (earth underside), the grass diamond top with a lit back rim,
  scattered flowers, a **central iso lake** (`drawGroveLake` reused, smaller), the
  earned pads sunflower-spiralled **inside** the lake (clipped), Havi small on the
  centre home pad (`drawGroveHavi` now scales the sprite), and a **ring of little
  pines** around the rim split back/front for depth. `drawGroveForest` (the old
  full-width treeline) deleted.
- Key params: `ISOX=min(w*0.44,h*1.3)`, `ISOY=min(ISOX*0.42,h*0.19)`, slab
  `THICK=ISOY*0.85`, `TAPER=ISOY*0.95`; lake `rx=ISOX*0.4, ry=ISOY*0.4`; tree ring
  plane-radius `0.8–0.94`, tree height `ISOY*0.78*scale`; pads plane-radius up to
  `0.46`, size shrinks with count. Tested 1 / 12 / 80.
- `tsc --noEmit` clean. Verified via throwaway `/grove-preview` (deleted).

### 2026-09-10 (5) — "your grove" collection view
- Hanaa: a button on the Pomodoro page opens a big window with a forest + central
  lake in the same Forest art, holding one lily pad per session the student has
  finished — so the accumulated work reads as an achievement.
- New `renderGrove(ctx, GroveState)` in `pondRenderer.ts`: a single framed scene
  (not the side-scroll) — sky + real-clock day/night, a full-width pine treeline
  ringing a grassy clearing, one central oval lake, Havi on his home pad in the
  middle, and `count` earned pads scattered over the water by a sunflower
  (phyllotaxis) spiral so any count (tested 1 → 80) fills the lake evenly. Pads
  are clipped to the lake ellipse and shrink as the count grows.
- Refactor to keep the art identical & DRY: extracted `drawPine(...)` and
  `forestColors(night)` (now shared by `drawForest` + the grove), and widened the
  sky-body helpers (`drawSun`/`drawMoon`/`drawStars`/`drawClouds`) to a light
  `SkyView` type (`PondState` still satisfies it structurally, so the timer scene
  is unchanged).
- New `GroveModal.tsx` (portal overlay, Esc/backdrop close, own ~15fps rAF loop).
  Button + `groveOpen` state added to `pomodoro/page.tsx`. i18n: `pom_grove`,
  `pom_groveTitle`, `pom_groveCount`/`pom_groveOne`/`pom_groveEmpty` (en + ar).
- `tsc --noEmit` clean. Verified in browser via a throwaway `/grove-preview`
  harness (deleted).

### 2026-09-10 (4) — remove the pixel-art option entirely
- Hanaa: drop the pixel style; the pond is **smooth cartoon only** now.
- Deleted the `PondStyle` type + `pondStyle` field (`types/index.ts`), its default
  (`store/index.tsx`, `DemoStore.tsx`), the style toggle UI + `Waves`/`Grid3x3`
  imports (`PomodoroSettings.tsx`), the `style` prop/ref/`imageRendering`
  (`PondScene.tsx`) and the `style` prop pass (`pomodoro/page.tsx`).
- Removed the whole pixel render path from `pondRenderer.ts` (`drawEnvironmentPixel`,
  `drawLilyPadPixel`, `PXG`/`snap`/`prect`/`pdisc`, the `style==="pixel"` branches,
  and the now-needless `imageSmoothingEnabled=false`).
- Removed `pom_pondStyle`/`pom_styleSmooth`/`pom_stylePixel` from en/ar.
- Note: `imageRendering:"pixelated"` still exists in `HaviMascot.jsx`/`HaviLoader.tsx`
  — that's the app-wide pixel mascot, unrelated to the pond. Leave it.
- Typecheck passes.

### 2026-09-10 (3) — feedback tweaks
- **Lowered brightness** (Hanaa: too bright, not easy on the eyes). Muted the day
  sky/water palettes (`timeOfDay.ts`), softened forest greens, lily-pad green,
  grass, the `inked()` cream halo, and the white ripple/sheen opacity.
- **Abandoned pad now dies for good** (Hanaa: "خلاص ماتت يعني اختفت"). The pad
  behind Havi browns, shrinks, sinks and **vanishes permanently — no regrow**.
  Implemented with a `deadRef` Set in `PondScene`; the fade-in loop pins dead
  indices at opacity 0 so they never rise again (the old fade-in was resurrecting
  them). The slot stays as a gap; `lilyPadCount` is left unchanged.
- **Moon reshaped** — the crescent was drawing as a weird double sliver. `drawMoon`
  now carves a sky-coloured bite out of a clipped golden disc → one clean crescent
  with cream halo + ink outline.
- **Forest brought closer** — taller/wider pines in both rows (front ht ≈ 116–174,
  back ≈ 120–180) so the treeline reads near instead of distant.

### 2026-09-10 (2) — cartoon restyle to match the cozy reference
Restyled the **smooth** environment into a soft hand-drawn cartoon look (reference:
a cozy lake illustration Hanaa shared — emulated, never copied).
- New `inked()` helper: cream halo + chunky dark ink outline (`INK = #33403a`).
- `drawSun`: pale disc with short hand-drawn rays. New `drawClouds` (soft puffs,
  layered fills so the silhouette is one clean outline, slow drift). New
  `drawButterflies` (day) and `drawGrass` (foreground corner tufts, gentle sway).
- `drawForest`: soft cartoon pines (rounded tiers, left-shade wedge, **sway in the
  breeze**), a rounded **shrub band** along the shore, a faded back row.
- `drawWater`: flat cartoon lake with **drifting white dash ripples** + a shore sheen.
- `drawLilyPad`: **bigger, detailed** — cream halo + ink outline, darker inner rim,
  radial veins, a slim front **notch/slit**, concentric ripple rings, top highlight,
  outlined flower on the home pad.
- **Havi shrunk** (`PS 4→3`), **pads enlarged** (`FIRST_PAD_X 190`,
  `PAD_SPACING 250`; home rx/ry ≈ 116/40); `haviOrigin` re-seated on the bigger pad.
- Softer, cozier **day palettes** (`timeOfDay.ts` morning/afternoon).
- **Abandon behaviour** (per Hanaa): the pad **behind Havi** (`haviPadIndex − 1`)
  withers/dies while Havi goes **sad** and the **camera pans toward it** so he is
  seen watching it die; then it regrows (pond stays alive; `lilyPadCount` is not
  decremented in the store). `REACT_TICKS 46→52` to hold through the wither→regrow.
- ⚠️ The **sad face was briefly edited to look left and then reverted** — Hanaa's
  V7 sad face is approved; leave it untouched.
- Typecheck passes; verified on localhost (day cartoon, clouds/sun, forest/shrub,
  detailed pad, butterflies, grass, jump+scroll, abandon→wither-prev+sad+camera-pan).

### 2026-09-10 — scene rewrite (linear pond + camera + day/night atmosphere)
Reworked the scene from the old *static, scattered* pond to the linear,
camera-scrolled, animated vision above.
- `pondRenderer.ts`:
  - Lily pads now **linear world coordinates** (`buildLilyPads`, `padWorldX`,
    `PAD_SLOT_COUNT = 80`); pads/Havi/lamp drawn under a **camera translate**.
  - **Animated water** (ripple rows drift with `tick`), **parallax + tiled forest**
    (both smooth and pixel) so scrolling never reveals an edge.
  - Night now uses the **palette** (green) instead of hardcoded navy, in both
    `drawSky`/`drawWater` and the pixel env.
  - New **golden crescent moon** with cream outline + glow (`drawMoon`), and
    **chunky 4-point golden stars** with cream outline (`drawStars` +
    `fourPointStar`). Pixel moon = golden disc with a bite → crescent.
  - New **`drawLamp`** (warm lantern on Havi's pad, night only, gentle flicker)
    and **`drawFireflies`** (drifting yellow-green motes over the water, night only).
  - **`drawStudying`**: sheets now fill the desk **left → right** then wrap.
  - New **`drawResting`**: alternates a nap (zzz) and scrolling a phone.
- `PondScene.tsx`: added **camera** (`camXRef`/`camInitRef`), computes
  `camTarget` from Havi's/interpolated jump world x, passes `camX` in state.
- `timeOfDay.ts`: **cozy palettes** — warm cream-and-sage days; deep sage-green
  night with a golden moon (was cold navy).
- Verified on localhost (temporary un-auth harness, since removed): day+night,
  smooth+pixel, fishing+desk, study, jump+celebrate+camera-scroll, lamp, fireflies.
- Typecheck (`tsc --noEmit`) passes.

---

## Pending / ideas (not yet done)
- Personalisation later (Hanaa, 2026-09-29): pad shapes (5 leaf species + 4 flowers
  are already drawn, all pads use one for now) and tree shapes per subject.
- Hanaa has more tweaks coming — iterate on localhost before launch.
- Possible: re-add Pomodoro gamification challenges (`pomodoro-focus`,
  `pomodoro-streak`) when it launches — they were **removed** earlier while it's
  locked. See `src/lib/challenges.ts` (`POMODORO_ENABLED` prune).
- `src/lib/gamification.ts` has `COMPLETE_POMODORO` XP for completed sessions.

## Reminders
- Pomodoro is live (`POMODORO_ENABLED = true`); keep it on.
- Do not copy the DillybyDally reference art — original art only, same warm vibe.
- Keep Havi pixel; the scenes are smooth cartoon only.
- Preview harnesses (like the deleted `/lake-preview`) are throwaway: never commit
  them.
