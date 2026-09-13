import { describe, expect, it } from "vitest";
import { calendarDateIn, endOfDayIn, startOfDayIn } from "@/lib/dates";

describe("calendar days in Europe/Athens", () => {
  it("ends 31 December at 23:59:59.999 Athens time (UTC+2 in winter)", () => {
    expect(endOfDayIn("2026-12-31", "Europe/Athens").toISOString()).toBe("2026-12-31T21:59:59.999Z");
  });

  it("ends a summer day at UTC+3", () => {
    expect(endOfDayIn("2026-08-01", "Europe/Athens").toISOString()).toBe("2026-08-01T20:59:59.999Z");
  });

  it("starts a day at local midnight, across the DST change", () => {
    // Clocks go forward on the last Sunday of March 2026 (29th).
    expect(startOfDayIn("2026-03-29", "Europe/Athens").toISOString()).toBe("2026-03-28T22:00:00.000Z");
    expect(startOfDayIn("2026-03-30", "Europe/Athens").toISOString()).toBe("2026-03-29T21:00:00.000Z");
  });

  it("round-trips an expiry instant back to the date the admin chose", () => {
    expect(calendarDateIn(endOfDayIn("2026-12-31", "Europe/Athens"), "Europe/Athens")).toBe("2026-12-31");
  });
});
