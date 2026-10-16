let leases = 0;
let previousOverflow = "";

/** Dialogs, tours and full-screen scenes share the same scroll lease. Cleanup
 * order can differ from opening order, especially during route unmounts. */
export function acquireBodyScrollLock(): () => void {
  if (typeof document === "undefined") return () => {};
  if (leases === 0) previousOverflow = document.body.style.overflow;
  leases += 1;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    leases -= 1;
    if (leases === 0) document.body.style.overflow = previousOverflow;
  };
}
