// Publish new icon URLs without changing existing installations' asset bytes.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function versionIcons() {
  const manifestPath = join(ROOT, "public/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const urls = {};
  const version = (url) => {
    const original = url.split("?")[0].replace(/\.[a-f0-9]{12}(?=\.[^.]+$)/, "");
    if (urls[original]) return urls[original];
    const bytes = readFileSync(join(ROOT, "public", original));
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const target = original.replace(/(\.[^.]+)$/, `.${hash}$1`);
    writeFileSync(join(ROOT, "public", target), bytes);
    urls[original] = target;
    return target;
  };
  for (const icon of manifest.icons) icon.src = version(icon.src);
  for (const shortcut of manifest.shortcuts ?? []) {
    for (const icon of shortcut.icons ?? []) icon.src = version(icon.src);
  }
  const metadata = {
    favicon: version("/icons/favicon-32.png"),
    icon: version("/icons/icon-192.png"),
    apple: version("/icons/apple-touch-icon.png"),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(ROOT, "src/lib/appIcons.json"), JSON.stringify(metadata, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) versionIcons();
