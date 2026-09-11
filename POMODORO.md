# Pomodoro — build log & spec (Haven)

> Living document. **Every change we make to the Pomodoro feature is recorded here**
> so a fresh session has full context and never re-invents the design. Update this
> file whenever the Pomodoro scene, timer, or scenario changes.

Conversation language is Arabic; this file and all code/commits stay English.

---

## Current status (2026-09-10)

- The whole Pomodoro experience is **built** but held **LOCKED** behind a
  "coming soon" gate for users. Owner (Hanaa) wants to keep iterating on the
  scene on localhost before launching.
- **Launch flag:** `src/lib/featureFlags.ts` → `POMODORO_ENABLED`.
  - Shipped/pushed value MUST be **`false`** until Hanaa explicitly approves launch.
  - It is currently set to `true` **only for local preview**. ⚠️ **Revert to
    `false` before any commit/push** unless she says "launch it".
- To preview locally: `POMODORO_ENABLED = true`, run dev server, open
  `/pomodoro` (needs login). The page is behind AuthGuard + AppShell.

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
- **Lily pads are LINEAR, left → right** (one line, not scattered). One new pad
  per completed session.
- The **camera scrolls horizontally** to follow Havi (his pad sits ~38% from the
  left so the next fading pad stays visible on the right).
- **Animated**: water ripples/drifts; the treeline parallax-scrolls behind the camera.
- **Day / night by the user's real clock** (`getTimeOfDay`):
  - **Night**: warm deep sage-green sky, a **big golden crescent moon with a
    cream outline**, **chunky golden 4-point stars**, a **lit lamp on Havi's pad**,
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
  copied from) the cozy reference art.
- Personalization-first, no fixed numbers, plain React + Canvas + CSS (no heavy libs).

---

## Architecture

Store is React Context + `useState` (not Zustand). Pomodoro data lives in
`profiles.preferences` JSONB (no new Supabase table), same as `gamification`/`notifPrefs`.

### Files
| File | Role |
|------|------|
| `src/app/(app)/pomodoro/page.tsx` | Page: timer state machine, countdown (deadline-based, catches up when tab was hidden), notif banner, drives `baseMood` + `celebrateSignal`/`witherSignal` + `lilyPadCount` |
| `src/components/pomodoro/PondScene.tsx` | Canvas host + rAF loop (~15 fps). Holds all animation refs, palette transitions, **camera (camX)**, jump/preview/wither logic; builds pads and calls `renderPond` |
| `src/lib/pomodoro/pondRenderer.ts` | **Pure canvas draw** (smooth cartoon): sky, moon/sun, stars, forest, water, lily pads, lamp, fireflies, Havi sprite + moods. Also `renderGrove()` — the isometric floating-island lake for the collection view (reuses the same pine/pad/sky/water helpers) |
| `src/components/pomodoro/GroveModal.tsx` | Portal modal opened from the "your lake / بحيرتك" button: a big canvas running `renderGrove` (own rAF loop, day/night via real clock), header shows the total earned pad count |
| `src/lib/pomodoro/timeOfDay.ts` | `getTimeOfDay()` (hour cutoffs 6/12/17/20) + `SKY_PALETTES` + color/palette lerp |
| `src/lib/pomodoro/timerEngine.ts` | Pure timer state machine (idle/focus/shortBreak/longBreak/paused) |
| `src/components/pomodoro/TimerControls.tsx` | Countdown + Start/Pause/Resume/Skip/Abandon |
| `src/components/pomodoro/PomodoroSettings.tsx` | Durations, style toggle (smooth/pixel), sound, auto-start |
| `src/components/pomodoro/PomodoroStats.tsx` | Today / streak / all-time + 7-day chart |

### PondScene → renderer contract (`PondState`)
`w, h, style, palette, lilyPads[], haviPadIndex, jump, haviMood, fishProgress,
showHavi, tick, camX, reducedMotion, dir`.
- `HaviMood`: `idle | studying | resting | celebrating | sad | jumping | fishing`.
- `LilyPadState`: `cx` is **WORLD** x (screen x = cx − camX), plus `cy, rx, ry,
  hasFlower, opacity, dying`.

### Signals (page → scene)
- `baseMood` from timer phase: focus→`studying`, break→`resting`, else `idle`.
- `celebrateSignal` bump → next (previewed) pad solidifies + Havi jumps onto it.
- `witherSignal` bump → a pad withers + Havi goes `sad`, then a fresh pad regrows
  in its place (pond stays alive). Only a **focus** abandon costs a pad.

---

## Key parameters (pondRenderer.ts / PondScene.tsx)
- Lily pad layout: `FIRST_PAD_X = 170`, `PAD_SPACING = 208`, `MAX_PADS = 80`
  (`PAD_SLOT_COUNT` = MAX_PADS). `padWorldX(i) = FIRST_PAD_X + i*PAD_SPACING`.
  Pads sit on one line at `y ≈ waterline + (h−waterline)*0.52` with a gentle sine.
  Slot 0 = big home pad (has the flower).
- Camera: `camTarget = activeCx − w*0.38`; eased `camX += (target−camX)*0.09`
  (instant when reduced-motion, and on first frame via `camInitRef`).
- Timing (PondScene): `FRAME_MS 66` (~15fps), `JUMP_TICKS 16`, `FISH_TICKS 42`
  (desk-pull intro), `REACT_TICKS 46`, `FADE_TICKS 26`, `PREVIEW_MAX 0.45`.
- Havi sprite pixel size `PS = 4`; pixel-env grid `PXG = 6`.
- Waterline at `h * 0.5`.
- Forest parallax factor `0.3 * camX`; moon/sun parallax `0.04 * camX`.

---

## Change log

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
- Hanaa has more tweaks coming — iterate on localhost before launch.
- Possible: re-add Pomodoro gamification challenges (`pomodoro-focus`,
  `pomodoro-streak`) when it launches — they were **removed** earlier while it's
  locked. See `src/lib/challenges.ts` (`POMODORO_ENABLED` prune).
- `src/lib/gamification.ts` has `COMPLETE_POMODORO` XP for completed sessions.

## Reminders
- ⚠️ Set `POMODORO_ENABLED = false` before pushing (until launch approved).
- Do not copy the DillybyDally reference art — original art only, same warm vibe.
- Keep Havi pixel; keep smooth + pixel styles.
