"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { SelectOption } from "@/components/ui/Select";

export function useCompanyOptions() {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
          .from("clients")
          .select("id, company_name, type")
          .eq("type", "empresa")
          .order("company_name", { ascending: true });
        if (error) throw error;
        const rows = (data ??
          []) as Database["public"]["Tables"]["clients"]["Row"][];
        setOptions(
          rows
            .filter((r) => !!r.company_name)
            .map((r) => ({ label: r.company_name as string, value: r.id }))
        );
      } catch (err) {
        console.error("Error cargando empresas:", err);
        toast.error("No se pudieron cargar las empresas");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { options, loading } as const;
}
