// An invite as the student pastes it: the whole link, a message that contains
// the link, or the bare token. Only the token is taken; the app always opens
// its own /join page with it, never the pasted host.
const TOKEN = /^[0-9a-f]{32}$/i;
const IN_LINK = /\/join\/?\?(?:[^\s#]*&)?t=([0-9a-f]{32})(?![0-9a-f])/i;

export function inviteTokenFrom(text: string): string | null {
  const value = text.trim();
  if (TOKEN.test(value)) return value.toLowerCase();
  const match = IN_LINK.exec(value);
  return match ? match[1].toLowerCase() : null;
}

export function joinPath(token: string): string {
  return `/join/?t=${token}`;
}
