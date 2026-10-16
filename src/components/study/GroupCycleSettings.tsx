"use client";
import {useEffect,useState} from 'react';
import {Minus,Plus,SlidersHorizontal} from "@/components/motion/icons";
import {motion} from 'motion/react';
import {useT} from '@/i18n';
import {MotionModal} from '@/components/motion/MotionModal';
import {Press} from '@/components/motion/Press';
import {Swap} from '@/components/motion/Swap';
import {POP} from '@/components/motion/springs';
import type {TranslationKey} from '@/i18n/translations/en';
export type CycleSettings={study:number;rest:number;long:number;count:number};
const presets=[{key:'pom_presetShort',study:25,rest:5,long:15},{key:'pom_presetMedium',study:50,rest:10,long:20},{key:'pom_presetLong',study:90,rest:20,long:30}] as const;
const fields:{key:keyof CycleSettings;label:TranslationKey;min:number;max:number;step:number}[]=[{key:'study',label:'pom_focusDuration',min:5,max:90,step:5},{key:'rest',label:'pom_shortBreakDuration',min:1,max:45,step:1},{key:'long',label:'pom_longBreakDuration',min:5,max:45,step:5},{key:'count',label:'pom_sessionsBeforeLong',min:2,max:8,step:1}];
export function GroupCycleSettings({value,advanced,pending,onSave}:{value:CycleSettings;advanced:boolean;pending:boolean;onSave:(v:CycleSettings)=>Promise<void>}){
 const {t}=useT();const [open,setOpen]=useState(false),[draft,setDraft]=useState(value),[saving,setSaving]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{if(!open)setDraft(value);},[open,value.study,value.rest,value.long,value.count]);
 const duration=(n:number)=>t('study_minutes',{n});
 return <><Press className="rounded-full bg-black/25 px-4 py-2 text-sm inline-flex items-center gap-2" disabled={pending} onClick={()=>{setDraft(value);setFailed(false);setOpen(true);}}><SlidersHorizontal size={15}/>{t('pom_settings')}</Press>
 <MotionModal tone="lake" variant="sheet" open={open} onClose={()=>{if(!saving)setOpen(false);}} title={t('pom_settings')} footer={<div className="flex justify-end gap-2"><Press disabled={saving} className="rounded-full px-4 py-2 text-sm" onClick={()=>setOpen(false)}>{t('cancel')}</Press><Press disabled={saving||pending} className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold" onClick={async()=>{setSaving(true);setFailed(false);try{await onSave(draft);setOpen(false);}catch{setFailed(true);}finally{setSaving(false);}}}>{t('save')}</Press></div>}>
 <div className="grid grid-cols-3 gap-2 mb-5">{presets.map(p=>{const active=draft.study===p.study&&draft.rest===p.rest&&(!advanced||draft.long===p.long);return <Press key={p.key} disabled={saving} onClick={()=>setDraft({...draft,study:p.study,rest:p.rest,long:p.long})} className="relative overflow-hidden rounded-2xl border border-white/15 p-3 text-center"><motion.span className="absolute inset-0 bg-white/15" animate={{opacity:active?1:0}} transition={POP}/><span className="relative block text-xs opacity-80">{t(p.key)}</span><span className="relative block mt-1 font-semibold text-sm">{duration(p.study)}</span><span className="relative block mt-1 text-xs opacity-70">{t('pom_presetBreak',{rest:duration(p.rest)})}</span></Press>})}</div>
 {failed&&<p role="alert" className="mb-3 text-sm">{t("saveError")}</p>}
 <div className="divide-y divide-white/10">{fields.filter(f=>advanced||f.key==='study'||f.key==='rest').map(f=><div key={f.key} className="flex items-center justify-between gap-3 py-3"><span className="text-sm">{t(f.label)}</span><div className="flex shrink-0 items-center gap-2"><Press aria-label={`${t(f.label)} −`} disabled={saving||draft[f.key]<=f.min} onClick={()=>setDraft({...draft,[f.key]:Math.max(f.min,draft[f.key]-f.step)})} className="grid size-8 place-items-center rounded-full border border-white/20"><Minus size={14}/></Press><span className="min-w-20 text-center text-sm font-semibold"><Swap id={draft[f.key]} kind="rise">{f.key==='count'?String(draft[f.key]):duration(draft[f.key])}</Swap></span><Press aria-label={`${t(f.label)} +`} disabled={saving||draft[f.key]>=f.max} onClick={()=>setDraft({...draft,[f.key]:Math.min(f.max,draft[f.key]+f.step)})} className="grid size-8 place-items-center rounded-full border border-white/20"><Plus size={14}/></Press></div></div>)}</div>
 </MotionModal></>;
}
