/**
 * merge-mip-build.mjs
 *
 * Merges MIP's build output (dist_mip/) into the DVC build output (dist/)
 * so both apps can be deployed from a single Vercel outputDirectory.
 *
 * MIP assets go to dist/assets/mip-* (unique prefix, no collision with DVC).
 * MIP's index.html goes to dist/mip.html (accessible at /mip.html).
 * All other MIP static files (logo.svg, manifest.webmanifest) go to dist/.
 */

import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const MIP_SRC = join(import.meta.dirname, "..", "dist_mip");
const DIST = join(import.meta.dirname, "..", "dist");

if (!existsSync(MIP_SRC)) {
  console.error("Error: dist_mip/ not found. Run MIP build first.");
  process.exit(1);
}

if (!existsSync(DIST)) {
  console.error("Error: dist/ not found. Run DVC build first.");
  process.exit(1);
}

// 1. Copy MIP assets (dist_mip/assets/mip-*) → dist/assets/mip-*
//    These have unique "mip-" prefix so no collision with DVC assets.
const mipAssetsSrc = join(MIP_SRC, "assets");
const distAssets = join(DIST, "assets");
if (existsSync(mipAssetsSrc)) {
  mkdirSync(distAssets, { recursive: true });
  cpSync(mipAssetsSrc, distAssets, { recursive: true });
  console.log("✓ Copied MIP assets → dist/assets/mip-*");
}

// 2. Copy MIP's index.html → dist/mip.html
//    When user visits /mip.html, Vercel serves this file.
//    HashRouter handles all client-side routing from there.
const mipIndex = join(MIP_SRC, "index.html");
if (existsSync(mipIndex)) {
  const html = readFileSync(mipIndex, "utf-8");
  // Rewrite asset paths from /assets/mip-* to /assets/mip-*
  // (already correct since base: '/'), but ensure they stay absolute.
  writeFileSync(join(DIST, "mip.html"), html);
  console.log("✓ Copied MIP index.html → dist/mip.html");
}

// 3. Copy other MIP static files (logo.svg, manifest.webmanifest, etc.)
//    Only copy if they don't already exist in dist/ (DVC's versions take priority).
for (const file of ["logo.svg", "manifest.webmanifest"]) {
  const src = join(MIP_SRC, file);
  const dst = join(DIST, file);
  if (existsSync(src) && !existsSync(dst)) {
    cpSync(src, dst);
    console.log(`✓ Copied MIP ${file} → dist/${file}`);
  }
}

console.log("✓ MIP build merged into dist/");
