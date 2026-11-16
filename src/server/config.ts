import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, "..", "..");
export const DATA_DIR = path.join(ROOT, "data");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");
export const WEB_DIST = path.join(ROOT, "dist", "web");

export const API_PORT = Number(process.env.PORT ?? 4399);
export const API_HOST = process.env.HOST ?? "0.0.0.0";

export const TIMEZONE = "Asia/Shanghai";

export const SECTIONS = ["books", "ai-tools", "markets", "world"] as const;