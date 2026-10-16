import type { GroupSession } from "./session";

interface ActiveRoom { account: string; groupId: string; session: GroupSession }
let active: ActiveRoom | null = null;
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;
let roomVisible = false;
const emit = () => { for (const fn of listeners) fn(); };
export const activeRoomSnapshot = () => active;
export const activeRoomServerSnapshot = () => null;
export const subscribeActiveRoom = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function clearActiveRoom() {
  stop?.(); stop = null;
  const previous = active; active = null;
  previous?.session.dispose(); emit();
}
export function retainRoom(account: string, groupId: string, create: () => GroupSession) {
  if (active?.account === account && active.groupId === groupId && !active.session.view().ended) {
    roomVisible = true;
    active.session.setRoomVisible(true); return active.session;
  }
  clearActiveRoom();
  const session = create();
  active = { account, groupId, session };
  roomVisible = true;
  let hadSitting = !!session.view().state?.sitting;
  stop = session.subscribe(() => {
    const view = session.view();
    if (view.ended || (!roomVisible && hadSitting && view.state && !view.state.sitting)) { clearActiveRoom(); return; }
    if (view.state?.sitting) hadSitting = true;
    emit();
  });
  emit(); return session;
}
export function leaveRoomView(session: GroupSession) {
  if (active?.session !== session) return;
  roomVisible = false;
  if (!session.view().state?.sitting) clearActiveRoom();
  else { session.setRoomVisible(false); emit(); }
}
