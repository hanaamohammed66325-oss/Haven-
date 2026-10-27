"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useT } from "@/i18n";
import { groupLaunchCopy, type GroupLaunchStepId } from "../../../supabase/functions/_shared/groupLaunch";
import { GroupLakeFilm } from "./GroupLakeFilm";
import filmCss from "./journey.module.css";
import css from "./groupLaunch.module.css";

/** The existing production lake renderer, with the film's sample inputs only. */
export function GroupLaunchScene() {
  const { lang } = useT();
  const copy = groupLaunchCopy[lang];
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  const playing = !paused && !reduced;
  return <figure className={css.figure}>
    <div className={`${filmCss.scene} ${filmCss.lakeScene} ${css.scene}`} role="group" aria-label={copy.sceneLabel}>
      <GroupLakeFilm paused={!playing} replay={replay} />
      <div className={filmCss.sceneTools}>
        <button className={filmCss.sceneButton} type="button" disabled={!!reduced} onClick={() => setPaused(v => !v)} aria-label={playing ? copy.pause : copy.play}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button className={filmCss.sceneButton} type="button" onClick={() => { setReplay(v => v + 1); setPaused(false); }} aria-label={copy.replay}><RotateCcw size={16} /></button>
      </div>
    </div>
    <figcaption>{copy.sceneLabel}</figcaption>
  </figure>;
}

export function GroupLaunchStep({ id }: { id: GroupLaunchStepId }) {
  const { lang } = useT();
  const step = groupLaunchCopy[lang].steps[id];
  const referral = groupLaunchCopy[lang].referral;
  return <div className={css.copy}>
    <span className={css.tag}>{step.tag}</span>
    <h3 className={css.title}>{step.title}</h3>
    <p className={css.body}>{step.body}</p>
    <ul className={css.details}>{step.details.map(line => <li key={line}>{line}</li>)}</ul>
    {id === "group-future" && <aside className={css.referral}>
      <h4>{referral.title}</h4><p>{referral.body}</p>
    </aside>}
  </div>;
}
