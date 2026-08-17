/**
 * Deliberately no custom User-Agent / headers: Bun's default fetch fingerprint passes every
 * source we use (ESPN, Yahoo Finance, TheSportsDB, CNBC RSS) — a spoofed browser UA without a
 * matching full browser fingerprint actually trips Akamai's bot detection on ESPN (403).
 */
export async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  return res.text();
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function toYyyyMmDd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
