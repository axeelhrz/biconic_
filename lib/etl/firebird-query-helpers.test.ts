import { describe, expect, it } from "vitest";
import {
  buildFirebirdSelectList,
  firebirdBareColumnNames,
  projectRowsToConfiguredColumns,
} from "./firebird-query-helpers";

describe("firebird-query-helpers", () => {
  it("strips primary/join prefixes from column names", () => {
    expect(firebirdBareColumnNames(["primary.FOO", "join_0.BAR", "BAZ"])).toEqual([
      "FOO",
      "BAR",
      "BAZ",
    ]);
  });

  it("builds select list with safe parts", () => {
    const sql = buildFirebirdSelectList(["primary.ID", "NOMBRE"], (s) => s.toUpperCase());
    expect(sql).toBe("ID, NOMBRE");
  });

  it("projects rows to configured columns only", () => {
    const rows = [{ id: 1, nombre: "A", extra: "x" }];
    const out = projectRowsToConfiguredColumns(rows, ["ID", "NOMBRE"]);
    expect(out).toEqual([{ id: 1, nombre: "A" }]);
  });
});
