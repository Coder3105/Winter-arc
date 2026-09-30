import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "public", "icons", "system-mark.svg");
const target = path.join(root, "public", "icons");
const svg = await fs.readFile(source);

async function png(name, size, options = {}) {
  const density = Math.max(96, Math.ceil((size / 512) * 384));
  let pipeline = sharp(svg, { density }).resize(size, size);
  if (options.flatten) pipeline = pipeline.flatten({ background: "#03070c" });
  await pipeline.png().toFile(path.join(target, name));
}

await Promise.all([
  png("icon-192.png", 192, { flatten: true }),
  png("icon-512.png", 512, { flatten: true }),
  png("apple-touch-icon.png", 180, { flatten: true }),
  png("badge-96.png", 96),
]);

const maskableMark = await sharp(svg, { density: 384 }).resize(328, 328).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#03070c" },
})
  .composite([{ input: maskableMark, left: 92, top: 92 }])
  .png()
  .toFile(path.join(target, "icon-maskable-512.png"));

const faviconPng = await sharp(svg, { density: 384 })
  .resize(32, 32)
  .flatten({ background: "#03070c" })
  .png()
  .toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6);
header.writeUInt8(32, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(faviconPng.length, 14);
header.writeUInt32LE(22, 18);
await fs.writeFile(
  path.join(root, "public", "favicon.ico"),
  Buffer.concat([header, faviconPng]),
);
