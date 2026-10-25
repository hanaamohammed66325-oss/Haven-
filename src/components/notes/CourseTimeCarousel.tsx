'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { notesCopy } from '@/lib/notes/copy';
import { upcomingMeetings, type WeeklyMeeting } from '@/lib/notes/schedule';
import s from './notes.module.css';

export function CourseTimeCarousel({ sessions, now, language, clockFormat }: { sessions: readonly WeeklyMeeting[]; now: Date; language: 'ar' | 'en'; clockFormat: '12' | '24' }) {
  const t = notesCopy(language);
  const reducedMotion = useReducedMotion();
  const meetings = upcomingMeetings(sessions, now);
  const nearestId = meetings[0]?.session.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  useEffect(() => setSelectedId(null), [nearestId]);
  const index = Math.max(0, meetings.findIndex(item => item.session.id === selectedId));
  const meeting = meetings[index];
  if (!meeting) return <p className={s.meetingEmpty}>{t.noScheduledTime}</p>;
  const move = (step: number) => { const next = meetings[index + step]; if (next) { setDirection(step * (language === 'ar' ? -1 : 1)); setSelectedId(next.session.id); } };
  const Previous = language === 'ar' ? ChevronRight : ChevronLeft;
  const Next = language === 'ar' ? ChevronLeft : ChevronRight;
  return <section className={s.meetingCarousel} aria-label={t.weeklySchedule}>
    <div className={s.meetingViewport} aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div key={meeting.session.id} className={s.meetingSlide} custom={direction} initial={reducedMotion ? false : { opacity: 0, x: direction * 24 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * -24 }} transition={{ duration: reducedMotion ? 0 : .22, ease: [.22, 1, .36, 1] }}>
          <span className={s.meetingCaption}>{index === 0 ? t.nearestClass : t.laterClass}</span>
          <div className={s.meetingTime}><strong dir="ltr">{new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: clockFormat === '24' ? 'h23' : 'h12' }).format(meeting.date)}</strong><span>{new Intl.DateTimeFormat(language, { weekday: 'long' }).format(meeting.date)}</span></div>
        </motion.div>
      </AnimatePresence>
    </div>
    {meetings.length > 1 && <nav className={s.meetingNavigation} aria-label={t.weeklySchedule}>
      <span className={s.meetingProgress} aria-hidden="true">{meetings.map((item, at) => <i key={item.session.id} data-active={at === index} />)}</span>
      <button type="button" aria-label={t.previousClass} title={t.previousClass} disabled={index === 0} onClick={() => move(-1)}><Previous size={17} /></button>
      <button type="button" aria-label={t.nextClass} title={t.nextClass} disabled={index === meetings.length - 1} onClick={() => move(1)}><Next size={17} /></button>
    </nav>}
  </section>;
}
