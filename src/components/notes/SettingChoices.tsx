'use client';
import s from './notes.module.css';

/** Small, local diagrams show the result before a setting is selected. */
export function SettingDiagram({ kind, value = '', color }: { kind: string; value?: string | number; color?: string }) {
  const v = String(value), page = <rect x="19" y="5" width="42" height="50" rx="3" fill="var(--n-panel)" />;
  let drawing;
  if (kind === 'paper' || (kind === 'cover' && v === 'none')) drawing = <>{page}<rect x="19" y="5" width="42" height="50" rx="3" />{(v === 'ruled' || v === 'grid' || v === 'none') && [17, 25, 33, 41].map(y => <path key={y} d={`M24 ${y}H56`} opacity=".4" />)}{v === 'grid' && [24, 32, 40, 48, 56].map(x => <path key={x} d={`M${x} 12V48`} opacity=".4" />)}{v === 'dots' && [17, 25, 33, 41].flatMap(y => [26, 34, 42, 50].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r=".8" fill="currentColor" stroke="none" />))}</>;
  else if (kind === 'cover') drawing = <><rect x="18" y="5" width="44" height="50" rx="4" fill={color || 'currentColor'} fillOpacity=".25" /><rect x="18" y="5" width="44" height="50" rx="4" /><path d="M24 6V54" opacity=".45" />{v === 'linen' ? <path d="M29 14H57M29 21H57M29 28H57M29 35H57M29 42H57M32 9V50M40 9V50M48 9V50M56 9V50" opacity=".18" /> : v === 'arch' ? <path d="M30 48V29a10 10 0 0 1 20 0V48Z" /> : <path d="M31 21H53M31 27H46" />}</>;
  else if (kind === 'direction') drawing = v === 'vertical' ? <><rect x="25" y="4" width="28" height="23" rx="2" /><rect x="25" y="33" width="28" height="23" rx="2" /><path d="M63 17V44m-4-4 4 4 4-4" /></> : <><rect x="6" y="13" width="27" height="34" rx="2" /><rect x="44" y="13" width="27" height="34" rx="2" /><path d="M27 53H53m-4-4 4 4-4 4" /></>;
  else if (kind === 'dock' || kind === 'sidebar' || kind === 'undo' || kind === 'tabs' || kind === 'status') {
    const side = kind === 'sidebar' ? v === 'end' ? 'right' : 'left' : v;
    drawing = <><rect x="8" y="7" width="64" height="46" rx="4" fill="var(--n-panel)" /><rect x="8" y="7" width="64" height="46" rx="4" opacity=".5" />{side === 'left' || side === 'right' ? <rect x={side === 'left' ? 12 : 58} y="12" width="10" height="36" rx="3" fill="currentColor" fillOpacity=".65" /> : <rect x="15" y={side === 'bottom' || kind === 'status' ? 41 : kind === 'undo' && v === 'toolbar' ? 27 : 11} width="50" height="8" rx="3" fill="currentColor" fillOpacity=".65" />}{kind === 'undo' && <path d={v === 'toolbar' ? 'M26 31h22m-18-3-4 3 4 3' : 'M27 15h20m-16-3-4 3 4 3'} stroke="var(--n-panel)" />}</>;
  } else if (kind === 'appearance') drawing = <><rect x="8" y="7" width="64" height="46" rx="5" fill={v === 'dark' ? '#243442' : 'var(--n-panel)'} />{v === 'auto' && <path d="M40 7h27a5 5 0 0 1 5 5v36a5 5 0 0 1-5 5H40Z" fill="#243442" stroke="none" />}<rect x="8" y="7" width="64" height="46" rx="5" /><path d="M17 21H33M17 28H30M17 35H33M47 21H63M47 28H60M47 35H63" stroke={v === 'dark' ? '#fff' : 'currentColor'} opacity=".7" /></>;
  else if (kind === 'alignment') drawing = <>{[38, 24, 33, 20].map((w, i) => <path key={i} d={`M${v === 'right' ? 60 - w : v === 'center' ? 40 - w / 2 : 20} ${16 + i * 9}h${w}`} strokeWidth="3" />)}{v === 'auto' && <path d="m55 10 6 5-6 5m6-5H45" />}</>;
  else if (kind === 'eraser') drawing = <><path d={v === 'stroke' ? 'M10 39q14-27 27-5t32-5' : 'M10 39q11-23 20-15M51 42q9 7 18-13'} opacity={v === 'stroke' ? '.22' : '1'} /><circle cx="40" cy="30" r={v === 'precision' ? 6 : 12} strokeDasharray="3 3" /><path d="m35 29 6-6 6 6-6 6Z" fill="var(--n-panel)" /></>;
  else if (kind === 'eraseText') drawing = <><text x="9" y="32" fontSize="14" fill="currentColor" stroke="none" opacity=".85">Hello</text><text x="43" y="32" fontSize="14" fill="currentColor" stroke="none" opacity=".85">world</text><path d={v === 'line' ? 'M8 27H73' : 'M43 27H74'} strokeWidth="13" stroke="var(--n-panel)" opacity=".92" /><path d={v === 'line' ? 'M8 37H73' : 'M43 37H74'} strokeDasharray="3 3" /></>;
  else if (kind === 'scratch') drawing = <><rect x="19" y="14" width="42" height="32" rx="3" opacity=".35" /><path d={v === 'scribble' ? 'M13 38 30 13 53 47 65 20 30 45 48 12 64 42 16 22' : 'M11 25H68L12 31H68L12 37H68'} strokeWidth="2" /></>;
  else if (kind === 'width') drawing = <path d="M12 30H68" strokeWidth={Number(value) * .38} opacity=".55" />;
  else if (kind === 'hold') drawing = <><path d="m6 42 2-25 17 2-1 22Z" opacity=".45" /><path d="M31 30H46m-4-4 4 4-4 4" /><rect x="54" y="18" width="21" height="21" rx=".5" /><circle cx="40" cy="47" r="6" /><path d="M40 43V47L43 49" /></>;
  else if (kind === 'type') drawing = <>{page}<path d="M26 20H54M26 28H50M26 36H47" />{v === 'lecture' ? <path d="m10 13 12-6 12 6-12 6Zm5 3v7q7 5 14 0v-7" fill="var(--n-panel)" /> : <path d="m48 48 13-16 5 5-13 16-7 2Z" fill="var(--n-panel)" />}</>;
  else if (kind === 'pageNumber') drawing = <>{page}<rect x="19" y="5" width="42" height="50" rx="3" /><path d="M27 17H53M27 25H53M27 33H46" opacity=".4" /><text x="40" y="49" textAnchor="middle" fontSize="10" fill="currentColor" stroke="none">3</text></>;
  else if (kind === 'hover') drawing = <><rect x="10" y="15" width="17" height="28" rx="2" opacity=".5" /><rect x="35" y="6" width="34" height="48" rx="3" /><path d="M41 18H62M41 26H62M41 34H56" opacity=".5" /></>;
  else if (kind === 'zoom') drawing = <><rect x="6" y="7" width="68" height="46" rx="4" opacity=".5" /><path d="M14 20H64M14 30H37M14 40H51" strokeWidth="3" /><path d="M43 31H65m-4-4 4 4-4 4" /></>;
  else if (kind === 'lock') drawing = <><rect x="22" y="25" width="36" height="27" rx="4" /><path d="M29 25V18a11 11 0 0 1 22 0v7M40 36v7" /></>;
  else if (kind === 'favorite') drawing = <path d="m40 6 7 15 17 2-12 12 3 18-15-8-15 8 3-18-12-12 17-2Z" />;
  else if (kind === 'pull') drawing = <><rect x="23" y="4" width="34" height="30" rx="3" /><rect x="23" y="40" width="34" height="17" rx="3" strokeDasharray="3 3" /><path d="M40 14v14m-4-4 4 4 4-4M35 49H45M40 44v10" /></>;
  else if (kind === 'import') drawing = <><rect x="28" y="7" width="34" height="46" rx="3" /><path d="M9 30H42m-6-6 6 6-6 6M38 42H53" /></>;
  else drawing = <path d="M15 36q10-32 20-9t30-6" strokeWidth={v === 'brush' ? 5 : 2} />;
  return <svg className={s.settingDiagram} data-kind={kind} viewBox="0 0 80 60" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{drawing}</svg>;
}

export function SettingChoices<T extends string | number>({ label, kind, value, options, onChange, color }: {
  label: string; kind: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; color?: string;
}) {
  return <fieldset className={s.settingChoices}><legend>{label}</legend><div role="group" aria-label={label}>{options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}><SettingDiagram kind={kind} value={option.value} color={color} /><span>{option.label}</span><i aria-hidden="true" /></button>)}</div></fieldset>;
}
