"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useT } from "@/i18n";
import { parseBounded, type RangeError } from "@/lib/grades";

/**
 * The ONE numeric field used everywhere a score or a percentage is entered.
 *
 * Behaviour (see `parseBounded` for the rule itself):
 *  - `min`/`max` are set on the element so the browser helps too
 *  - typing above `max` (or below 0) shows a red border + inline message and
 *    the value is NOT saved
 *  - on blur an out-of-range value snaps back into range and is saved
 *  - empty stays empty — it means "not graded yet" and never becomes 0
 *  - decimals work (18.5 out of 20)
 */
export function BoundedNumberInput({
  value,
  max,
  onCommit,
  className,
  style,
  placeholder = "—",
  ariaLabel,
  align = "center",
}: {
  value: number | null;
  /** upper bound — an item's full mark, or 100 for a percentage. Omit when the
   *  field has no meaningful ceiling; negatives are still rejected. */
  max?: number;
  /** called only with values that are safe to save */
  onCommit: (v: number | null) => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
  align?: "center" | "start";
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [error, setError] = useState<RangeError>(null);

  /* Follow external changes (store updates, switching item) — but never clobber
     what's being typed when it already means the same number, so a trailing
     "18." isn't rewritten to "18" mid-keystroke. */
  useEffect(() => {
    setDraft((d) => {
      const cur = d.trim() === "" ? null : Number(d);
      if (cur === value) return d;
      if (cur == null && value == null) return d;
      return value == null ? "" : String(value);
    });
  }, [value]);

  const handleChange = (raw: string) => {
    setDraft(raw);
    const parsed = parseBounded(raw, max);
    setError(parsed.error);
    if (!parsed.error) onCommit(parsed.value); // only ever save valid values
  };

  const handleBlur = () => {
    const parsed = parseBounded(draft, max);
    if (!parsed.error) return;
    // clamp back into range rather than leaving an invalid number on screen
    setDraft(parsed.clamped == null ? "" : String(parsed.clamped));
    setError(null);
    onCommit(parsed.clamped);
  };

  return (
    <span className={`inline-flex flex-col ${align === "center" ? "items-center" : "items-stretch"}`}>
      <input
        type="number"
        min={0}
        max={max ?? undefined}
        step="any"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className={className}
        style={error ? { ...style, borderColor: "var(--color-danger)" } : style}
      />
      {error && (
        <span
          className="text-[10px] leading-tight mt-0.5 whitespace-nowrap"
          style={{ color: "var(--color-danger)" }}
        >
          {/* "max" can only be raised when a ceiling was supplied. */}
          {error === "max" && max != null ? t("scoreMax", { max }) : t("scoreMin")}
        </span>
      )}
    </span>
  );
}
