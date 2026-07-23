import { describe, expect, it } from "vitest";
import {
  resolveArProvinceGadmId,
  rowsSuggestArgentinaProvinces,
} from "@/lib/geo/argentinaProvinces";

describe("resolveArProvinceGadmId", () => {
  it("resuelve nombres canónicos y variantes comunes", () => {
    expect(resolveArProvinceGadmId("Córdoba")).toBe("Córdoba");
    expect(resolveArProvinceGadmId("Cordoba")).toBe("Córdoba");
    expect(resolveArProvinceGadmId("BUENOS AIRES")).toBe("BuenosAires");
    expect(resolveArProvinceGadmId("CABA")).toBe("CiudaddeBuenosAires");
    expect(resolveArProvinceGadmId("Ciudad Autónoma de Buenos Aires")).toBe("CiudaddeBuenosAires");
    expect(resolveArProvinceGadmId("Santiago del Estero")).toBe("SantiagodelEstero");
    expect(resolveArProvinceGadmId("Bs As")).toBe("BuenosAires");
  });

  it("resuelve prefijos Provincia de / Pcia.", () => {
    expect(resolveArProvinceGadmId("Provincia de Córdoba")).toBe("Córdoba");
    expect(resolveArProvinceGadmId("Provincia de Santa Fe")).toBe("SantaFe");
    expect(resolveArProvinceGadmId("Pcia. de Mendoza")).toBe("Mendoza");
    expect(resolveArProvinceGadmId("Prov. Neuquén")).toBe("Neuquén");
  });

  it("resuelve nombres largos con coma (Tierra del Fuego)", () => {
    expect(
      resolveArProvinceGadmId("Tierra del Fuego, Antártida e Islas del Atlántico Sur")
    ).toBe("TierradelFuego");
  });

  it("resuelve códigos ISO / INDEC habituales", () => {
    expect(resolveArProvinceGadmId("AR-B")).toBe("BuenosAires");
    expect(resolveArProvinceGadmId("AR-C")).toBe("CiudaddeBuenosAires");
    expect(resolveArProvinceGadmId("14")).toBe("Córdoba");
    expect(resolveArProvinceGadmId("02")).toBe("CiudaddeBuenosAires");
  });

  it("no confunde San Juan / San Luis con prefijos cortos", () => {
    expect(resolveArProvinceGadmId("San")).toBeNull();
    expect(resolveArProvinceGadmId("San Juan")).toBe("SanJuan");
    expect(resolveArProvinceGadmId("San Luis")).toBe("SanLuis");
  });
});

describe("rowsSuggestArgentinaProvinces", () => {
  it("detecta datasets provinciales tipicos", () => {
    expect(
      rowsSuggestArgentinaProvinces([
        "Provincia de Córdoba",
        "Buenos Aires",
        "Santa Fe",
        "Mendoza",
        "CABA",
      ])
    ).toBe(true);
  });

  it("no dispara con etiquetas no provinciales", () => {
    expect(rowsSuggestArgentinaProvinces(["Enero", "Febrero", "Marzo", "Abril"])).toBe(false);
  });
});
