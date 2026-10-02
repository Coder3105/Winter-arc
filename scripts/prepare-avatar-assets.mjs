import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Pass generated originals as key=absolute-path pairs. Originals stay untouched.
const directory = path.resolve("public/images/avatars");
await mkdir(directory, { recursive: true });
for (const pair of process.argv.slice(2)) {
  const separator = pair.indexOf("=");
  const key = pair.slice(0, separator);
  const source = pair.slice(separator + 1);
  if (separator < 1 || !/^[a-z]+(?:-[a-z]+)*$/.test(key)) {
    throw new Error("Expected controlled key=source-path arguments.");
  }
  const target = path.join(directory, `${key}.webp`);
  await sharp(source)
    .resize(512, 512, { fit: "cover" })
    .webp({ quality: 84 })
    .toFile(target);
  console.log(
    JSON.stringify({
      asset: key,
      size: (await stat(target)).size,
      dimensions: "512x512",
    }),
  );
}
await sharp("public/icons/system-mark.svg")
  .resize(512, 512)
  .webp({ quality: 90 })
  .toFile(path.join(directory, "system-default.webp"));
