import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120">`
  `<rect width="420" height="120" fill="#f5f1e9"/>`
  `<text x="16" y="50" font-family="Microsoft YaHei" font-size="30" fill="#17130e">中文测试 我的窗口</text>`
  `<text x="16" y="92" font-family="Georgia" font-size="26" fill="#b0341f">Georgia 0123456789</text>`
  `</svg>`
].join("");

const r = new Resvg(svg, {
  font: { loadSystemFonts: true, defaultFontFamily: "Microsoft YaHei" },
});
const png = r.render().asPng();
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/_fonttest.png", png);
console.log("PNG bytes =", png.length);
