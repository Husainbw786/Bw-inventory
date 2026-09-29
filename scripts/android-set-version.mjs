// Sets the Android version in android/twa-manifest.json.
//
//   node scripts/android-set-version.mjs --code 42 [--name 1.2.0]
//
// Play requires a strictly increasing versionCode per upload; CI passes the
// workflow run number. `--name` is the human-readable version shown in Play.
// Bubblewrap's own version bump is skipped in CI (`update --skipVersionUpgrade`)
// because it prompts interactively, so this script is the only writer.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../android/twa-manifest.json");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};

const code = flag("code");
const name = flag("name");
if (!code && !name) {
  console.error("usage: node scripts/android-set-version.mjs --code <int> [--name <x.y.z>]");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(file, "utf8"));
if (code !== undefined) {
  const n = Number(code);
  if (!Number.isInteger(n) || n < 1 || n > 2100000000) {
    console.error(`--code must be a positive integer below 2100000000, got "${code}"`);
    process.exit(2);
  }
  manifest.appVersionCode = n;
}
if (name !== undefined) {
  if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.]+)?$/.test(name)) {
    console.error(`--name must look like 1.2.3, got "${name}"`);
    process.exit(2);
  }
  manifest.appVersion = name;
}

writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `android/twa-manifest.json: appVersion=${manifest.appVersion} appVersionCode=${manifest.appVersionCode}`,
);
