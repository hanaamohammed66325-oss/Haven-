// The solo timer lives only on its mounted page. A module-scoped marker is
// deliberately tab-local; two separate devices remain allowed by product policy.
let active = false;
export const soloStudyActive = () => active;
export function setSoloStudyActive(value: boolean): void { active = value; }
