export const SOLO_MOTIONS = {
  fox: ['play', 'sit', 'nap'],
  tiger: ['guard', 'leaf', 'hop', 'watch', 'nap'],
};

const SOLO_WEIGHTS = {
  fox: {
    alert: { sit: 7, nap: 1, play: 1 },
    schedule: { sit: 5, play: 2, nap: 2 },
    course: { sit: 4, nap: 3, play: 2 },
    quiet: { nap: 5, sit: 4, play: 1 },
    general: { sit: 3, nap: 2, play: 4 },
  },
  tiger: {
    alert: { guard: 7, watch: 5, leaf: 1, nap: 1, hop: 1 },
    schedule: { guard: 6, watch: 3, leaf: 2, nap: 2, hop: 1 },
    course: { watch: 4, leaf: 3, guard: 2, nap: 3, hop: 1 },
    quiet: { nap: 5, watch: 5, leaf: 2, guard: 1, hop: 1 },
    general: { guard: 3, leaf: 4, hop: 2, watch: 3, nap: 2 },
  },
};

function weighted(weights, last, random) {
  const choices = Object.entries(weights).filter(([mode, weight]) => mode !== last && weight > 0);
  let pick = random() * choices.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [mode, weight] of choices) { pick -= weight; if (pick < 0) return mode; }
  return choices.at(-1)?.[0] || last;
}

export function companionContext({ role = '', path = '', nearDue = false }) {
  if (nearDue) return 'alert';
  if (role === 'current-week' || /^\/schedule(?:\/|$)/.test(path)) return 'schedule';
  if (role === 'course' || /^\/(courses|assignments|attendance)(?:\/|$)/.test(path)) return 'course';
  if (role === 'profile' || /^\/(profile|settings|study|pomodoro|checkout|premium)(?:\/|$)/.test(path)) return 'quiet';
  return 'general';
}

// Selection happens once per rest, rather than changing whenever Havi broadcasts.
export function chooseCompanionMotion(kind, { context = 'general', activity = '', last = '', played = {}, now = 0 }, random = Math.random) {
  const weights = { ...SOLO_WEIGHTS[kind][context] };
  if (activity === 'watch') weights[kind === 'fox' ? 'sit' : 'guard'] += 3;
  if (activity === 'books' || activity === 'write') { weights.nap += 2; weights[kind === 'fox' ? 'sit' : 'watch'] += 2; }
  if (activity === 'celebrate' && kind === 'tiger') weights.hop += 4;
  const energetic = kind === 'fox' ? 'play' : 'hop';
  if (played[energetic] !== undefined && now - played[energetic] < 60000) weights[energetic] = 0;
  return weighted(weights, last, random);
}

export function companionRestMs(mode, random = Math.random) {
  if (mode === 'nap') return Math.round(24000 + random() * 10000);
  if (mode === 'sit' || mode === 'watch') return Math.round(8000 + random() * 5000);
  return Math.round(1800 + random() * 2400);
}

export function chooseSharedMotion(context, last, random = Math.random) {
  const weights = context === 'alert' || context === 'quiet'
    ? { greet: 4, rest: 6, follow: 1, leaf: 1 }
    : context === 'schedule' ? { greet: 3, follow: 5, leaf: 2, rest: 2 }
      : { greet: 3, follow: 3, leaf: 4, rest: 2 };
  return weighted(weights, last, random);
}

const COMPANION_CARD_SELECTOR = '[data-havi-role],[data-havi-card],[data-havi-course-id]';
export const COMPANION_AVOID_SELECTOR = "nav,aside,header,footer,[role='navigation'],[data-havi-avoid],figure,picture,svg,canvas,[aria-hidden='true'],[role='dialog'],[data-hero],[class*='mockup'],[class*='preview'],[class*='illustration']";

// Match Havi's outer-card discovery on pages without explicit role markers.
// Called only when choosing a destination, never on every animation frame.
export function discoverCompanionCards(root, valid) {
  const scope = root.querySelector('main') || root;
  const tagged = Array.from(scope.querySelectorAll(COMPANION_CARD_SELECTOR)).filter(valid);
  const boxes = Array.from(scope.querySelectorAll('div,section,article')).filter(el => {
    if (!valid(el)) return false;
    const style = getComputedStyle(el), bg = style.backgroundColor;
    const surface = bg && bg !== 'transparent' && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(bg);
    return parseFloat(style.borderRadius) >= 8 && (surface || parseFloat(style.borderWidth) > 0 || style.boxShadow !== 'none');
  });
  const outer = boxes.filter(el => !boxes.some(parent => parent !== el && parent.contains(el)));
  return [...new Set([...tagged, ...outer])];
}
