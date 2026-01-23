"use client";

import { Select, SelectOption } from "@/components/ui/Select";
import { Label } from "@/components/ui/label";
import { ETLDataResponse } from "@/hooks/useDashboardEtlData";

interface FieldSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  etlData: ETLDataResponse | null;
  fieldType?: "all" | "numeric" | "string" | "date";
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export default function FieldSelector({
  label,
  value,
  onChange,
  etlData,
  fieldType = "all",
  placeholder = "Selecciona un campo",
  required = false,
  className = "",
}: FieldSelectorProps) {
  const getFieldOptions = (): SelectOption[] => {
    if (!etlData) return [];

    let fields: string[] = [];

    switch (fieldType) {
      case "numeric":
        fields = etlData.fields.numeric;
        break;
      case "string":
        fields = etlData.fields.string;
        break;
      case "date":
        fields = etlData.fields.date;
        break;
      default:
        fields = etlData.fields.all;
    }

    return fields.map((field) => ({
      value: field,
      label: `${field} (${getFieldTypeLabel(field, etlData)})`,
    }));
  };

  const getFieldTypeLabel = (field: string, data: ETLDataResponse): string => {
    if (data.fields.numeric.includes(field)) return "número";
    if (data.fields.date.includes(field)) return "fecha";
    if (data.fields.string.includes(field)) return "texto";
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
      {etlData && (
        <div className="mt-1 text-xs text-gray-500">
          {etlData.etlData.rowCount} filas disponibles desde "
          {etlData.etl.title || etlData.etl.name}"
        </div>
      )}
    </div>
  );
}
