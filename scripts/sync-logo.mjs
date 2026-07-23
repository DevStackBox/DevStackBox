import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const logoSrc = path.join(root, "docs", "images", "logo");
const publicDest = path.join(root, "public");

const FILES = [
  { src: "logo.svg", dest: "logo.svg" },
  { src: "logo-dark.svg", dest: "logo-dark.svg" },
  { src: "favicon.ico", dest: "favicon.ico" },
];

if (!fs.existsSync(logoSrc)) {
  console.warn("Logo folder not found at:", logoSrc);
  process.exit(0);
}

fs.mkdirSync(publicDest, { recursive: true });

for (const { src, dest } of FILES) {
  const from = path.join(logoSrc, src);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, path.join(publicDest, dest));
  }
}

console.log("Synced docs/images/logo → public/");
