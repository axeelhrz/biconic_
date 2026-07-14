import { useEffect, useState } from "react";
import { getCountries, getProvinces } from "@/actions/locations";

export type Country = {
  id: string;
  name: string;
};

export type Province = {
  id: string;
  name: string;
  country_id: string;
};

export function useLocationOptions() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingProvinces, setLoadingProvinces] = useState(false);

  useEffect(() => {
    async function loadCountries() {
      try {
        setLoadingCountries(true);
        const data = await getCountries();
        setCountries(data);
      } catch (err) {
        console.error("Error in loadCountries:", err);
      } finally {
        setLoadingCountries(false);
      }
    }

    loadCountries();
  }, []);

  const fetchProvinces = async (countryId: string) => {
    if (!countryId) {
      setProvinces([]);
      return;
    }

    try {
      setLoadingProvinces(true);
      const data = await getProvinces(countryId);
      setProvinces(data);
    } catch (err) {
      console.error("Error in fetchProvinces:", err);
    } finally {
      setLoadingProvinces(false);
    }
  };

  return {
    countries,
    provinces,
    loadingCountries,
    loadingProvinces,
    fetchProvinces,
    setProvinces, // Exposed in case we need to clear manually
  };
}
