import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { DATA_DIR } from '../../config.js';
import { buildImages, type GeneratedImage, type ImageInput } from './images.js';

export const IMAGE_DIR = path.join(DATA_DIR, "images");

export interface RenderedImage {
  kind: string;
  label: string;
  file: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}

function rasterize(svg: string, width: number, height: number): Buffer {
  const r = new Resvg(svg, {
    font: { loadSystemFonts: true, defaultFontFamily: "Microsoft YaHei" },
    fitTo: { mode: "width", value: width },
  });
  return r.render().asPng();
}

export function renderImage(img: GeneratedImage, date: string): RenderedImage {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const file = `${date}-${img.kind}.png`;
  const abs = path.join(IMAGE_DIR, file);
  const png = rasterize(img.svg, img.width, img.height);
  fs.writeFileSync(abs, png);
  return {
    kind: img.kind,
    label: img.label,
    file,
    url: `/images/${file}`,
    width: img.width,
    height: img.height,
    bytes: png.length,
  };
}

export function renderWechatImages(input: ImageInput, date: string): RenderedImage[] {
  return buildImages(input).map((img) => renderImage(img, date));
}