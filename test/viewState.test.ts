import { describe, expect, test } from "bun:test";
import {
  MODEL_END_DAY,
  MODEL_END_ISO,
  MODEL_START_DAY,
  MODEL_START_ISO,
  clampDayOffset,
  cycleFocus,
  dayOffsetFromIso,
  isoDateFromDayOffset,
  parseViewState,
  viewStateToSearch,
} from "../src/state/viewState";

describe("calendar dates", () => {
  test("round trips a date through the day offset", () => {
    const day = dayOffsetFromIso("2026-11-12");
    expect(day).not.toBeNull();
    expect(isoDateFromDayOffset(day!)).toBe("2026-11-12");
  });

  test("accepts a leap day and rejects a missing one", () => {
    expect(dayOffsetFromIso("2024-02-29")).not.toBeNull();
    expect(dayOffsetFromIso("2026-02-29")).toBeNull();
  });

  test("rejects malformed and impossible dates", () => {
    expect(dayOffsetFromIso("2026-2-1")).toBeNull();
    expect(dayOffsetFromIso("2026-02-30")).toBeNull();
    expect(dayOffsetFromIso("2026-13-01")).toBeNull();
    expect(dayOffsetFromIso("not-a-date")).toBeNull();
  });

  test("clamps offsets to the JPL model window", () => {
    expect(clampDayOffset(MODEL_START_DAY - 10)).toBe(MODEL_START_DAY);
    expect(clampDayOffset(MODEL_END_DAY + 10)).toBe(MODEL_END_DAY);
    expect(clampDayOffset(Number.NaN)).toBe(MODEL_START_DAY);
    expect(isoDateFromDayOffset(MODEL_START_DAY)).toBe(MODEL_START_ISO);
    expect(isoDateFromDayOffset(MODEL_END_DAY)).toBe(MODEL_END_ISO);
  });
});

describe("shared view state", () => {
  test("reads a date and planet from the query string", () => {
    expect(parseViewState("?date=1969-07-20&focus=jupiter")).toEqual({
      date: "1969-07-20",
      focus: "jupiter",
    });
  });

  test("accepts the Sun as a focus", () => {
    expect(parseViewState("?focus=sun").focus).toBe("sun");
  });

  test("ignores an unknown focus and a malformed date", () => {
    expect(parseViewState("?date=nope&focus=pluto")).toEqual({
      date: null,
      focus: null,
    });
  });

  test("clamps a date outside the model window", () => {
    expect(parseViewState("?date=1700-01-01").date).toBe(MODEL_START_ISO);
    expect(parseViewState("?date=2100-01-01").date).toBe(MODEL_END_ISO);
  });

  test("round trips through a query string", () => {
    const state = { date: "2026-11-12", focus: "earth" };
    expect(parseViewState(viewStateToSearch(state))).toEqual(state);
  });

  test("serialises an empty view without a query", () => {
    expect(viewStateToSearch({ date: null, focus: null })).toBe("");
  });
});

describe("focus cycling", () => {
  test("starts at the Sun and wraps through Neptune", () => {
    expect(cycleFocus(null, 1)).toBe("sun");
    expect(cycleFocus(null, -1)).toBe("neptune");
    expect(cycleFocus("neptune", 1)).toBe("sun");
    expect(cycleFocus("sun", -1)).toBe("neptune");
    expect(cycleFocus("earth", 1)).toBe("mars");
    expect(cycleFocus("earth", -1)).toBe("venus");
  });
});
