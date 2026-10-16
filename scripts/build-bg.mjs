// 把 image/background.png 縮成 1080x310 JPEG 並轉成 base64，內嵌進 SVG
// (SVG 放在 README 的 <img> 內無法載入外部圖片，所以必須內嵌)
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const buf = await sharp("image/background.png")
  .resize(1080, 310, { fit: "cover", position: "attention" })
  .jpeg({ quality: 72, mozjpeg: true })
  .toBuffer();
writeFileSync(
  "src/bg.generated.js",
  `export const BG_DATA_URI = "data:image/jpeg;base64,${buf.toString("base64")}";\n`
);
console.log(`background: ${(buf.length / 1024).toFixed(0)} KB`);
