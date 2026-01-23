"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

// Interfaz para los datos (sin cambios)
interface ImportStatusData {
  import_status: string;
  total_rows: number | null;
  error_message: string | null;
  physical_table_name: string | null;
}

// Props (sin cambios)
type ImportStatusProps = {
  dataTableId: string;
  onProcessFinished: () => void;
  compact?: boolean;
};

export default function ImportStatus({
  dataTableId,
  onProcessFinished,
  compact = false,
}: ImportStatusProps) {
  const [status, setStatus] = useState<ImportStatusData | null>(null);
  const [progress, setProgress] = useState(0);
  const intervalId = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!dataTableId) return;

    const supabase = createClient();

    // Función que realiza el sondeo a la base de datos
    const pollStatus = async () => {
      // console.log(`[Polling] Verificando estado para ID: ${dataTableId}`);
      const { data, error } = await supabase
        .from("data_tables")
        .select("import_status, total_rows, error_message, physical_table_name")
        .eq("id", dataTableId)
        .single();

      if (error) {
        console.error("[Polling] Error al buscar el estado:", error);
        // Si hay un error grave de red, podríamos reintentar, pero si es 404 paramos.
        // Por simplicidad, dejamos que siga intentando salvo que sea crítico.
        return;
      }

      if (data) {
        setStatus(data as ImportStatusData);

        // Estimación de progreso visual
        switch (data.import_status) {
            case "downloading_file": setProgress(10); break;
            case "creating_table": setProgress(30); break;
            case "inserting_rows": 
                // Indeterminado / en progreso activo
                setProgress(60); 
                break;
            case "completed": setProgress(100); break;
            case "failed": setProgress(100); break;
        }

        const isFinished =
          data.import_status === "completed" || data.import_status === "failed";
        if (isFinished) {
          if (intervalId.current) clearInterval(intervalId.current);

          // Solo mostramos toast si NO es modo compacto (para evitar spam visual en dashboard)
          if (!compact) {
             toast[data.import_status === "completed" ? "success" : "error"](
                data.import_status === "completed"
                ? `¡Importación completa! Se procesaron ${data.total_rows} filas.`
                : `Error en la importación: ${data.error_message}`
             );
          }

          onProcessFinished();
        }
      }
    };

    pollStatus();
    intervalId.current = setInterval(pollStatus, 2000); // Polling cada 2s para dashboard

    return () => {
      if (intervalId.current) {
        clearInterval(intervalId.current);
      }
    };
  }, [dataTableId, onProcessFinished, compact]);

  const getStatusMessage = () => {
    if (!status) return "Iniciando...";
    switch (status.import_status) {
      case "pending":
        return "Conectando...";
      case "processing":
        return "Preparando...";
      case "downloading_file":
        return "Descargando...";
      case "creating_table":
        return "Creando tabla...";
      case "inserting_rows":
        return compact 
            ? `${status.total_rows || 0} filas` 
            : `Importando filas... (${status.total_rows || 0} procesadas)`;
      case "completed":
        return compact 
            ? "Completado" 
            : `Proceso completado. Tabla "${status.physical_table_name}" creada con ${status.total_rows} filas.`;
      case "failed":
        return "Error";
      default:
        return status?.import_status || "";
    }
  };

  if (compact) {
     return (
        <div className="w-full flex flex-col gap-1">
            <div className="flex justify-between text-xs text-gray-500">
                <span>{getStatusMessage()}</span>
                {status?.import_status === 'failed' && <span className="text-red-500">Falló</span>}
            </div>
             <Progress 
                value={progress} 
                className={`w-full h-1 ${status?.import_status === 'failed' ? '[&>div]:bg-red-500' : '[&>div]:bg-teal-600'}`} 
            />
        </div>
     )
  }

  return (
    <div className="flex flex-col space-y-4 p-6 w-full bg-white rounded-lg border border-dashed border-gray-200">
      <div className="flex items-center space-x-4">
        {status?.import_status !== 'completed' && status?.import_status !== 'failed' && (
             <div className="animate-spin rounded-full h-6 w-6 border-2 border-teal-600 border-t-transparent"></div>
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-gray-900">
            {status?.import_status === 'failed' ? 'Error en la importación' : 'Procesando tu archivo...'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">{getStatusMessage()}</p>
        </div>
      </div>
      <Progress 
        value={progress} 
        className={`w-full h-2 ${status?.import_status === 'failed' ? '[&>div]:bg-red-500' : '[&>div]:bg-teal-600'}`} 
      />
    </div>
  );
}
