/** Launch content and audience rules shared by the app, previews and sender. */
export const GROUP_LAUNCH_ID = "group-launch-20261027";
export const GROUP_LAUNCH_STARTS_AT = "2026-10-26T21:00:00.000Z";
export const GROUP_LAUNCH_EXPIRES_AT = "2026-11-09T21:00:00.000Z";
export const GROUP_LAUNCH_SCHEDULE_KEY = "group-launch-20261027-schedule";
export const GROUP_LAUNCH_TEMPLATE = "group_launch_20261027";
export const GROUP_LAUNCH_VERSION = 7;
export const GROUP_LAUNCH_URL = "https://havenstudent.com/study/";
export const GROUP_LAUNCH_IMAGE = "/announcements/group-launch-lake.png";
export const GROUP_LAUNCH_STEPS = ["group-welcome", "group-invite", "group-start", "group-progress", "group-future"] as const;
export type GroupLaunchStepId = typeof GROUP_LAUNCH_STEPS[number];

export const groupLaunchCopy = {
  ar: {
    modalTitle: "أهلًا بك في الجلسات الجماعية",
    label: "بداية جديدة في Haven",
    sceneLabel: "مشهد الجلسة الفعلي ببيانات تجريبية",
    pause: "إيقاف العرض مؤقتًا", play: "تشغيل العرض", replay: "إعادة العرض",
    start: "استكشف الجلسات", first: "تعرّف على الجلسات", next: "التالي", back: "السابق", later: "لاحقًا",
    subject: "الجلسات الجماعية تبدأ في Haven",
    pushTitle: "جلستك القادمة، مع زملائك",
    pushBody: "الجلسات الجماعية في Haven: ادعُ زملاءك وابدؤوا جولة دراسة معًا. والكثير قادم قريبًا.",
    steps: {
      "group-welcome": { tag: "مساحة تجمعكم", title: "لكلٍّ مهمته. ولكم جلسة واحدة.", body: "تعرّف على الجلسات الجماعية في Haven. اجتمع مع زملائك حول بحيرة واحدة، وليعمل كل عضو على ما يريد إنجازه.", details: ["المشهد الذي تراه هو مشهد الجلسة داخل Haven.", "وقت للدراسة، واستراحة مشتركة، وأثر يبقى في بحيرتكم."] },
      "group-invite": { tag: "ابدأ بمجموعة", title: "أنشئ مجموعتك، وادعُ زملاءك.", body: "من صفحة بومودورو، افتح «جلسات جماعية». أنشئ مجموعة، ثم شارك رابط الدعوة مع زملائك لينضموا إليها.", details: ["يمكنك العودة إلى مجموعتك من قائمة الجلسات الجماعية.", "ادخل المجموعة وافتح الجلسة عندما يحين وقت الدراسة."] },
      "group-start": { tag: "الاستعداد ثم البداية", title: "حدّد مهمتك، وخذ مكانك.", body: "اختر ما ستعمل عليه وأعلن استعدادك. يتولى منظّم الجلسة بدء الجولة وضبط مدد الدراسة والاستراحة.", details: ["لكل عضو اختياره ومهمته، وتتابعون الجولة في الوقت نفسه.", "أبقِ صفحة الجلسة مفتوحة أثناء الدراسة لتتابع مشاركتك."] },
      "group-progress": { tag: "أثر ما تنجزونه", title: "جولة بعد أخرى، تنمو بحيرتكم.", body: "أكمل الجولة لتكسب ورقة لوتس. وتحتفظ بحيرة الإنجاز بأوراق الأعضاء، بأسمائهم وألوانهم، لتشاهدوا أثر جلساتكم معًا.", details: ["انتقل إلى بحيرة الإنجاز من داخل المجموعة.", "بعد الدراسة، تأتي الاستراحة قبل الجولة التالية."] },
      "group-future": { tag: "هذه هي البداية", title: "والكثير قادم قريبًا.", body: "ابدأ بما هو متاح اليوم: مجموعة تجمعكم، وجلسة تشتركون فيها، وبحيرة تحمل أثر إنجازكم. سنواصل تطوير التجربة في Haven.", details: ["ادعُ زملاءك إلى جلستكم الأولى.", "مرحبًا بكم في بداية الجلسات الجماعية."] },
    },
    emailIntro: "مرحبًا بعودتك إلى Haven. أصبحت الجلسات الجماعية مساحة تجمعك بزملائك: لكل عضو مهمته، وللجميع وقت مشترك للدراسة والاستراحة.",
    referral: { title: "امنح Havi لمستك الخاصة.", body: "ادعُ أصدقاءك إلى Haven برمزك، واكتشف التخصيصات التي تفتحها الدعوات المحتسبة.", action: "اكتشف مكافآت الدعوة" },
    emailFooter: "وصلتك هذه الدعوة للتعرّف على الجلسات الجماعية بعد انقطاعك عن Haven. تُرسل مرة واحدة ضمن هذا الإطلاق.",
  },
  en: {
    modalTitle: "Welcome to group sessions",
    label: "A new beginning in Haven",
    sceneLabel: "The actual session scene, using sample data",
    pause: "Pause demonstration", play: "Play demonstration", replay: "Replay demonstration",
    start: "Explore group sessions", first: "Meet group sessions", next: "Next", back: "Back", later: "Later",
    subject: "Group sessions are starting in Haven",
    pushTitle: "Your next session, together",
    pushBody: "Meet group sessions in Haven. Invite classmates, study together and watch your shared lake grow. Much more is coming soon.",
    steps: {
      "group-welcome": { tag: "A place to meet", title: "Your own tasks. One shared session.", body: "Meet group sessions in Haven. Gather around one lake with your classmates while everyone works on what they want to accomplish.", details: ["This is the actual session scene from Haven.", "Shared study time, a break together, and progress your lake remembers."] },
      "group-invite": { tag: "Start with a group", title: "Create your group. Invite your classmates.", body: "From Pomodoro, open Group sessions. Create a group and share its invitation link so your classmates can join.", details: ["Return to your group from the group sessions list.", "Enter the group and open a session when it is time to study."] },
      "group-start": { tag: "Get ready, then begin", title: "Choose your task. Take your place.", body: "Choose what to work on and mark yourself ready. The session organizer starts the round and sets the study and break durations.", details: ["Everyone has their own task, with a shared round to follow.", "Keep the session page open while studying to maintain your participation."] },
      "group-progress": { tag: "See what you accomplish", title: "Round by round, your lake grows.", body: "Complete a round to earn a lotus leaf. The achievement lake keeps members’ leaves with their names and colours, showing the progress you make together.", details: ["Open the achievement lake from inside your group.", "After studying, take a break before the next round."] },
      "group-future": { tag: "This is the beginning", title: "Much more is coming soon.", body: "Start with what is here today: a group to meet in, a session to share, and a lake that records your progress. We will keep developing the Haven experience.", details: ["Invite your classmates to your first session.", "Welcome to the beginning of group sessions."] },
    },
    emailIntro: "Welcome back to Haven. Group sessions give you a place to meet your classmates, work on your own tasks, and share study time and breaks.",
    referral: { title: "Make Havi your own.", body: "Invite friends to Haven with your code and explore the customizations unlocked by counted referrals.", action: "Explore referral rewards" },
    emailFooter: "This invitation introduces group sessions after your time away from Haven. It is sent once as part of this launch.",
  },
} as const;

