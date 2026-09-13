/**
 * Calendar-day arithmetic in a named time zone, without a date library.
 *
 * The shop runs on Athens time and the database on UTC. "Expires 31 December" typed into a
 * date input used to become `new Date("2026-12-31")` — midnight UTC, which is 02:00 in
 * Athens — so the code stopped working the moment the last day began. These helpers turn a
 * calendar date into the instant the shop means by it.
 */

export const SHOP_TIME_ZONE = "Europe/Athens";

/** The zone's UTC offset at `at`, in milliseconds (positive east of Greenwich). */
export function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - at.getTime();
}

/** Midnight at the start of the calendar date `yyyy-mm-dd` in `timeZone`. */
export function startOfDayIn(dateIso: string, timeZone: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  // Midnight of that calendar date as if it were UTC, then shift by the zone's offset at
  // that moment. Two passes, because the offset itself can differ across a DST boundary.
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const firstGuess = new Date(midnightAsUtc - zoneOffsetMs(new Date(midnightAsUtc), timeZone));
  return new Date(midnightAsUtc - zoneOffsetMs(firstGuess, timeZone));
}

/** The last millisecond of the calendar date `yyyy-mm-dd` in `timeZone`. */
export function endOfDayIn(dateIso: string, timeZone: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextIso = nextDay.toISOString().slice(0, 10);
  return new Date(startOfDayIn(nextIso, timeZone).getTime() - 1);
}

/** Midnight at the start of today in `timeZone`. */
export function startOfTodayIn(timeZone: string): Date {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return startOfDayIn(today, timeZone);
}

/** The calendar date `yyyy-mm-dd` an instant falls on in `timeZone` — for round-tripping into a date input. */
export function calendarDateIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
