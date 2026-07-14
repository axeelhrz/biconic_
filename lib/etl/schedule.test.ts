import { describe, expect, it } from "vitest";
import {
  computeNextCalendarRunAt,
  formatCalendarScheduleLabel,
  isCalendarScheduleDue,
  isScheduleDue,
  normalizeRunAtTime,
  normalizeScheduleInput,
  normalizeWeekdays,
  parseRunAtTime,
  validateScheduleInput,
  zonedTimeToUtc,
  SCHEDULE_DISPLAY_TIMEZONE,
} from "@/lib/etl/schedule";

describe("schedule calendar", () => {
  it("parses and normalizes runAtTime", () => {
    expect(parseRunAtTime("9:05")).toEqual({ hour: 9, minute: 5 });
    expect(normalizeRunAtTime("9:05")).toBe("09:05");
    expect(parseRunAtTime("25:00")).toBeNull();
  });

  it("normalizes weekdays with Sunday last in sort order", () => {
    expect(normalizeWeekdays([0, 1, 1, 9])).toEqual([1, 0]);
  });

  it("validates calendar schedule input", () => {
    expect(
      validateScheduleInput({ frequency: "daily", runAtTime: "09:00" })
    ).toBeNull();
    expect(
      validateScheduleInput({ frequency: "weekly", runAtTime: "11:00", runOnWeekdays: [] })
    ).toMatch(/día/);
    expect(
      validateScheduleInput({ frequency: "weekly", runAtTime: "11:00", runOnWeekdays: [1] })
    ).toBeNull();
  });

  it("normalizes schedule input", () => {
    expect(
      normalizeScheduleInput({ frequency: "daily", runAtTime: "9:00" })
    ).toEqual({ frequency: "daily", runAtTime: "09:00" });
    expect(
      normalizeScheduleInput({ frequency: "weekly", runAtTime: "11:00", runOnWeekdays: [1, 3] })
    ).toEqual({
      frequency: "weekly",
      runAtTime: "11:00",
      runOnWeekdays: [1, 3],
    });
    expect(normalizeScheduleInput({ frequency: "1h" })).toEqual({ frequency: "1h" });
  });

  it("formats calendar labels", () => {
    expect(
      formatCalendarScheduleLabel({ frequency: "daily", runAtTime: "09:00" })
    ).toBe("Todos los días a las 09:00");
    expect(
      formatCalendarScheduleLabel({
        frequency: "weekly",
        runAtTime: "11:00",
        runOnWeekdays: [1],
      })
    ).toBe("Lun a las 11:00");
  });

  it("is due for daily schedule after run time without same-day last run", () => {
    const schedule = { frequency: "daily", runAtTime: "09:00" };
    const now = zonedTimeToUtc(2026, 7, 14, 9, 30, SCHEDULE_DISPLAY_TIMEZONE);
    expect(isCalendarScheduleDue(schedule, now)).toBe(true);
    expect(
      isCalendarScheduleDue(
        { ...schedule, lastRunAt: zonedTimeToUtc(2026, 7, 14, 9, 5, SCHEDULE_DISPLAY_TIMEZONE).toISOString() },
        now
      )
    ).toBe(false);
    const before = zonedTimeToUtc(2026, 7, 14, 8, 59, SCHEDULE_DISPLAY_TIMEZONE);
    expect(isCalendarScheduleDue(schedule, before)).toBe(false);
  });

  it("is due for weekly schedule only on selected weekdays", () => {
    const schedule = { frequency: "weekly", runAtTime: "11:00", runOnWeekdays: [1] };
    const monday = zonedTimeToUtc(2026, 7, 13, 11, 5, SCHEDULE_DISPLAY_TIMEZONE);
    const tuesday = zonedTimeToUtc(2026, 7, 14, 11, 5, SCHEDULE_DISPLAY_TIMEZONE);
    expect(isCalendarScheduleDue(schedule, monday)).toBe(true);
    expect(isCalendarScheduleDue(schedule, tuesday)).toBe(false);
  });

  it("isScheduleDue delegates to interval schedules", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(isScheduleDue({ frequency: "1h", lastRunAt: twoHoursAgo })).toBe(true);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(isScheduleDue({ frequency: "1h", lastRunAt: thirtyMinAgo })).toBe(false);
  });

  it("computes next calendar run after reference time", () => {
    const schedule = { frequency: "daily", runAtTime: "09:00" };
    const from = zonedTimeToUtc(2026, 7, 14, 10, 0, SCHEDULE_DISPLAY_TIMEZONE);
    const next = computeNextCalendarRunAt(schedule, from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });
});