export type LaunchChannel = "email" | "push";
export type LaunchCandidate = {
  id: string; createdAt: string; lastActiveAt: string | null; lastSignInAt: string | null;
  confirmed: boolean; banned: boolean; deleted?: boolean; email: string | null;
  hasPush: boolean; groupsEnabled: boolean;
};
const DAY = 86_400_000;
/** Full elapsed days: 3 <= days < 7 gets push; days >= 14 gets email.
 * A snapshot excludes later signups. Unknown/invalid activity fails closed. */
export function groupLaunchChannel(candidate: LaunchCandidate, now: number, cutoff: number): LaunchChannel | null {
  const joined = Date.parse(candidate.createdAt);
  if (!Number.isFinite(now) || !Number.isFinite(cutoff) || !Number.isFinite(joined) || joined > cutoff || !candidate.confirmed || candidate.banned || candidate.deleted) return null;
  const dates = [candidate.createdAt, candidate.lastActiveAt, candidate.lastSignInAt].filter((d): d is string => d !== null);
  const times = dates.map(Date.parse);
  if (times.some(t => !Number.isFinite(t))) return null;
  const last = Math.max(...times);
  if (last > now) return null;
  const days = (now - last) / DAY;
  if (days >= 14 && candidate.email) return "email";
  if (days >= 3 && days < 7 && candidate.hasPush && candidate.groupsEnabled) return "push";
  return null;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
/** Static, bilingual, table-based email. The image is a capture of the real renderer. */
export function renderGroupLaunchEmail(imageUrl = `https://havenstudent.com${GROUP_LAUNCH_IMAGE}`) {
  const blocks = (["ar", "en"] as const).map(lang => {
    const copy = groupLaunchCopy[lang];
    return `<tr><td lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}" style="padding:30px 28px;text-align:${lang === "ar" ? "right" : "left"};border-top:1px solid #dee6db;">
      <p style="margin:0 0 10px;color:#587460;font-size:12px;">${copy.label}</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.5;color:#183f34;">${copy.steps["group-welcome"].title}</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.95;color:#4e6258;">${copy.emailIntro}</p>
      ${(["group-invite", "group-start", "group-progress"] as const).map(id => `<h2 style="margin:22px 0 7px;font-size:18px;line-height:1.6;color:#214b3d;">${copy.steps[id].title}</h2><p style="margin:0;font-size:14px;line-height:1.95;color:#4e6258;">${copy.steps[id].body}</p>`).join("")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:25px;background:#edf2e7;border:1px solid #dce5d5;border-radius:12px;"><tr><td style="padding:20px;"><h2 style="margin:0 0 8px;font-size:19px;line-height:1.6;color:#214b3d;">${copy.referral.title}</h2><p style="margin:0 0 12px;font-size:14px;line-height:1.95;color:#4e6258;">${copy.referral.body}</p><a href="https://havenstudent.com/profile/#profile-ambassador" style="color:#245b46;font-size:13px;font-weight:bold;">${copy.referral.action}</a></td></tr></table>
      <p style="margin:26px 0 9px;font-size:22px;line-height:1.6;color:#214b3d;font-weight:bold;">${copy.steps["group-future"].title}</p>
      <p style="margin:0 0 23px;font-size:14px;line-height:1.95;color:#4e6258;">${copy.steps["group-future"].body}</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#245b46" style="border-radius:10px;"><a href="${GROUP_LAUNCH_URL}" style="display:inline-block;padding:15px 23px;text-decoration:none;color:#fffdf2;font-size:15px;font-weight:bold;">${copy.start}</a></td></tr></table>
      <p style="margin:22px 0 0;font-size:11px;line-height:1.8;color:#78867b;">${copy.emailFooter}</p>
    </td></tr>`;
  }).join("");
  return {
    subject: `${groupLaunchCopy.ar.subject} · ${groupLaunchCopy.en.subject}`,
    html: `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Haven · Group sessions</title></head><body style="margin:0;background:#edf0e7;font-family:Tahoma,Arial,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;">${groupLaunchCopy.ar.steps["group-welcome"].title} ${groupLaunchCopy.en.steps["group-welcome"].title}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 10px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fffef7;border:1px solid #d9e2d4;border-radius:18px;overflow:hidden;"><tr><td style="padding:23px 28px;color:#214b3d;font-family:Georgia,serif;font-size:29px;font-weight:bold;">Haven.</td></tr><tr><td><img src="${escapeHtml(imageUrl)}" width="600" alt="${groupLaunchCopy.ar.sceneLabel} · ${groupLaunchCopy.en.sceneLabel}" style="width:100%;height:auto;display:block;border:0;"></td></tr>${blocks}<tr><td align="center" style="padding:22px;background:#eaf0e4;font-size:12px;color:#6e806f;">Haven · <a href="https://havenstudent.com/" style="color:#245b46;">havenstudent.com</a><br><a href="mailto:support@havenstudent.com" style="color:#245b46;">support@havenstudent.com</a></td></tr></table></td></tr></table></body></html>`,
    text: (["ar", "en"] as const).map(lang => { const c = groupLaunchCopy[lang]; return [c.subject, c.emailIntro, ...GROUP_LAUNCH_STEPS.slice(1).map(id => `${c.steps[id].title}\n${c.steps[id].body}`), `${c.referral.title}\n${c.referral.body}\n${c.referral.action}: https://havenstudent.com/profile/#profile-ambassador`, `${c.start}: ${GROUP_LAUNCH_URL}`, c.emailFooter].join("\n\n"); }).join("\n\n---\n\n"),
  };
}
