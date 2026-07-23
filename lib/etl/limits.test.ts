import { describe, expect, it } from "vitest";
import {
  FIREBIRD_IN_LIST_MAX,
  getJoinKeysetBatchSize,
} from "./limits";

describe("getJoinKeysetBatchSize", () => {
  it("never exceeds Firebird IN list max for firebird", () => {
    expect(getJoinKeysetBatchSize("firebird")).toBeLessThanOrEqual(FIREBIRD_IN_LIST_MAX);
    expect(FIREBIRD_IN_LIST_MAX).toBe(1500);
  });

  it("caps env override above 1500 for firebird", () => {
    const prev = process.env.ETL_JOIN_KEYSET_BATCH;
    process.env.ETL_JOIN_KEYSET_BATCH = "2500";
    try {
      expect(getJoinKeysetBatchSize("firebird")).toBe(FIREBIRD_IN_LIST_MAX);
    } finally {
      if (prev === undefined) delete process.env.ETL_JOIN_KEYSET_BATCH;
      else process.env.ETL_JOIN_KEYSET_BATCH = prev;
    }
  });
});
