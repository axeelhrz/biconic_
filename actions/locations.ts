"use server";

import {
  listCountriesFromDb,
  listProvincesFromDb,
  type CountryOption,
  type ProvinceOption,
} from "@/lib/admin/location-repository";

export async function getCountries(): Promise<CountryOption[]> {
  return listCountriesFromDb();
}

export async function getProvinces(countryId: string): Promise<ProvinceOption[]> {
  return listProvincesFromDb(countryId);
}
