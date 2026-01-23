"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { SelectOption } from "@/components/ui/Select";

export function usePlanOptions() {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
          .from("plans")
          .select("id, name")
          .order("name", { ascending: true });
        if (error) throw error;
        const rows = (data ??
          []) as Database["public"]["Tables"]["plans"]["Row"][];
        setOptions(rows.map((p) => ({ label: p.name, value: p.id })));
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
