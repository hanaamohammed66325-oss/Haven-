"use client";

import { useEffect } from "react";
import { toEnglishDigits } from "@/lib/dates";

/**
 * Number fields take English digits only. Arabic keyboards type ٠-٩ and the
 * Arabic decimal mark (٫), which a number box reads as empty or as the wrong
 * value ("٢٥٫٥" → 255). Every number field in the app — type="number" or
 * inputMode numeric/decimal — has them rewritten as they are typed or pasted,
 * so the box shows English digits and every parser only ever sees 0-9 and ".".
 */
function isNumberField(el: EventTarget | null): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    (el.type === "number" || el.inputMode === "decimal" || el.inputMode === "numeric")
  );
}

// Insert through the browser's own editing so React sees an ordinary change
// (and undo still works); a text box without execCommand falls back to
// setRangeText. setRangeText skips React's value tracker, so the input event
// still reads as a change.
function insert(el: HTMLInputElement, text: string) {
  if (document.execCommand("insertText", false, text)) return;
  try {
    el.setRangeText(text, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } catch {
    // type="number" has no selection API; nothing more to do.
  }
}

const valueSetter = typeof window !== "undefined"
  ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  : undefined;

export default function EnglishDigits() {
  useEffect(() => {
    const onBeforeInput = (e: InputEvent) => {
      if (!isNumberField(e.target) || !e.data || e.isComposing) return;
      const fixed = toEnglishDigits(e.data);
      if (fixed === e.data) return;
      e.preventDefault();
      insert(e.target, fixed);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!isNumberField(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      const fixed = toEnglishDigits(text.trim());
      if (fixed === text) return;
      e.preventDefault();
      insert(e.target, fixed);
    };
    // Safety net for keyboards whose typing can't be cancelled (composition on
    // Android): fix the text box's value before React reads it. Runs on window
    // in the capture phase, ahead of React's own listener; the native setter
    // leaves React's tracker on the old value, so the change still registers.
    const onInput = (e: Event) => {
      const el = e.target;
      if (!isNumberField(el) || el.type === "number" || !valueSetter) return;
      const fixed = toEnglishDigits(el.value);
      if (fixed === el.value) return;
      const caret = el.selectionStart;
      valueSetter.call(el, fixed);
      if (caret !== null) el.setSelectionRange(caret, caret);
    };
    window.addEventListener("beforeinput", onBeforeInput, true);
    window.addEventListener("paste", onPaste, true);
    window.addEventListener("input", onInput, true);
    return () => {
      window.removeEventListener("beforeinput", onBeforeInput, true);
      window.removeEventListener("paste", onPaste, true);
      window.removeEventListener("input", onInput, true);
    };
  }, []);
  return null;
}
