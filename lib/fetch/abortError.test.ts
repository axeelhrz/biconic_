import { describe, expect, it } from "vitest";
import {
  formatFetchErrorMessage,
  isAbortError,
  isSupersededFetchError,
  SupersededFetchError,
} from "./abortError";

describe("abortError", () => {
  it("detecta AbortError por nombre", () => {
    expect(isAbortError({ name: "AbortError", message: "signal is aborted without reason" })).toBe(true);
  });

  it("formatea abort como timeout amigable", () => {
    expect(formatFetchErrorMessage({ name: "AbortError", message: "signal is aborted without reason" })).toContain(
      "tardó demasiado"
    );
  });

  it("no muestra mensaje para fetch superseded", () => {
    expect(formatFetchErrorMessage(new SupersededFetchError())).toBe("");
    expect(isSupersededFetchError(new SupersededFetchError())).toBe(true);
  });
});
