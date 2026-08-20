import type { ReactNode } from "react";

// ============================================================================
// Contact channels — SINGLE SOURCE OF TRUTH for the support links, read by
// the landing page footer/social strip, the /contact page, and Settings →
// Contact us, so all three stay in sync from one place.
//
// Email and Instagram are live. WhatsApp is temporarily disabled (filtered
// out of `contactChannels` below) until there's a confirmed number.
// ============================================================================

export const SUPPORT_EMAIL = "support@havenstudent.com";
// WhatsApp is temporarily disabled (no confirmed number yet) — see the filter
// below. The definition stays intact so it's trivial to bring back: set a
// real URL here and remove the `.filter(...)` line further down.
const WHATSAPP_URL = "#"; // TODO: set the real WhatsApp link, then re-enable below
export const INSTAGRAM_URL = "https://instagram.com/havenstudent2026";

export interface ContactChannel {
  label: string;
  href: string;
  svg: ReactNode;
}

// Same channels/icons used on the landing footer, /contact page, and Settings.
const ALL_CHANNELS: ContactChannel[] = [
  {
    label: "WhatsApp",
    href: WHATSAPP_URL,
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.8c2.16 0 4.19.84 5.72 2.37a8.06 8.06 0 0 1 2.37 5.73c0 4.47-3.64 8.11-8.12 8.11a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.12.82.83-3.04-.19-.31a8.05 8.05 0 0 1-1.24-4.31c0-4.47 3.64-8.11 8.11-8.11zm4.67 10.35c-.25-.13-1.49-.73-1.72-.82-.23-.08-.4-.13-.56.13-.17.25-.64.82-.79.99-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.66-1.25-1.48-1.4-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.38-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.09s.9 2.42 1.03 2.59c.13.17 1.77 2.71 4.3 3.8.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.49-.61 1.7-1.2.21-.59.21-1.09.15-1.2-.06-.11-.23-.17-.48-.29z" />
      </svg>
    ),
  },
  {
    label: "Email",
    href: `mailto:${SUPPORT_EMAIL}`,
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
        <path d="M3 6.5l9 6 9-6" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: INSTAGRAM_URL,
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

// WhatsApp temporarily excluded — TODO: drop this filter once WHATSAPP_URL
// above is a real link, so it reappears everywhere contactChannels is used.
export const contactChannels: ContactChannel[] = ALL_CHANNELS.filter((c) => c.label !== "WhatsApp");
