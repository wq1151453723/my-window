import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const DSH_CREDENTIALS = "E:\\dsh-home\\.credentials.yaml";
const LOCAL_ENV = path.join(ROOT, ".env.local");

function stripQuotes(v: string): string {
  return v.trim().replace(/^["']|["']$/g, "");
}

function parseKeyValueYaml(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let inRefs = false;
  for (const raw of lines) {
    if (/^refs\s*:\s*$/.test(raw)) {
      inRefs = true;
      continue;
    }
    if (inRefs) {
      if (/^\S/.test(raw)) {
        inRefs = false;
      } else {
        const m = /^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(raw);
        if (m) out[m[1]] = stripQuotes(m[2]);
        continue;
      }
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(raw);
    if (m) out[m[1]] = stripQuotes(m[2]);
  }
  return out;
}

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    out[line.slice(0, idx).trim()] = stripQuotes(line.slice(idx + 1));
  }
  return out;
}

let cache: Record<string, string> | null = null;

function loadAll(): Record<string, string> {
  if (cache) return cache;
  const merged: Record<string, string> = {};
  try {
    if (fs.existsSync(LOCAL_ENV)) Object.assign(merged, parseEnvFile(fs.readFileSync(LOCAL_ENV, "utf8")));
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(DSH_CREDENTIALS))
      Object.assign(merged, parseKeyValueYaml(fs.readFileSync(DSH_CREDENTIALS, "utf8")));
  } catch {
    /* ignore */
  }
  for (const [k, v] of Object.entries(process.env)) if (v) merged[k] = v;
  cache = merged;
  return merged;
}

export function readSecret(name: string): string | undefined {
  const v = loadAll()[name];
  return v && v.length > 0 ? v : undefined;
}

export function secretStatus(names: string[]): Record<string, boolean> {
  const all = loadAll();
  return Object.fromEntries(names.map((n) => [n, Boolean(all[n])]));
}

export function maskSecret(v: string | undefined): string {
  if (!v) return "(missing)";
  return v.length <= 8 ? "***" : v.slice(0, 3) + "***" + v.slice(-2);
}

export function secretFingerprint(name: string): string {
  const v = readSecret(name);
  if (!v) return "(missing)";
  return `${name}: len=${v.length} head=${v.slice(0, 2)}`;
}