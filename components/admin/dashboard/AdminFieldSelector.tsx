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
  /** Clases para el botón del Select (p. ej. tema platform) */
  buttonClassName?: string;
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
  buttonClassName,
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

  const themedButtonClass =
    "border-[var(--platform-border)] bg-[var(--platform-bg)] text-[var(--platform-fg)] placeholder-[var(--platform-fg-muted)] focus:ring-2 focus:ring-[var(--platform-accent)] focus:border-[var(--platform-accent)]";
  const emptyBoxStyle = {
    borderColor: "var(--platform-border, #e5e7eb)",
    background: "var(--platform-bg-elevated, #f9fafb)",
    color: "var(--platform-fg-muted, #6b7280)",
  };

  if (!etlData) {
    return (
      <div className={className}>
        <Label>
          {label} {required && "*"}
        </Label>
        <div className="h-10 w-full rounded-lg border flex items-center justify-center" style={emptyBoxStyle}>
          <span className="text-sm">Cargando campos...</span>
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
        <div className="h-10 w-full rounded-lg border flex items-center justify-center" style={emptyBoxStyle}>
          <span className="text-sm">
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
        buttonClassName={buttonClassName ?? themedButtonClass}
      />
      {selectedSource ? (
        <div className="mt-1 text-xs" style={{ color: "var(--platform-fg-muted)" }}>
          {selectedSource.rowCount} filas disponibles desde &quot;{selectedSource.etlName}&quot; (Admin View)
        </div>
      ) : etlData?.etlData != null && etlData?.etl ? (
        <div className="mt-1 text-xs" style={{ color: "var(--platform-fg-muted)" }}>
          {etlData.etlData.rowCount} filas disponibles desde &quot;
          {etlData.etl.title || etlData.etl.name}&quot; (Admin View)
        </div>
      ) : null}
    </div>
  );
}
