import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";

export type CountryOption = { id: string; name: string };
export type ProvinceOption = { id: string; name: string; country_id: string };

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

async function hasTable(sql: ReturnType<typeof postgres>, table: string): Promise<boolean> {
  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return row?.exists === true;
}

export async function listCountriesFromDb(): Promise<CountryOption[]> {
  const sql = getSql();
  try {
    if (!(await hasTable(sql, "countries"))) return [];
    return await sql<CountryOption[]>`
      SELECT id::text AS id, name
      FROM public.countries
      ORDER BY name ASC
    `;
  } finally {
    await sql.end();
  }
}

export async function listProvincesFromDb(countryId: string): Promise<ProvinceOption[]> {
  if (!countryId.trim()) return [];
  const sql = getSql();
  try {
    if (!(await hasTable(sql, "provinces"))) return [];
    return await sql<ProvinceOption[]>`
      SELECT id::text AS id, name, country_id::text AS country_id
      FROM public.provinces
      WHERE country_id = ${countryId}
      ORDER BY name ASC
    `;
  } finally {
    await sql.end();
  }
}
