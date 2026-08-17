import { fetchText, DAY_MS } from "../lib/http";

export type CalEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string;
};

export function getIcsUrl(): string | undefined {
  return process.env.CALENDAR_ICS_URL || undefined;
}

function unfold(ics: string): string[] {
  const rawLines = ics.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Parses "20260817T090000Z" / "20260817T090000" (floating/local) / "20260817" (all-day). */
function parseIcsDate(value: string): { date: Date; allDay: boolean } {
  const isAllDay = !value.includes("T");
  const utc = value.endsWith("Z");
  const digits = value.replace("Z", "");

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  const hour = isAllDay ? 0 : Number(digits.slice(9, 11));
  const minute = isAllDay ? 0 : Number(digits.slice(11, 13));
  const second = isAllDay ? 0 : Number(digits.slice(13, 15));

  const date = utc
    ? new Date(Date.UTC(year, month, day, hour, minute, second))
    : new Date(year, month, day, hour, minute, second);

  return { date, allDay: isAllDay };
}

function parseProp(line: string): { name: string; params: Record<string, string>; value: string } {
  const colonIdx = line.indexOf(":");
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const [k, v] = part.split("=");
    if (k && v) params[k] = v;
  }
  return { name: name ?? "", params, value };
}

function parseRRule(value: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const pair of value.split(";")) {
    const [k, v] = pair.split("=");
    if (k && v) parts[k] = v;
  }
  return parts;
}

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Expands a recurring VEVENT into concrete occurrences that fall inside [windowStart, windowEnd]. */
function expandRecurrence(
  base: CalEvent,
  rrule: Record<string, string>,
  windowStart: Date,
  windowEnd: Date,
): CalEvent[] {
  const freq = rrule.FREQ;
  const interval = Number(rrule.INTERVAL ?? "1") || 1;
  const count = rrule.COUNT ? Number(rrule.COUNT) : undefined;
  const until = rrule.UNTIL ? parseIcsDate(rrule.UNTIL).date : undefined;
  const duration = base.end.getTime() - base.start.getTime();
  const byDay = rrule.BYDAY?.split(",").map((d) => d.trim());

  const occurrences: CalEvent[] = [];
  let cursor = new Date(base.start);
  let iterations = 0;
  let produced = 0;

  const MAX_ITERATIONS = 2000;
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    if (count !== undefined && produced >= count) break;
    if (until && cursor > until) break;
    if (cursor > windowEnd) break;

    const matchesDay =
      freq !== "WEEKLY" || !byDay || byDay.includes(WEEKDAY_CODES[cursor.getDay()]!);

    if (matchesDay) {
      produced++;
      if (cursor >= windowStart && cursor <= windowEnd) {
        const start = new Date(cursor);
        occurrences.push({ ...base, start, end: new Date(start.getTime() + duration) });
      }
    }

    if (freq === "DAILY") {
      cursor = new Date(cursor.getTime() + interval * DAY_MS);
    } else if (freq === "WEEKLY") {
      cursor = new Date(cursor.getTime() + DAY_MS);
      if (!byDay) cursor = new Date(cursor.getTime() + (interval - 1) * 7 * DAY_MS);
    } else if (freq === "MONTHLY") {
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + interval);
      cursor = next;
    } else {
      break;
    }
  }

  return occurrences;
}

function parseIcs(ics: string, windowStart: Date, windowEnd: Date): CalEvent[] {
  const lines = unfold(ics);
  const events: CalEvent[] = [];
  let cur: Record<string, string> | null = null;
  let curParams: Record<string, Record<string, string>> = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      curParams = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.DTSTART) {
        const { date: start, allDay } = parseIcsDate(cur.DTSTART);
        const end = cur.DTEND ? parseIcsDate(cur.DTEND).date : new Date(start.getTime() + 60 * 60 * 1000);
        const base: CalEvent = {
          title: cur.SUMMARY ?? "(no title)",
          start,
          end,
          allDay,
          location: cur.LOCATION ?? "",
        };

        if (cur.RRULE) {
          events.push(...expandRecurrence(base, parseRRule(cur.RRULE), windowStart, windowEnd));
        } else if (base.start <= windowEnd && base.end >= windowStart) {
          events.push(base);
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const { name, value } = parseProp(line);
    if (name === "SUMMARY" || name === "LOCATION" || name === "DTSTART" || name === "DTEND" || name === "RRULE") {
      cur[name] = value;
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Upcoming events in [now, now + days] from the user's iCal feed (CALENDAR_ICS_URL env var). */
export async function fetchUpcomingEvents(days = 14): Promise<CalEvent[]> {
  const url = getIcsUrl();
  if (!url) return [];

  const now = new Date();
  const windowEnd = new Date(now.getTime() + days * DAY_MS);
  const ics = await fetchText(url);
  return parseIcs(ics, now, windowEnd);
}
