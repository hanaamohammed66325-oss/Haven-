// scripts/stamp-sw.mjs
//
// Rewrites the __BUILD_ID__ placeholder in the exported service worker with a
// value that is UNIQUE PER BUILD.
//
// Why this exists: a browser installs a new service worker only when sw.js's
// bytes differ from the copy it already has. With a hand-edited constant the
// bytes never changed, so the worker never updated, its caches were never
// purged, and every user stayed pinned to the first build they ever loaded —
// stale UI forever, even though the cloud data was correct.
//
// Runs after `next build` (see package.json) and patches out/sw.js, the file
// Netlify actually serves.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SW_PATH = "out/sw.js";
const PLACEHOLDER = "__BUILD_ID__";

// Netlify exposes COMMIT_REF; fall back to a timestamp for local builds.
const buildId = (
  process.env.COMMIT_REF ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  Date.now().toString(36)
)
  .slice(0, 12)
  .replace(/[^a-zA-Z0-9]/g, "");

if (!existsSync(SW_PATH)) {
  console.error(`stamp-sw: ${SW_PATH} not found — did next build run?`);
  process.exit(1);
}

const source = readFileSync(SW_PATH, "utf8");
if (!source.includes(PLACEHOLDER)) {
  console.error(
    `stamp-sw: ${PLACEHOLDER} not found in ${SW_PATH}. ` +
      `The service worker would never update — failing the build.`
  );
  process.exit(1);
}

writeFileSync(SW_PATH, source.replaceAll(PLACEHOLDER, buildId));
console.log(`stamp-sw: ${SW_PATH} stamped with build id "${buildId}"`);
