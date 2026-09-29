// Renders the PWA / Play Store icon set from public/icons/icon.svg.
//
//   node scripts/gen-icons.mjs [--font path/to/IBMPlexSans-Bold.ttf]
//
// Without --font, whatever sans-serif the system has is used for the "BW"
// glyphs, so pass the real font when regenerating for a release. Replace
// icon.svg with real artwork (any 512x512 SVG) and re-run to refresh every size.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = resolve(root, "public/icons");
const storeDir = resolve(root, "android/store-assets");
mkdirSync(iconsDir, { recursive: true });
mkdirSync(storeDir, { recursive: true });

const fontArg = process.argv.indexOf("--font");
const fontFiles =
  fontArg > -1 && process.argv[fontArg + 1] ? [resolve(process.argv[fontArg + 1])] : [];
const font = { loadSystemFonts: true, fontFiles, defaultFontFamily: "IBM Plex Sans" };

const svg = readFileSync(resolve(iconsDir, "icon.svg"), "utf8");

// The maskable variant drops the rounded corners: Android masks the shape
// itself, and the art already sits inside the central 80% safe zone.
const maskableSvg = svg.replace(/rx="\d+"/, 'rx="0"');

function render(source, width, file) {
  const png = new Resvg(source, { fitTo: { mode: "width", value: width }, font }).render().asPng();
  writeFileSync(file, png);
  console.log(
    `${file.replace(root + "/", "")}  ${width}x${Math.round((width * heightOf(source)) / widthOf(source))}`,
  );
}
function widthOf(s) {
  return Number(/viewBox="0 0 (\d+) (\d+)"/.exec(s)?.[1] ?? 512);
}
function heightOf(s) {
  return Number(/viewBox="0 0 (\d+) (\d+)"/.exec(s)?.[2] ?? 512);
}

render(svg, 512, resolve(iconsDir, "icon-512.png"));
render(svg, 192, resolve(iconsDir, "icon-192.png"));
render(svg, 180, resolve(iconsDir, "apple-touch-icon-180.png"));
render(svg, 32, resolve(iconsDir, "favicon-32.png"));
render(maskableSvg, 512, resolve(iconsDir, "icon-512-maskable.png"));

// Play Store listing assets: 512x512 icon (no transparency) and the 1024x500 feature graphic.
render(maskableSvg, 512, resolve(storeDir, "icon-512.png"));

const feature = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500" width="1024" height="500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E6B57"/><stop offset="1" stop-color="#0A4E40"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <circle cx="900" cy="40" r="260" fill="#ffffff" fill-opacity="0.06"/>
  <circle cx="80" cy="480" r="200" fill="#ffffff" fill-opacity="0.05"/>
  <rect x="112" y="152" width="196" height="196" rx="56" fill="#ffffff"/>
  <text x="210" y="250" text-anchor="middle" dominant-baseline="central"
        font-family="'IBM Plex Sans', system-ui, sans-serif" font-weight="700" font-size="82"
        letter-spacing="-3" fill="#0E6B57">BW</text>
  <text x="352" y="222" dominant-baseline="central" font-family="'IBM Plex Sans', system-ui, sans-serif"
        font-weight="700" font-size="76" letter-spacing="-2" fill="#ffffff">BW Inventory</text>
  <text x="356" y="300" dominant-baseline="central" font-family="'IBM Plex Sans', system-ui, sans-serif"
        font-weight="500" font-size="34" fill="#ffffff" fill-opacity="0.78">Run your shop, simply</text>
</svg>`;
render(feature, 1024, resolve(storeDir, "feature-graphic-1024x500.png"));
