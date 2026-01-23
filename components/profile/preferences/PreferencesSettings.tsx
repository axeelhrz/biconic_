// src/components/profile/preferences/PreferencesSettings.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import NotificationChannelPanel, {
  NOTIFICATION_CHANNELS,
} from "./NotificationChannelPanel";
import AlertTypesPanel, { AlertPref } from "./AlertTypesPanel";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import clsx from "clsx";

const DEFAULT_ALERTS: AlertPref[] = [
  { id: "etl-errors", name: "Errores ETL", enabled: true },
  { id: "new-users", name: "Nuevos usuarios", enabled: true },
  { id: "usage-limits", name: "Límites de uso", enabled: true },
  { id: "updates", name: "Actualizaciones", enabled: true },
  { id: "maintenance", name: "Mantenimiento", enabled: true },
  { id: "security", name: "Seguridad", enabled: true },
];

export default function PreferencesSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["email"]);
  const [alerts, setAlerts] = useState<AlertPref[]>(DEFAULT_ALERTS);
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");

  const snapshot = useMemo(
    () => JSON.stringify({ selectedChannels, alerts }),
    [selectedChannels, alerts]
  );
  const dirty = snapshot !== initialSnapshot && !loading && !saving;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) return;

        // Variables locales para construir el estado final antes de setear snapshot
        let loadedChannels: string[] = ["email"]; // fallback inicial
        let loadedAlerts: AlertPref[] = [...alerts];

        // Notificaciones (multi-select)
        const { data: notifData, error: notifError } = await supabase
          .from("admin_preference_notifications")
          .select("type,enabled")
          .eq("user_id", user.id);
        if (notifError) throw notifError;
        if (notifData && notifData.length > 0) {
          const enabledOnes = notifData
            .filter((r) => r.enabled)
            .map((r) => r.type)
            .filter((t): t is string => !!t);
          if (enabledOnes.length > 0) loadedChannels = enabledOnes;
        }

        // Alertas
        const { data: alertData, error: alertError } = await supabase
          .from("admin_preference_alerts")
          .select("type,enabled")
          .eq("user_Id", user.id);
        if (alertError) throw alertError;
        if (alertData && alertData.length > 0) {
          loadedAlerts = DEFAULT_ALERTS.map((a) => {
            const found = alertData.find((d) => d.type === a.id);
            return found ? { ...a, enabled: !!found.enabled } : a;
          });
        }

        if (active) {
          // ordenamos para snapshot estable
          const ordered = [...loadedChannels].sort();
          setSelectedChannels(ordered);
          setAlerts(loadedAlerts);
          // snapshot con los valores realmente cargados
          setInitialSnapshot(
            JSON.stringify({
              selectedChannels: ordered,
              alerts: loadedAlerts,
            })
          );
        }
      } catch (e: any) {
        console.error(e);
        toast.error("No se pudieron cargar las preferencias");
      } finally {
        active && setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAlert = (id: string) => {
    setAlerts((curr) =>
      curr.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  };

  const saveAll = async () => {
    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada");

      // Preparar payload para notificaciones: generar todas las filas reflejando selección múltiple
      const notifPayload = NOTIFICATION_CHANNELS.map((ch) => ({
        user_id: user.id,
        type: ch.id,
        enabled: selectedChannels.includes(ch.id),
      }));

      // Limpiar y reinsertar (simplifica evitar error 400 por on_conflict)
      await supabase
        .from("admin_preference_notifications")
        .delete()
        .eq("user_id", user.id);
      const { error: notifInsertError } = await supabase
        .from("admin_preference_notifications")
        .insert(notifPayload);
      if (notifInsertError) throw notifInsertError;

      // Alertas upsert
      const alertPayload = alerts.map((a) => ({
        type: a.id,
        enabled: a.enabled,
        user_Id: user.id,
      }));
      // Borrado previo para mantener consistencia (evita on_conflict con nombre distinto de columna)
      await supabase
        .from("admin_preference_alerts")
        .delete()
        .eq("user_Id", user.id);
      const { error: alertInsertError } = await supabase
        .from("admin_preference_alerts")
        .insert(alertPayload);
      if (alertInsertError) throw alertInsertError;

      // actualizar snapshot (ordenamos para consistencia)
      const ordered = [...selectedChannels].sort();
      setInitialSnapshot(
        JSON.stringify({
          selectedChannels: ordered,
          alerts,
        })
      );
      toast.success("Preferencias guardadas");
    } catch (e: any) {
      console.error(e);
      toast.error("No se pudieron guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const cancelChanges = () => {
    try {
      const parsed = JSON.parse(initialSnapshot || "{}");
      if (parsed.selectedChannels) setSelectedChannels(parsed.selectedChannels);
      if (parsed.alerts) setAlerts(parsed.alerts);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mt-8 flex w-full flex-col gap-[15px] lg:flex-col">
      <div className="w-full flex">
        <NotificationChannelPanel
          selectedChannels={selectedChannels}
          onToggle={(id: string) => {
            setSelectedChannels((prev) =>
              prev.includes(id) ? prev.filter((ch) => ch !== id) : [...prev, id]
            );
          }}
          loading={loading}
        />
        <AlertTypesPanel
          alerts={alerts}
          onToggle={toggleAlert}
          loading={loading}
        />
      </div>
      {/* Botones de acción globales */}
      <div className="w-full flex flex-row gap-4 justify-end mt-4 lg:mt-0">
        {dirty && (
          <>
            <button
              type="button"
              onClick={cancelChanges}
              className="flex flex-row items-center justify-center gap-2 px-5 py-2.5 h-10 border-[1.5px] border-[#0F5F4C] rounded-full text-[#0F5F4C] font-poppins text-[15px] font-medium leading-5 hover:bg-[#0F5F4C]/10 transition-colors"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className={clsx(
                "flex flex-row items-center justify-center gap-3 h-10 px-5 rounded-full bg-[#0F5F4C] text-white font-poppins text-[15px] font-medium leading-5 transition-colors disabled:opacity-60",
                saving && "cursor-not-allowed"
              )}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
