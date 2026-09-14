"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

// Share the free tool. Distribution is the fastest customer channel for these
// pages (Saudi students pass links around X / Telegram / WhatsApp groups), and
// each share is also a social signal + a potential backlink that speeds up SEO.
// Uses the native share sheet on mobile, falls back to copy-to-clipboard.

export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://havenstudent.com${path}`;

  const onShare = async () => {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text: title, url });
        return;
      } catch {
        // user dismissed or share failed — fall through to copy
      }
    }
    try {
      await nav?.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — nothing to do */
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-primary-soft)]"
      style={{ border: "1px solid var(--color-border)", color: "var(--color-ink)" }}
    >
      {copied ? <Check size={15} style={{ color: "var(--color-success)" }} /> : <Share2 size={15} />}
      {copied ? "تم نسخ الرابط" : "شارك"}
    </button>
  );
}
