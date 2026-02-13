"use client";

import { Select, SelectOption } from "@/components/ui/Select";
import { Label } from "@/components/ui/label";
import { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";

interface AdminFieldSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  etlData: ETLDataResponse | null;
  /** ID de la fuente seleccionada; si se pasa, se muestran campos y "filas disponibles" de esa fuente */
  dataSourceId?: string | null;
  fieldType?: "all" | "numeric" | "string" | "date";
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export default function AdminFieldSelector({
  label,
  value,
  onChange,
  etlData,
  dataSourceId,
  fieldType = "all",
  placeholder = "Selecciona un campo",
  required = false,
  className = "",
}: AdminFieldSelectorProps) {
  // Resolver la fuente activa: la seleccionada o la principal
  const sources = etlData?.dataSources;
  const selectedSource = sources?.find(
    (s) => s.id === (dataSourceId ?? etlData?.primarySourceId ?? sources[0]?.id)
  );
  const activeFields = selectedSource?.fields ?? etlData?.fields;

  const getFieldOptions = (): SelectOption[] => {
    if (!activeFields) return [];

    let fields: string[] = [];

    switch (fieldType) {
      case "numeric":
        fields = activeFields.numeric;
        break;
      case "string":
        fields = activeFields.string;
        break;
      case "date":
        fields = activeFields.date;
        break;
      default:
        fields = activeFields.all;
    }

    return fields.map((field) => ({
      value: field,
      label: `${field} (${getFieldTypeLabel(field, activeFields)})`,
    }));
  };

  const getFieldTypeLabel = (
    field: string,
    fields: { numeric: string[]; date: string[]; string: string[] }
  ): string => {
    if (fields.numeric.includes(field)) return "número";
    if (fields.date.includes(field)) return "fecha";
    if (fields.string.includes(field)) return "texto";
    return "desconocido";
  };

  const options = getFieldOptions();

  if (!etlData) {
    return (
      <div className={className}>
        <Label>
          {label} {required && "*"}
        </Label>
        <div className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
          <span className="text-sm text-gray-500">Cargando campos...</span>
        </div>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className={className}>
        <Label>
          {label} {required && "*"}
        </Label>
        <div className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
          <span className="text-sm text-gray-500">
            No hay campos {fieldType !== "all" ? `de tipo ${fieldType}` : ""}{" "}
            disponibles
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Label>
        {label} {required && "*"}
      </Label>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        className="rounded-xl"
      />
      {selectedSource ? (
        <div className="mt-1 text-xs text-gray-500">
          {selectedSource.rowCount} filas disponibles desde "{selectedSource.etlName}" (Admin View)
        </div>
      ) : etlData?.etlData != null && etlData?.etl ? (
        <div className="mt-1 text-xs text-gray-500">
          {etlData.etlData.rowCount} filas disponibles desde "
          {etlData.etl.title || etlData.etl.name}" (Admin View)
        </div>
      ) : null}
    </div>
  );
}
