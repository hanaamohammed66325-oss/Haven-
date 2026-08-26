import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ICONS_DIR = join(ROOT, "public/icons");
const LOGO_SRC = join(ROOT, "public/logo-512.png");

const BG_COLOR = { r: 248, g: 240, b: 234, alpha: 1 };

const REGULAR_SIZES = [72, 96, 128, 152, 167, 180, 192, 256, 384, 512];

async function generateRegularIcon(size) {
  const logo = await sharp(LOGO_SRC)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG_COLOR },
  })
    .composite([{ input: logo, blend: "over" }])
    .png()
    .toFile(join(ICONS_DIR, `icon-${size}.png`));

  console.log(`  icon-${size}.png`);
}

async function generateMaskableIcon() {
  const SIZE = 512;
  const SAFE = Math.round(SIZE * 0.75);
  const OFFSET = Math.round((SIZE - SAFE) / 2);

  const logo = await sharp(LOGO_SRC)
    .resize(SAFE, SAFE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: BG_COLOR },
  })
    .composite([{ input: logo, top: OFFSET, left: OFFSET }])
    .png()
    .toFile(join(ICONS_DIR, "icon-maskable-512.png"));

  console.log("  icon-maskable-512.png");
}

async function generateAppleTouchIcon() {
  const SIZE = 180;
  const logo = await sharp(LOGO_SRC)
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: BG_COLOR },
  })
    .composite([{ input: logo, blend: "over" }])
    .png()
    .toFile(join(ICONS_DIR, "apple-touch-icon.png"));

  console.log("  apple-touch-icon.png");
}

async function generateFavicons() {
  for (const size of [16, 32]) {
    const logo = await sharp(LOGO_SRC)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: { width: size, height: size, channels: 4, background: BG_COLOR },
    })
      .composite([{ input: logo, blend: "over" }])
      .png()
      .toFile(join(ICONS_DIR, `favicon-${size}.png`));

    console.log(`  favicon-${size}.png`);
  }
}

async function updateFaviconSvg() {
  const icon32 = await sharp(join(ICONS_DIR, "favicon-32.png"))
    .resize(256, 256)
    .png()
    .toBuffer();
  const b64 = icon32.toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><image href="data:image/png;base64,${b64}" width="256" height="256"/></svg>`;
  const { writeFileSync } = await import("fs");
  writeFileSync(join(ROOT, "public/favicon.svg"), svg);
  console.log("  favicon.svg");
}

async function main() {
  console.log("Generating regular icons...");
  for (const size of REGULAR_SIZES) {
    await generateRegularIcon(size);
  }

  console.log("Generating maskable icon...");
  await generateMaskableIcon();

  console.log("Generating Apple touch icon...");
  await generateAppleTouchIcon();

  console.log("Generating favicons...");
  await generateFavicons();

  console.log("Updating favicon.svg...");
  await updateFaviconSvg();

  console.log("Done! All icons regenerated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
