"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { SelectOption } from "@/components/ui/Select";
import { getCompanyOptions } from "@/app/admin/(main)/clients/actions";

export function useCompanyOptions() {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const rows = await getCompanyOptions();
        const list = Array.isArray(rows) ? rows : [];
        setOptions(
          list
            .filter((r) => r?.id && r?.name?.trim())
            .map((r) => ({ label: r.name, value: r.id }))
        );
      } catch (err) {
        console.error("Error cargando empresas:", err);
        setOptions([]);
        toast.error("No se pudieron cargar las empresas");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { options, loading } as const;
}
