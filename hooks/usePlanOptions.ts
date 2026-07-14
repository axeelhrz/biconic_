"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPlans } from "@/actions/plans";
import type { SelectOption } from "@/components/ui/Select";

export function usePlanOptions() {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const rows = await getPlans();
        setOptions(
          rows.map((p) => ({
            label: p.name,
            value: p.id,
          }))
        );
      } catch (err) {
        console.error("Error cargando planes:", err);
        toast.error("No se pudieron cargar los planes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { options, loading } as const;
}
