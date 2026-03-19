"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, LayoutDashboard, Pencil, Trash2, Loader2, RefreshCw, BarChart2, LineChart, PieChart, Donut, Hash, Table2, Sparkles, AreaChart, ScatterChart, MapPin, TrendingUp, HelpCircle } from "lucide-react";
import { Bar, Line, Pie, Doughnut, Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/Select";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AdminFieldSelector from "@/components/admin/dashboard/AdminFieldSelector";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";
import { safeJsonResponse } from "@/lib/safe-json-response";
import type { SavedMetricForm, SavedMetricAggregationConfig, AggregationMetricEdit, AggregationFilterEdit } from "@/components/admin/dashboard/AddMetricConfigForm";

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

// Reserved for future UI (e.g. aggregate function selector)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _AGG_FUNCS = [
  { value: "SUM", label: "Suma" },
  { value: "AVG", label: "Promedio" },
  { value: "COUNT", label: "Conteo" },
  { value: "MIN", label: "Mínimo" },
  { value: "MAX", label: "Máximo" },
  { value: "COUNT(DISTINCT", label: "Conteo único" },
  { value: "FORMULA", label: "Fórmula / ratio" },
];

const FILTER_OPERATOR_OPTIONS = [
  { value: "=", label: "Igual" },
  { value: "!=", label: "Distinto" },
  { value: ">", label: "Mayor que" },
  { value: ">=", label: "Mayor o igual" },
  { value: "<", label: "Menor que" },
  { value: "<=", label: "Menor o igual" },
  { value: "CONTAINS", label: "Contiene" },
  { value: "STARTS_WITH", label: "Comienza por" },
  { value: "ENDS_WITH", label: "Termina en" },
  { value: "EXACT", label: "Coincide exactamente" },
  { value: "LIKE", label: "LIKE" },
  { value: "ILIKE", label: "ILIKE" },
  { value: "IN", label: "IN" },
  { value: "DAY", label: "Día (fecha)" },
  { value: "MONTH", label: "Mes" },
  { value: "QUARTER", label: "Trimestre" },
  { value: "SEMESTER", label: "Semestre" },
  { value: "YEAR", label: "Año" },
];

const DATE_LEVEL_OPTIONS = [
  { value: "day", label: "Día", operator: "DAY" as const },
  { value: "month", label: "Mes", operator: "MONTH" as const },
  { value: "quarter", label: "Trimestre", operator: "QUARTER" as const },
  { value: "semester", label: "Semestre", operator: "SEMESTER" as const },
  { value: "year", label: "Año", operator: "YEAR" as const },
];

const CHART_TYPES: { value: string; label: string; icon: ComponentType<{ className?: string }>; description: string }[] = [
  { value: "bar", label: "Barras", icon: BarChart2, description: "Comparar valores por categoría" },
  { value: "horizontalBar", label: "Barras horiz.", icon: BarChart2, description: "Ideal para muchas categorías o nombres largos" },
  { value: "line", label: "Líneas", icon: LineChart, description: "Evolución temporal o tendencias" },
  { value: "area", label: "Área", icon: AreaChart, description: "Tendencias con volumen acumulado" },
  { value: "pie", label: "Circular", icon: PieChart, description: "Distribución proporcional (pocas categorías)" },
  { value: "doughnut", label: "Dona", icon: Donut, description: "Distribución proporcional con espacio central" },
  { value: "scatter", label: "Dispersión", icon: ScatterChart, description: "Correlación entre dos métricas numéricas" },
  { value: "kpi", label: "KPI", icon: Hash, description: "Un solo número destacado (sin dimensiones)" },
  { value: "table", label: "Tabla", icon: Table2, description: "Datos detallados en filas y columnas" },
  { value: "combo", label: "Combo", icon: TrendingUp, description: "Barras + línea para comparar escalas diferentes" },
  { value: "map", label: "Mapa", icon: MapPin, description: "Visualización geográfica (requiere dimensión de ubicación)" },
];

// Reserved for formula quick-insert UI
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _FORMULA_QUICKS = [
  { label: "A ÷ B", expr: "metric_0 / NULLIF(metric_1, 0)" },
  { label: "% A/B", expr: "100.0 * metric_0 / NULLIF(metric_1, 0)" },
  { label: "Margen", expr: "(metric_0 - metric_1) / NULLIF(metric_0, 0)" },
  { label: "A - B", expr: "metric_0 - metric_1" },
  { label: "A + B", expr: "metric_0 + metric_1" },
  { label: "A × B", expr: "metric_0 * metric_1" },
];

/** Nombres de funciones tipo Excel para autocompletado y ayuda en fórmula personalizada. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _EXCEL_FUNCTIONS = [
  "SUM", "AVERAGE", "COUNT", "COUNTA", "MIN", "MAX", "IF", "IFS", "IFERROR", "NULLIF", "UNIQUE",
  "ABS", "ROUND", "ROUNDUP", "ROUNDDOWN", "TRUNC", "MOD", "POWER", "SQRT",
  "AND", "OR", "NOT", "TRUE", "FALSE", "CONCAT", "CONCATENATE",
  "VLOOKUP", "HLOOKUP", "INDEX", "MATCH", "XLOOKUP",
  "LEFT", "RIGHT", "MID", "LEN", "CONCATENATE", "TEXT", "VALUE",
  "DATE", "TODAY", "NOW", "YEAR", "MONTH", "DAY", "EOMONTH", "DATEDIF",
  "metric_0", "metric_1", "metric_2", "metric_3",
];

/** Funciones de agregación: la fórmula se clasifica como "agregado" y no puede crearse como columna. */
const AGGREGATE_FUNCTION_NAMES = new Set([
  "SUM", "AVG", "AVERAGE", "COUNT", "MIN", "MAX",
  "COUNTIF", "SUMIF", "AVERAGEIF", "COUNTIFS", "SUMIFS",
]);

/** Funciones y palabras clave conocidas (por fila o agregadas) para validar que los identificadores sean válidos. */
const KNOWN_FORMULA_IDENTIFIERS = new Set([
  ...AGGREGATE_FUNCTION_NAMES,
  "IF", "IFS", "IFERROR", "IFNA", "NULLIF", "COALESCE", "CASE", "WHEN", "THEN", "ELSE", "END", "UNIQUE",
  "ABS", "ROUND", "ROUNDUP", "ROUNDDOWN", "CEIL", "CEILING", "FLOOR", "TRUNC", "GREATEST", "LEAST",
  "MOD", "POWER", "SQRT", "SIGN", "EXP", "LN", "LOG", "LOG10", "PI", "SIN", "COS", "TAN", "INT",
  "UPPER", "LOWER", "TRIM", "LENGTH", "LEN", "LEFT", "RIGHT", "SUBSTRING", "MID", "CONCAT", "CONCATENATE",
  "REPLACE", "SUBSTITUTE", "DATE", "TODAY", "NOW", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND",
  "EOMONTH", "DATEDIF", "DATEVALUE", "TIMEVALUE", "VALUE", "TEXT", "REPT", "FIND", "SEARCH", "PROPER",
  "AND", "OR", "NOT", "TRUE", "FALSE",
]);

/** Referencia completa de fórmulas estilo Excel para el modal de ayuda. */
const EXCEL_FORMULAS_REFERENCIA: { categoria: string; funciones: { nombre: string; sintaxis: string; descripcion: string }[] }[] = [
  {
    categoria: "Operadores aritméticos",
    funciones: [
      { nombre: "+", sintaxis: "A + B", descripcion: "Suma" },
      { nombre: "-", sintaxis: "A - B", descripcion: "Resta" },
      { nombre: "*", sintaxis: "A * B", descripcion: "Multiplicación" },
      { nombre: "/", sintaxis: "A / B", descripcion: "División" },
      { nombre: "^", sintaxis: "A ^ B", descripcion: "Potencia" },
      { nombre: "%", sintaxis: "A %", descripcion: "Porcentaje" },
    ],
  },
  {
    categoria: "Matemáticas y trigonometría",
    funciones: [
      { nombre: "SUM", sintaxis: "SUM(rango)", descripcion: "Suma de valores" },
      { nombre: "AVERAGE", sintaxis: "AVERAGE(rango)", descripcion: "Promedio" },
      { nombre: "COUNT", sintaxis: "COUNT(rango)", descripcion: "Cuenta celdas numéricas" },
      { nombre: "COUNTA", sintaxis: "COUNTA(rango)", descripcion: "Cuenta celdas no vacías" },
      { nombre: "MIN", sintaxis: "MIN(rango)", descripcion: "Valor mínimo" },
      { nombre: "MAX", sintaxis: "MAX(rango)", descripcion: "Valor máximo" },
      { nombre: "ABS", sintaxis: "ABS(número)", descripcion: "Valor absoluto" },
      { nombre: "ROUND", sintaxis: "ROUND(número; decimales)", descripcion: "Redondeo estándar" },
      { nombre: "ROUNDUP", sintaxis: "ROUNDUP(número; decimales)", descripcion: "Redondeo hacia arriba" },
      { nombre: "ROUNDDOWN", sintaxis: "ROUNDDOWN(número; decimales)", descripcion: "Redondeo hacia abajo" },
      { nombre: "TRUNC", sintaxis: "TRUNC(número)", descripcion: "Trunca decimales" },
      { nombre: "MOD", sintaxis: "MOD(número; divisor)", descripcion: "Módulo (resto)" },
      { nombre: "POWER", sintaxis: "POWER(base; exponente)", descripcion: "Potencia" },
      { nombre: "SQRT", sintaxis: "SQRT(número)", descripcion: "Raíz cuadrada" },
      { nombre: "FLOOR", sintaxis: "FLOOR(número; significancia)", descripcion: "Redondea hacia abajo" },
      { nombre: "CEILING", sintaxis: "CEILING(número; significancia)", descripcion: "Redondea hacia arriba" },
      { nombre: "INT", sintaxis: "INT(número)", descripcion: "Parte entera" },
      { nombre: "SIGN", sintaxis: "SIGN(número)", descripcion: "Signo (-1, 0, 1)" },
      { nombre: "EXP", sintaxis: "EXP(número)", descripcion: "e elevado a número" },
      { nombre: "LN", sintaxis: "LN(número)", descripcion: "Logaritmo natural" },
      { nombre: "LOG", sintaxis: "LOG(número; base)", descripcion: "Logaritmo" },
      { nombre: "LOG10", sintaxis: "LOG10(número)", descripcion: "Logaritmo base 10" },
      { nombre: "SIN", sintaxis: "SIN(ángulo)", descripcion: "Seno" },
      { nombre: "COS", sintaxis: "COS(ángulo)", descripcion: "Coseno" },
      { nombre: "TAN", sintaxis: "TAN(ángulo)", descripcion: "Tangente" },
      { nombre: "PI", sintaxis: "PI()", descripcion: "Constante π" },
    ],
  },
  {
    categoria: "Lógica",
    funciones: [
      { nombre: "IF", sintaxis: "IF(condición; valor_si_verdadero; valor_si_falso)", descripcion: "Condicional" },
      { nombre: "IFERROR", sintaxis: "IFERROR(valor; valor_si_error)", descripcion: "Devuelve valor si hay error" },
      { nombre: "IFNA", sintaxis: "IFNA(valor; valor_si_NA)", descripcion: "Devuelve valor si es #N/A" },
      { nombre: "AND", sintaxis: "AND(cond1; cond2; ...)", descripcion: "Y lógico" },
      { nombre: "OR", sintaxis: "OR(cond1; cond2; ...)", descripcion: "O lógico" },
      { nombre: "NOT", sintaxis: "NOT(condición)", descripcion: "Negación" },
      { nombre: "TRUE", sintaxis: "TRUE()", descripcion: "Verdadero" },
      { nombre: "FALSE", sintaxis: "FALSE()", descripcion: "Falso" },
      { nombre: "XOR", sintaxis: "XOR(cond1; cond2; ...)", descripcion: "O exclusivo" },
      { nombre: "IFS", sintaxis: "IFS(cond1; valor1; cond2; valor2; ...)", descripcion: "Múltiples condiciones" },
      { nombre: "SWITCH", sintaxis: "SWITCH(expr; val1; res1; ...; default)", descripcion: "Selección por valor" },
    ],
  },
  {
    categoria: "Texto",
    funciones: [
      { nombre: "LEFT", sintaxis: "LEFT(texto; cantidad)", descripcion: "Caracteres a la izquierda" },
      { nombre: "RIGHT", sintaxis: "RIGHT(texto; cantidad)", descripcion: "Caracteres a la derecha" },
      { nombre: "MID", sintaxis: "MID(texto; inicio; cantidad)", descripcion: "Extrae subcadena" },
      { nombre: "LEN", sintaxis: "LEN(texto)", descripcion: "Longitud del texto" },
      { nombre: "CONCATENATE", sintaxis: "CONCATENATE(texto1; texto2; ...)", descripcion: "Une textos" },
      { nombre: "CONCAT", sintaxis: "CONCAT(texto1; texto2; ...)", descripcion: "Une textos" },
      { nombre: "TEXTJOIN", sintaxis: "TEXTJOIN(separador; omitir_vacíos; texto1; ...)", descripcion: "Une con separador" },
      { nombre: "TEXT", sintaxis: "TEXT(valor; formato)", descripcion: "Formatea como texto" },
      { nombre: "VALUE", sintaxis: "VALUE(texto)", descripcion: "Convierte texto a número" },
      { nombre: "TRIM", sintaxis: "TRIM(texto)", descripcion: "Quita espacios extra" },
      { nombre: "UPPER", sintaxis: "UPPER(texto)", descripcion: "Mayúsculas" },
      { nombre: "LOWER", sintaxis: "LOWER(texto)", descripcion: "Minúsculas" },
      { nombre: "PROPER", sintaxis: "PROPER(texto)", descripcion: "Primera letra en mayúscula" },
      { nombre: "REPLACE", sintaxis: "REPLACE(texto; inicio; longitud; nuevo)", descripcion: "Reemplaza caracteres" },
      { nombre: "SUBSTITUTE", sintaxis: "SUBSTITUTE(texto; buscar; reemplazar; ocurrencia)", descripcion: "Sustituye texto" },
      { nombre: "FIND", sintaxis: "FIND(buscar; texto; inicio)", descripcion: "Posición (sensible mayúsculas)" },
      { nombre: "SEARCH", sintaxis: "SEARCH(buscar; texto; inicio)", descripcion: "Posición (no sensible)" },
      { nombre: "REPT", sintaxis: "REPT(texto; veces)", descripcion: "Repite texto" },
    ],
  },
  {
    categoria: "Fecha y hora",
    funciones: [
      { nombre: "DATE", sintaxis: "DATE(año; mes; día)", descripcion: "Fecha a partir de año, mes, día" },
      { nombre: "TODAY", sintaxis: "TODAY()", descripcion: "Fecha actual" },
      { nombre: "NOW", sintaxis: "NOW()", descripcion: "Fecha y hora actual" },
      { nombre: "YEAR", sintaxis: "YEAR(fecha)", descripcion: "Año" },
      { nombre: "MONTH", sintaxis: "MONTH(fecha)", descripcion: "Mes" },
      { nombre: "DAY", sintaxis: "DAY(fecha)", descripcion: "Día" },
      { nombre: "HOUR", sintaxis: "HOUR(fecha_hora)", descripcion: "Hora" },
      { nombre: "MINUTE", sintaxis: "MINUTE(fecha_hora)", descripcion: "Minuto" },
      { nombre: "SECOND", sintaxis: "SECOND(fecha_hora)", descripcion: "Segundo" },
      { nombre: "WEEKDAY", sintaxis: "WEEKDAY(fecha; tipo)", descripcion: "Día de la semana" },
      { nombre: "WEEKNUM", sintaxis: "WEEKNUM(fecha; tipo)", descripcion: "Número de semana" },
      { nombre: "EOMONTH", sintaxis: "EOMONTH(fecha; meses)", descripcion: "Último día del mes" },
      { nombre: "EDATE", sintaxis: "EDATE(fecha; meses)", descripcion: "Fecha + N meses" },
      { nombre: "DATEDIF", sintaxis: "DATEDIF(inicio; fin; unidad)", descripcion: "Diferencia entre fechas" },
      { nombre: "DATEVALUE", sintaxis: "DATEVALUE(texto)", descripcion: "Texto a fecha" },
      { nombre: "TIMEVALUE", sintaxis: "TIMEVALUE(texto)", descripcion: "Texto a hora" },
    ],
  },
  {
    categoria: "Búsqueda y referencia",
    funciones: [
      { nombre: "VLOOKUP", sintaxis: "VLOOKUP(valor; tabla; col; aprox)", descripcion: "Búsqueda vertical" },
      { nombre: "HLOOKUP", sintaxis: "HLOOKUP(valor; tabla; fila; aprox)", descripcion: "Búsqueda horizontal" },
      { nombre: "INDEX", sintaxis: "INDEX(rango; fila; col)", descripcion: "Valor en posición" },
      { nombre: "MATCH", sintaxis: "MATCH(valor; rango; tipo)", descripcion: "Posición en rango" },
      { nombre: "XLOOKUP", sintaxis: "XLOOKUP(buscar; rango_buscar; rango_devuelve)", descripcion: "Búsqueda moderna" },
      { nombre: "OFFSET", sintaxis: "OFFSET(ref; filas; cols; alto; ancho)", descripcion: "Referencia desplazada" },
      { nombre: "INDIRECT", sintaxis: "INDIRECT(ref_texto)", descripcion: "Referencia desde texto" },
      { nombre: "CHOOSE", sintaxis: "CHOOSE(índice; valor1; valor2; ...)", descripcion: "Elige por índice" },
    ],
  },
  {
    categoria: "Estadística",
    funciones: [
      { nombre: "MEDIAN", sintaxis: "MEDIAN(rango)", descripcion: "Mediana" },
      { nombre: "MODE", sintaxis: "MODE(rango)", descripcion: "Moda" },
      { nombre: "STDEV", sintaxis: "STDEV(rango)", descripcion: "Desviación estándar (muestra)" },
      { nombre: "STDEVP", sintaxis: "STDEVP(rango)", descripcion: "Desviación estándar (población)" },
      { nombre: "VAR", sintaxis: "VAR(rango)", descripcion: "Varianza (muestra)" },
      { nombre: "VARP", sintaxis: "VARP(rango)", descripcion: "Varianza (población)" },
      { nombre: "AVERAGEIF", sintaxis: "AVERAGEIF(rango; criterio; rango_promedio)", descripcion: "Promedio condicional" },
      { nombre: "SUMIF", sintaxis: "SUMIF(rango; criterio; rango_suma)", descripcion: "Suma condicional" },
      { nombre: "COUNTIF", sintaxis: "COUNTIF(rango; criterio)", descripcion: "Conteo condicional" },
      { nombre: "COUNTIFS", sintaxis: "COUNTIFS(rango1; crit1; rango2; crit2; ...)", descripcion: "Conteo con múltiples criterios" },
      { nombre: "SUMIFS", sintaxis: "SUMIFS(rango_suma; rango1; crit1; ...)", descripcion: "Suma con múltiples criterios" },
    ],
  },
  {
    categoria: "Información y compatibilidad",
    funciones: [
      { nombre: "ISBLANK", sintaxis: "ISBLANK(valor)", descripcion: "¿Está vacío?" },
      { nombre: "ISNUMBER", sintaxis: "ISNUMBER(valor)", descripcion: "¿Es número?" },
      { nombre: "ISTEXT", sintaxis: "ISTEXT(valor)", descripcion: "¿Es texto?" },
      { nombre: "ISDATE", sintaxis: "ISDATE(valor)", descripcion: "¿Es fecha?" },
      { nombre: "ISERROR", sintaxis: "ISERROR(valor)", descripcion: "¿Es error?" },
      { nombre: "ISNA", sintaxis: "ISNA(valor)", descripcion: "¿Es #N/A?" },
      { nombre: "NA", sintaxis: "NA()", descripcion: "Devuelve #N/A" },
      { nombre: "NULLIF", sintaxis: "NULLIF(valor1; valor2)", descripcion: "NULL si son iguales" },
      { nombre: "COALESCE", sintaxis: "COALESCE(val1; val2; ...)", descripcion: "Primer valor no nulo" },
    ],
  },
];

type ColumnRole = "key" | "time" | "dimension" | "measure" | "geo";
type GeoType = "country" | "province" | "city" | "address" | "lat_lon";

const GEO_TYPE_LABELS: Record<GeoType, string> = {
  country: "País",
  province: "Provincia / Estado",
  city: "Ciudad",
  address: "Dirección / Domicilio",
  lat_lon: "Latitud / Longitud",
};

/** Sugiere tipo geo por nombre de columna (detección automática). */
function suggestGeoTypeByColumnName(colName: string): GeoType | null {
  const n = colName.replace(/\./g, "_").toLowerCase();
  if (/pais|country|nation|naci[oó]n/i.test(n)) return "country";
  if (/provincia|estado|state|region|departamento/i.test(n)) return "province";
  if (/ciudad|city|localidad|municipio|town/i.test(n)) return "city";
  if (/direccion|domicilio|address|calle|street|domicilio/i.test(n)) return "address";
  if (/lat|lon|longitud|latitude|longitude|coord/i.test(n)) return "lat_lon";
  return null;
}

type MetricsDataResponse = {
  ok: boolean;
  data?: {
    etl: { id: string; title?: string; name?: string };
    hasData: boolean;
    schema: string | null;
    tableName: string | null;
    fields: { all: string[]; numeric: string[]; string: string[]; date: string[] };
    rowCount: number;
    savedMetrics: SavedMetricForm[];
    savedAnalyses?: { id: string; name: string; metricIds: string[]; [key: string]: unknown }[];
    rawRows?: Record<string, unknown>[];
    /** Periodicidad natural inferida por columna de fecha (Diaria, Semanal, Mensual, Anual, Irregular). El admin puede editarla en la UI. */
    dateColumnPeriodicity?: Record<string, string>;
    /** Sobrescrituras de periodicidad guardadas en layout (columna → Diaria|Semanal|Mensual|Anual|Irregular). */
    dateColumnPeriodicityOverrides?: Record<string, string>;
    /** Nombres para mostrar y formato por columna (desde ETL guided_config.filter.columnDisplay). */
    columnDisplay?: Record<string, { label?: string; format?: string }>;
    /** Configuración del dataset guardada en Publicar (grain, tiempo, roles, relaciones). */
    datasetConfig?: Record<string, unknown>;
  };
};

function buildEtlDataFromMetricsResponse(res: MetricsDataResponse["data"]): ETLDataResponse | null {
  if (!res || !res.etl) return null;
  const { etl, hasData, schema, tableName, fields, rowCount } = res;
  const fs = fields ?? { all: [], numeric: [], string: [], date: [] };
  const etlInfo = { id: etl.id, title: etl.title ?? etl.name ?? "", name: etl.name ?? etl.title ?? "" };
  const dataSources = hasData && schema && tableName
    ? [{
        id: "primary",
        etlId: etl.id,
        alias: "Principal",
        etlName: etlInfo.title,
        schema,
        tableName,
        rowCount: rowCount ?? 0,
        fields: fs,
      }]
    : [];
  return {
    dashboard: { id: "", etl_id: etl.id, etl: etlInfo },
    dataSources,
    primarySourceId: dataSources[0]?.id ?? null,
    etl: etlInfo,
    etlData: hasData && schema && tableName
      ? { id: 0, name: `${schema}.${tableName}`, created_at: "", dataArray: [], rowCount: rowCount ?? 0 }
      : null,
    fields: fs,
  };
}

/** Columna calculada guardada en el dataset; aparece como medida reutilizable (ej. factura = CANTIDAD * PRECIO_UNITARIO). */
export type DerivedColumn = { name: string; expression: string; defaultAggregation: string };

type ConnectionOption = { id: string; title: string; type: string };
type DatasetRelation = {
  id: string;
  connectionId: string;
  connectionTitle: string;
  tableKey: string;
  tableLabel: string;
  thisColumn: string;
  otherColumn: string;
  joinType: "INNER" | "LEFT";
};

export type EtlMetricsClientProps = {
  etlId: string;
  etlTitle: string;
  /** client_id del ETL; necesario para crear el dashboard (tabla dashboard requiere client_id) */
  etlClientId?: string | null;
  connections?: ConnectionOption[];
  /** Si true, solo se muestra el wizard de Dataset (Profiling → Publicar) y al guardar se redirige a /admin/datasets */
  datasetOnly?: boolean;
  /** Si true, no se muestra la pestaña Dataset; el wizard por defecto es Métrica (B) */
  hideDatasetTab?: boolean;
  /** Si se pasa y datasetOnly, al guardar con "Guardar y volver a Datasets" se llama esto en lugar de navegar (ej. cerrar modal y refrescar lista). */
  onDatasetSaved?: () => void;
  /** Si true y datasetOnly, el wizard está dentro del modal de /admin/datasets: se oculta el link "Volver a Datasets" (el cierre es con la X del modal). */
  embeddedInDatasetsModal?: boolean;
};

export default function EtlMetricsClient({ etlId, etlTitle, connections: connectionsProp = [], datasetOnly = false, hideDatasetTab = false, onDatasetSaved, embeddedInDatasetsModal = false }: EtlMetricsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MetricsDataResponse["data"] | null>(null);
  const [etlData, setEtlData] = useState<ETLDataResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formChartType, setFormChartType] = useState("bar");
  const [chartXAxis, setChartXAxis] = useState<string>("");
  const [chartYAxes, setChartYAxes] = useState<string[]>([]);
  const [chartSeriesField, setChartSeriesField] = useState<string>("");
  /** Dimensiones opcionales: vacío = KPI único agregado; 1+ = GROUP BY por esas columnas. */
  const [formDimensions, setFormDimensions] = useState<string[]>([]);
  const [formMetrics, setFormMetrics] = useState<AggregationMetricEdit[]>([
    { id: `m-${Date.now()}`, field: "", func: "SUM", alias: "" },
  ]);
  const [formFilters, setFormFilters] = useState<AggregationFilterEdit[]>([]);
  const [formOrderBy, setFormOrderBy] = useState<{ field: string; direction: "ASC" | "DESC" } | null>(null);
  const [formLimit, setFormLimit] = useState<number | undefined>(100);
  const [, setFormMetric] = useState<AggregationMetricEdit>({
    id: `m-${Date.now()}`,
    field: "",
    func: "SUM",
    alias: "",
  });
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [wizard, setWizard] = useState<"A" | "B" | "C" | "D">(hideDatasetTab ? "B" : "A");
  const [wizardStep, setWizardStep] = useState(0);
  const [rawTableData, setRawTableData] = useState<Record<string, unknown>[]>([]);
  const [datasetHasTime, setDatasetHasTime] = useState(true);
  const [timeColumn, setTimeColumn] = useState("");
  const [periodicity, setPeriodicity] = useState("Diaria");
  /** Sobrescrituras de periodicidad por columna (editable en paso Tiempo); se persisten en layout. */
  const [periodicityOverrides, setPeriodicityOverrides] = useState<Record<string, string>>({});
  const [grainOption, setGrainOption] = useState<string>("");
  /** Columnas elegidas cuando el grain es "Personalizado" (clave única = concatenación de estas columnas). */
  const [grainCustomColumns, setGrainCustomColumns] = useState<string[]>([]);
  const [columnRoles, setColumnRoles] = useState<Record<string, { role: ColumnRole; aggregation: string; label: string; visible: boolean; geoType?: GeoType }>>({});
  const [, setCalcType] = useState<"simple" | "count" | "ratio" | "formula">("formula");
  const [metricAdditivity, setMetricAdditivity] = useState<"additive" | "semi" | "non">("additive");
  const [analysisTimeRange, setAnalysisTimeRange] = useState("0");
  const [analysisDateFrom, setAnalysisDateFrom] = useState("");
  const [analysisDateTo, setAnalysisDateTo] = useState("");
  const [analysisGranularity, setAnalysisGranularity] = useState("");
  /** Formato de visualización de fechas en la vista previa (dimensiones temporales). */
  const [analysisDateFormat, setAnalysisDateFormat] = useState<"short" | "monthYear" | "year" | "datetime">("short");
  /** IDs de métricas guardadas seleccionadas para este análisis (wizard C). Si tiene elementos, el payload usa estas en lugar de formMetrics. */
  const [analysisSelectedMetricIds, setAnalysisSelectedMetricIds] = useState<string[]>([]);
  /** En paso B, ratio entre métricas guardadas: IDs de 2+ métricas en orden (metric_0, metric_1, ...). */
  const [formulaFromSavedMetricIds, setFormulaFromSavedMetricIds] = useState<string[]>([]);
  /** Fórmula cuando se usa formulaFromSavedMetricIds (ej. metric_0 / NULLIF(metric_1, 0)). */
  const [formulaFromReuseExpr, setFormulaFromReuseExpr] = useState("metric_0 / NULLIF(metric_1, 0)");
  /** Nombre al guardar un análisis (paso C/D) para el dashboard. */
  const [analysisNameToSave, setAnalysisNameToSave] = useState("");
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [savingDatasetConfig, setSavingDatasetConfig] = useState(false);
  /** Nombre opcional del dataset (paso Publicar); se persiste en la tabla dataset. */
  const [datasetName, setDatasetName] = useState("");
  /** Nombre al guardar una nueva métrica desde el paso B (Preview). */
  const [metricNameToSave, setMetricNameToSave] = useState("");
  /** Lista de datasets (solo cuando hideDatasetTab) para mostrar "Dataset a utilizar" y habilitar/deshabilitar Nueva métrica. */
  const [datasetsList, setDatasetsList] = useState<{ id: string; etl_id: string; name: string | null; etl_title: string | null }[]>([]);
  const [datasetsListLoading, setDatasetsListLoading] = useState(false);
  /** Tras guardar métrica o columna en B, mostrar acciones «Crear otra» / «Ir a Análisis». */
  const [afterSaveInB, setAfterSaveInB] = useState<null | "metric" | "column">(null);
  const [transformCompare, setTransformCompare] = useState<"none" | "mom" | "yoy" | "fixed">("none");
  const [transformCompareFixedValue, setTransformCompareFixedValue] = useState("");
  const [transformShowDelta, setTransformShowDelta] = useState(true);
  const [transformShowDeltaPct, setTransformShowDeltaPct] = useState(true);
  const [transformShowAccum, setTransformShowAccum] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [chartColorScheme, setChartColorScheme] = useState("auto");
  const [chartValueType, setChartValueType] = useState<"number" | "currency" | "percent">("number");
  const [chartValueScale, setChartValueScale] = useState<"none" | "K" | "M" | "BI">("none");
  const [chartCurrencySymbol, setChartCurrencySymbol] = useState("$");
  const [chartThousandSep, setChartThousandSep] = useState(true);
  const [chartDecimals, setChartDecimals] = useState(2);
  const [chartSortDirection, setChartSortDirection] = useState<"none" | "asc" | "desc">("none");
  const [chartSortBy, setChartSortBy] = useState<"series" | "axis">("series");
  const [chartAxisOrder, setChartAxisOrder] = useState<"alpha" | "date_asc" | "date_desc">("alpha");
  const [chartScaleMode, setChartScaleMode] = useState<"auto" | "dataset" | "custom">("auto");
  const [chartScaleMin, setChartScaleMin] = useState<string>("");
  const [chartScaleMax, setChartScaleMax] = useState<string>("");
  const [chartAxisStep, setChartAxisStep] = useState<string>("");
  const [chartRankingEnabled, setChartRankingEnabled] = useState(false);
  const [chartRankingTop, setChartRankingTop] = useState(5);
  const [chartRankingMetric, setChartRankingMetric] = useState("");
  const [chartSortByMetric, setChartSortByMetric] = useState("");
  const [chartPinnedDimensions, setChartPinnedDimensions] = useState<string[]>([]);
  const [chartSeriesColors, setChartSeriesColors] = useState<Record<string, string>>({});
  const [chartLabelOverrides, setChartLabelOverrides] = useState<Record<string, string>>({});
  const [chartMetricFormats, setChartMetricFormats] = useState<Record<string, { valueType?: string; valueScale?: string; currencySymbol?: string; decimals?: number; thousandSep?: boolean }>>({});
  const [chartComboSyncAxes, setChartComboSyncAxes] = useState(false);
  const [chartGridXDisplay, setChartGridXDisplay] = useState(true);
  const [chartGridYDisplay, setChartGridYDisplay] = useState(true);
  const [chartGridColor, setChartGridColor] = useState<string>("");
  const [chartScalePerMetric, setChartScalePerMetric] = useState<Record<string, { min?: number; max?: number; step?: number }>>({});
  const [interCrossFilter, setInterCrossFilter] = useState(true);
  const [interCrossFilterFields, setInterCrossFilterFields] = useState<string[]>([]);
  const [interDrilldown, setInterDrilldown] = useState(false);
  const [interDrilldownHierarchy, setInterDrilldownHierarchy] = useState<string[]>([]);
  const [interDrillThrough, setInterDrillThrough] = useState(false);
  const [interDrillThroughTarget, setInterDrillThroughTarget] = useState("");
  const [interTooltipFields, setInterTooltipFields] = useState<string[]>(["value", "delta_pct"]);
  const [interHighlight, setInterHighlight] = useState(true);

  const setLabelOverride = (oldRaw: string, newRaw: string, display: string) => {
    setChartLabelOverrides((prev) => {
      const next = { ...prev };
      if (oldRaw !== "") delete next[oldRaw];
      if (newRaw !== "") next[newRaw] = display;
      return Object.keys(next).length ? next : {};
    });
  };
  const removeLabelOverride = (raw: string) => {
    setChartLabelOverrides((prev) => {
      const next = { ...prev };
      delete next[raw];
      return next;
    });
  };
  const addLabelOverride = () => {
    setChartLabelOverrides((prev) => ({ ...prev, "": "" }));
  };

  // Dashboard vinculado al ETL
  const [linkedDashboardId, setLinkedDashboardId] = useState<string | null>(null);
  const [dashboardSyncing, setDashboardSyncing] = useState(false);

  // Filtros dinámicos del dashboard (8.1)
  type DynamicFilter = {
    id: string;
    field: string;
    filterType: "single" | "multi" | "dateRange" | "numericRange";
    label: string;
    scope: "all" | "selected";
    scopeMetricIds: string[];
    applyToOtherDashboards: boolean;
  };
  const [dashboardFilters, setDashboardFilters] = useState<DynamicFilter[]>([]);

  const [metricsDistinctColumn, setMetricsDistinctColumn] = useState<string | null>(null);
  const [metricsDistinctValues, setMetricsDistinctValues] = useState<string[]>([]);
  const [metricsDistinctLoading, setMetricsDistinctLoading] = useState(false);
  const [metricsDistinctSearch, setMetricsDistinctSearch] = useState("");
  /** Valores distintos por campo, para selector de valor en filtros (lista seleccionable). */
  const [filterFieldValues, setFilterFieldValues] = useState<Record<string, string[]>>({});
  const [filterFieldLoading, setFilterFieldLoading] = useState<string | null>(null);
  const [filterListOpenId, setFilterListOpenId] = useState<string | null>(null);
  const [filterListSearch, setFilterListSearch] = useState("");
  /** Nivel de jerarquía de fecha por filtro (id del filtro → day|month|quarter|semester|year). */
  const [filterDateLevel, setFilterDateLevel] = useState<Record<string, string>>({});
  const [datasetRelations, setDatasetRelations] = useState<DatasetRelation[]>([]);
  const [relationFormConnectionId, setRelationFormConnectionId] = useState("");
  const [relationFormTableKey, setRelationFormTableKey] = useState("");
  const [relationFormThisColumn, setRelationFormThisColumn] = useState("");
  const [relationFormOtherColumn, setRelationFormOtherColumn] = useState("");
  const [relationFormJoinType, setRelationFormJoinType] = useState<"INNER" | "LEFT">("LEFT");
  const [connectionTables, setConnectionTables] = useState<{ schema: string; name: string; columns: { name: string }[] }[]>([]);
  const [connectionTablesLoading, setConnectionTablesLoading] = useState(false);
  /** Límite de filas para profiling del dataset: 200, 500, 5000, 200k, 500k o "unlimited" (muestra completa en backend). */
  const [profileRowLimit, setProfileRowLimit] = useState<200 | 500 | 5000 | 200000 | 500000 | "unlimited">(500);
  const [otherTableColumnsLoaded, setOtherTableColumnsLoaded] = useState<string[]>([]);
  const [otherTableColumnsLoading, setOtherTableColumnsLoading] = useState(false);
  const formulaInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [formulasHelpOpen, setFormulasHelpOpen] = useState(false);
  /** Columnas calculadas (ej. factura = CANTIDAD * PRECIO_UNITARIO); se guardan en dataset y aparecen como medidas. */
  const [derivedColumns, setDerivedColumns] = useState<DerivedColumn[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "metric"; id: string; name: string } | { type: "derived"; name: string } | null>(null);

  const WIZARD_STEPS: Record<"A" | "B" | "C" | "D", string[]> = {
    A: ["Profiling", "Grain", "Tiempo", "Roles BI", "Relaciones", "Publicar"],
    B: ["Cálculo", "Propiedades", "Filtros base", "Preview"],
    C: ["Identidad", "Métricas", "Dimensiones y Tiempo", "Filtros", "Transformaciones", "Preview"],
    D: ["Tipo visual", "Mapeo", "Formato y colores", "Guardar"],
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for accessibility or future step indicator
  const _currentStepLabel = WIZARD_STEPS[wizard][wizardStep];
  const totalStepsInWizard = WIZARD_STEPS[wizard].length;
  const canPrev = wizard !== "A" || wizardStep > 0;
  const isLastStep = wizard === "D" && wizardStep === totalStepsInWizard - 1;
  const canNext = wizardStep < totalStepsInWizard - 1 || (wizard !== "D" || !isLastStep);
  const isGrainStep = wizard === "A" && wizardStep === 1;
  const hasValidGrain = (grainOption !== "" && grainOption !== "_custom") || (grainOption === "_custom" && grainCustomColumns.length > 0);
  const goNext = () => {
    if (wizardStep < totalStepsInWizard - 1) setWizardStep((s) => s + 1);
    else if (wizard === "A") { setWizard("B"); setWizardStep(0); }
    else if (wizard === "B") { setWizard("C"); setWizardStep(0); }
    else if (wizard === "C") { setWizard("D"); setWizardStep(0); }
  };
  const goPrev = () => {
    if (wizardStep > 0) setWizardStep((s) => s - 1);
    else if (wizard === "B") { if (hideDatasetTab) return; setWizard("A"); setWizardStep(WIZARD_STEPS.A.length - 1); }
    else if (wizard === "C") { setWizard("B"); setWizardStep(WIZARD_STEPS.B.length - 1); }
    else if (wizard === "D") { setWizard("C"); setWizardStep(WIZARD_STEPS.C.length - 1); }
  };

  const fetchData = useCallback(async (opts?: { silent?: boolean; sampleRows?: number; unlimited?: boolean; bustCache?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      // Pedir muestra para Profiling; unlimited=1 usa techo alto en backend; sampleRows hasta 1M
      const unlimited = opts?.unlimited === true;
      const sampleRows = opts?.sampleRows ?? 500;
      const cappedSample = Math.min(1_000_000, Math.max(0, sampleRows));
      let url = unlimited
        ? `/api/etl/${etlId}/metrics-data?unlimited=1`
        : `/api/etl/${etlId}/metrics-data?sampleRows=${cappedSample}`;
      if (opts?.bustCache) url += `&_t=${Date.now()}`;
      const res = await fetch(url);
      const json = await safeJsonResponse<MetricsDataResponse>(res);
      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.data ? "Error al cargar datos" : (json as { error?: string }).error ?? "Error");
        return;
      }
      setData(json.data);
      setEtlData(buildEtlDataFromMetricsResponse(json.data));
      // Nueva referencia para forzar re-render y evitar caché en la tabla
      setRawTableData(Array.isArray(json.data?.rawRows) ? [...json.data.rawRows] : []);
    } catch {
      toast.error("Error al cargar métricas");
    } finally {
      setLoading(false);
    }
  }, [etlId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // En modo datasetOnly, abrir el wizard cuando haya datos
  useEffect(() => {
    if (datasetOnly && data?.hasData) setShowForm(true);
  }, [datasetOnly, data?.hasData]);

  // Entrada directa por query param ?step=A|B|C|D (Dataset, Métrica, Análisis, Gráfico) — ignorar si hideDatasetTab y step A
  useEffect(() => {
    const step = searchParams.get("step");
    if (step === "A" || step === "B" || step === "C" || step === "D") {
      if (hideDatasetTab && step === "A") return;
      setWizard(step);
      setWizardStep(0);
    }
  }, [searchParams, hideDatasetTab]);

  // En página de métricas (hideDatasetTab), cargar lista de datasets para "Dataset a utilizar" y habilitar/deshabilitar Nueva métrica
  useEffect(() => {
    if (!hideDatasetTab) return;
    setDatasetsListLoading(true);
    fetch("/api/admin/datasets")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok && Array.isArray(json.data?.datasets)) {
          setDatasetsList(
            json.data.datasets.map((d: { id: string; etl_id: string; name: string | null; etl_title: string | null }) => ({
              id: d.id,
              etl_id: d.etl_id,
              name: d.name,
              etl_title: d.etl_title,
            }))
          );
        } else {
          setDatasetsList([]);
        }
      })
      .catch(() => setDatasetsList([]))
      .finally(() => setDatasetsListLoading(false));
  }, [hideDatasetTab]);

  useEffect(() => {
    if (!showForm || !(data?.hasData ?? false) || rawTableData.length > 1) return;
    fetchData({ silent: true, sampleRows: 500 });
  }, [showForm, data?.hasData, rawTableData.length, fetchData]);

  useEffect(() => {
    const overrides = data?.dateColumnPeriodicityOverrides;
    if (overrides && typeof overrides === "object" && Object.keys(overrides).length >= 0)
      setPeriodicityOverrides({ ...overrides });
  }, [data?.dateColumnPeriodicityOverrides]);

  const dashboardHydratedRef = useRef(false);
  useEffect(() => {
    if (dashboardHydratedRef.current) return;
    const d = data as { linkedDashboardId?: string; dashboardFilters?: unknown[] } | null | undefined;
    if (d?.linkedDashboardId) { setLinkedDashboardId(d.linkedDashboardId); dashboardHydratedRef.current = true; }
    if (Array.isArray(d?.dashboardFilters) && d.dashboardFilters.length > 0) setDashboardFilters(d.dashboardFilters as Parameters<typeof setDashboardFilters>[0]);
  }, [data]);

  const datasetConfigHydratedRef = useRef(false);
  useEffect(() => {
    const cfg = data?.datasetConfig;
    if (!cfg || typeof cfg !== "object") return;
    if (!datasetConfigHydratedRef.current) {
      datasetConfigHydratedRef.current = true;
      if (typeof cfg.grainOption === "string" && cfg.grainOption) setGrainOption(cfg.grainOption as string);
      if (Array.isArray(cfg.grainCustomColumns)) setGrainCustomColumns(cfg.grainCustomColumns as string[]);
      if (typeof cfg.datasetHasTime === "boolean") setDatasetHasTime(cfg.datasetHasTime);
      if (typeof cfg.timeColumn === "string" && cfg.timeColumn) setTimeColumn(cfg.timeColumn);
      if (typeof cfg.periodicity === "string" && cfg.periodicity) setPeriodicity(cfg.periodicity);
      if (cfg.periodicityOverrides != null && typeof cfg.periodicityOverrides === "object") setPeriodicityOverrides(cfg.periodicityOverrides as Record<string, string>);
      if (cfg.columnRoles && typeof cfg.columnRoles === "object") setColumnRoles(cfg.columnRoles as Record<string, { role: ColumnRole; aggregation: string; label: string; visible: boolean; geoType?: GeoType }>);
      if (Array.isArray(cfg.datasetRelations)) setDatasetRelations(cfg.datasetRelations as DatasetRelation[]);
    }
    if (Array.isArray((cfg as { derivedColumns?: DerivedColumn[] }).derivedColumns)) setDerivedColumns((cfg as { derivedColumns: DerivedColumn[] }).derivedColumns);
  }, [data?.datasetConfig]);

  /** Construye el objeto completo de configuración del dataset desde el estado actual (para persistir y reutilizar). */
  const buildFullDatasetConfig = useCallback((): Record<string, unknown> => {
    return {
      grainOption,
      grainCustomColumns,
      datasetHasTime,
      timeColumn,
      periodicity,
      periodicityOverrides: Object.keys(periodicityOverrides).length ? periodicityOverrides : undefined,
      columnRoles: Object.keys(columnRoles).length ? columnRoles : undefined,
      datasetRelations: datasetRelations.length ? datasetRelations : undefined,
      derivedColumns: derivedColumns.map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" })),
    };
  }, [grainOption, grainCustomColumns, datasetHasTime, timeColumn, periodicity, periodicityOverrides, columnRoles, datasetRelations, derivedColumns]);

  /** Guarda la configuración del dataset en el servidor y luego pasa al wizard de Métrica o redirige a Datasets (según datasetOnly). */
  const saveDatasetConfigAndGoToMetric = useCallback(async () => {
    setSavingDatasetConfig(true);
    try {
      const datasetConfig = buildFullDatasetConfig();
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetConfig,
          ...(datasetName.trim() && { datasetName: datasetName.trim() }),
        }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        toast.error(json?.error ?? "Error al guardar la configuración del dataset");
        return;
      }
      if (json.datasetListUpdated === false) {
        toast.warning("Configuración guardada; la lista de Datasets no se pudo actualizar (revisar tabla en Supabase).");
      } else {
        toast.success("Configuración del dataset guardada. Podés crear métricas sin volver a configurar.");
      }
      setData((prev) => (prev ? { ...prev, datasetConfig: datasetConfig as Record<string, unknown> } : null));
      if (datasetOnly) {
        if (onDatasetSaved) {
          onDatasetSaved();
        } else {
          router.push("/admin/datasets");
        }
      } else {
        setWizard("B");
        setWizardStep(0);
      }
    } catch {
      toast.error("Error al guardar la configuración del dataset");
    } finally {
      setSavingDatasetConfig(false);
    }
  }, [etlId, buildFullDatasetConfig, datasetOnly, router, datasetName, onDatasetSaved]);

  const connectionOptions = connectionsProp.map((c) => ({ value: String(c.id), label: `${c.title || c.id} (${c.type || ""})` }));

  useEffect(() => {
    if (!relationFormConnectionId) {
      setConnectionTables([]);
      setRelationFormTableKey("");
      return;
    }
    setConnectionTablesLoading(true);
    setRelationFormTableKey("");
    type MetadataRes = { metadata?: { tables?: { schema?: string; name?: string; columns?: { name: string }[] }[] } };
    fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: relationFormConnectionId, discoverTables: true }),
    })
      .then((r) => safeJsonResponse<MetadataRes>(r))
      .then((json) => {
        if (json?.metadata?.tables && Array.isArray(json.metadata.tables)) {
          setConnectionTables(
            json.metadata.tables.map((t) => ({
              schema: t.schema ?? "",
              name: t.name ?? "",
              columns: t.columns ?? [],
            }))
          );
        } else {
          setConnectionTables([]);
        }
      })
      .catch(() => setConnectionTables([]))
      .finally(() => setConnectionTablesLoading(false));
  }, [relationFormConnectionId]);

  const loadTableColumns = useCallback((connId: string, tableKey: string): Promise<string[]> => {
    if (!tableKey) return Promise.resolve([]);
    type MetadataRes = { metadata?: { tables?: { schema?: string; name?: string; columns?: { name: string }[] }[] } };
    return fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: connId, tableName: tableKey }),
    })
      .then((r) => safeJsonResponse<MetadataRes>(r))
      .then((json) => {
        if (json?.metadata?.tables?.[0]?.columns) {
          return json.metadata.tables[0].columns.map((c) => c.name);
        }
        return [] as string[];
      })
      .catch(() => [] as string[]);
  }, []);

  useEffect(() => {
    if (!relationFormConnectionId || !relationFormTableKey) {
      setOtherTableColumnsLoaded([]);
      return;
    }
    setOtherTableColumnsLoading(true);
    loadTableColumns(relationFormConnectionId, relationFormTableKey)
      .then((cols) => setOtherTableColumnsLoaded(cols || []))
      .catch(() => setOtherTableColumnsLoaded([]))
      .finally(() => setOtherTableColumnsLoading(false));
  }, [relationFormConnectionId, relationFormTableKey, loadTableColumns]);

  const addRelation = () => {
    if (!relationFormConnectionId || !relationFormTableKey || !relationFormThisColumn || !relationFormOtherColumn) {
      toast.error("Completá conexión, tabla y ambas columnas.");
      return;
    }
    const conn = connectionsProp.find((c) => String(c.id) === relationFormConnectionId);
    const tableLabel = connectionTables.find(
      (t) => `${t.schema}.${t.name}` === relationFormTableKey || t.name === relationFormTableKey
    )
      ? `${relationFormTableKey}`
      : relationFormTableKey;
    setDatasetRelations((prev) => [
      ...prev,
      {
        id: `rel-${Date.now()}`,
        connectionId: relationFormConnectionId,
        connectionTitle: conn?.title || relationFormConnectionId,
        tableKey: relationFormTableKey,
        tableLabel,
        thisColumn: relationFormThisColumn,
        otherColumn: relationFormOtherColumn,
        joinType: relationFormJoinType,
      },
    ]);
    setRelationFormConnectionId("");
    setRelationFormTableKey("");
    setRelationFormThisColumn("");
    setRelationFormOtherColumn("");
    setRelationFormJoinType("LEFT");
    setConnectionTables([]);
    toast.success("Relación agregada");
  };

  const removeRelation = (id: string) => {
    setDatasetRelations((prev) => prev.filter((r) => r.id !== id));
  };

  // Refrescar datos del ETL al entrar al paso Profiling (Dataset) para mostrar filas/columnas actualizadas (solo fetchData aquí; fetchPreview se usa en un useEffect más abajo)
  useEffect(() => {
    if (wizard === "A" && wizardStep === 0 && showForm) {
      fetchData({ silent: true, sampleRows: 500 });
    }
  }, [wizard, wizardStep, showForm, fetchData]);

  // Auto-seleccionar "No aditiva (ratio)" cuando la fórmula del paso Cálculo contiene división
  useEffect(() => {
    if (wizard !== "B" || wizardStep !== 1) return;
    const expr = (formMetrics[0] as { expression?: string })?.expression ?? "";
    if (expr.includes("/")) setMetricAdditivity("non");
  }, [wizard, wizardStep, formMetrics]);

  // Refrescar al volver a la pestaña (p. ej. después de ejecutar el ETL en otra pestaña)
  useEffect(() => {
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchData({ silent: true, sampleRows: 500 });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchData]);

  useEffect(() => {
    const allFields = data?.fields?.all ?? [];
    if (allFields.length > 0 && Object.keys(columnRoles).length === 0) {
      const numeric = new Set(data?.fields?.numeric ?? []);
      const date = new Set(data?.fields?.date ?? []);
      const initial: Record<string, { role: ColumnRole; aggregation: string; label: string; visible: boolean; geoType?: GeoType }> = {};
      allFields.forEach((f) => {
        let role: ColumnRole = "dimension";
        let aggregation = "—";
        let geoType: GeoType | undefined;
        if (date.has(f)) role = "time";
        else if (numeric.has(f)) { role = "measure"; aggregation = "sum"; }
        else {
          const suggested = suggestGeoTypeByColumnName(f);
          if (suggested != null) { role = "geo"; geoType = suggested; }
        }
        initial[f] = { role, aggregation, label: f, visible: true, ...(geoType != null && { geoType }) };
      });
      setColumnRoles(initial);
    }
  }, [data?.fields?.all, data?.fields?.numeric, data?.fields?.date]);

  const dateFields = data?.fields?.date ?? [];
  const getEffectivePeriodicity = (col: string) =>
    periodicityOverrides[col] ?? data?.dateColumnPeriodicity?.[col] ?? "Irregular";

  useEffect(() => {
    if (dateFields.length === 0) {
      setDatasetHasTime(false);
    } else {
      if (!timeColumn) {
        const first = dateFields[0];
        setTimeColumn(first);
        setPeriodicity(getEffectivePeriodicity(first));
      }
    }
  }, [dateFields.length, timeColumn, data?.dateColumnPeriodicity, periodicityOverrides]);

  useEffect(() => {
    if (timeColumn && dateFields.includes(timeColumn)) setPeriodicity(getEffectivePeriodicity(timeColumn));
  }, [timeColumn, periodicityOverrides, data?.dateColumnPeriodicity]);

  const dateDimsInForm = formDimensions.filter((d) => d && dateFields.includes(d));
  useEffect(() => {
    if (dateDimsInForm.length > 0 && (!timeColumn || !dateDimsInForm.includes(timeColumn))) setTimeColumn(dateDimsInForm[0]!);
  }, [dateDimsInForm.join(",")]);

  const savedMetrics = (data?.savedMetrics ?? []) as SavedMetricForm[];

  const hasData = data?.hasData ?? false;
  /** Dataset del ETL actual (solo cuando hideDatasetTab); si no existe, deshabilitar "Nueva métrica" y mostrar CTA a Datasets. */
  const currentDataset = hideDatasetTab ? datasetsList.find((d) => d.etl_id === etlId) : null;
  const fields = data?.fields?.all ?? [];
  /** Columnas marcadas como measure en Rol BI; usadas para fórmulas y cálculos. */
  const baseMeasureColumns = fields.filter((c) => (columnRoles[c]?.role ?? "dimension") === "measure");
  /** Medidas = columnas Rol BI measure + columnas calculadas (derivadas) para usar en fórmulas y métricas. */
  const measureColumns = useMemo(() => [...baseMeasureColumns, ...derivedColumns.map((d) => d.name)], [baseMeasureColumns, derivedColumns]);
  /** Mapa nombre → expresión para resolver una columna derivada al armar el payload. */
  const derivedColumnsByName = useMemo(() => Object.fromEntries(derivedColumns.map((d) => [d.name, d])), [derivedColumns]);
  /** Columnas del dataset para Rol BI: físicas + calculadas (las calculadas aparecen como measure por defecto). */
  const allColumnsForRoles = useMemo(() => [...fields, ...derivedColumns.map((d) => d.name)], [fields, derivedColumns]);
  /** Columnas para Profiling: físicas + calculadas (en calculadas la celda muestra "—" porque no están en rawTableData). */
  const displayColumnsForProfiling = useMemo(() => [...fields, ...derivedColumns.map((d) => d.name)], [fields, derivedColumns]);

  const dateFieldSet = new Set(data?.fields?.date ?? []);
  const numericFieldSet = new Set(data?.fields?.numeric ?? []);

  /** Obtiene el valor de una columna en una fila (misma resolución que la tabla: col, col con _, etc.). */
  const getRowValue = useCallback((row: Record<string, unknown>, col: string): unknown => {
    if (derivedColumnsByName[col]) return undefined;
    const keys = Object.keys(row);
    if (row[col] !== undefined && row[col] !== null) return row[col];
    const colNorm = col.replace(/\./g, "_").toLowerCase();
    const key = keys.find((k) => k.replace(/\./g, "_").toLowerCase() === colNorm);
    if (key !== undefined) return row[key];
    const withUnderscore = col.replace(/\./g, "_");
    if (row[withUnderscore] !== undefined && row[withUnderscore] !== null) return row[withUnderscore];
    if (row[withUnderscore.toLowerCase()] !== undefined && row[withUnderscore.toLowerCase()] !== null) return row[withUnderscore.toLowerCase()];
    return undefined;
  }, [derivedColumnsByName]);

  /** Columnas que en la muestra tienen 100% de valores únicos (sugerencia orientativa para Grain). */
  const suggestedUniqueColumns = useMemo(() => {
    if (rawTableData.length === 0) return new Set<string>();
    const set = new Set<string>();
    for (const f of fields) {
      if (derivedColumnsByName[f]) continue;
      const vals = rawTableData.map((r) => getRowValue(r as Record<string, unknown>, f));
      const uniq = new Set(vals.map((v) => String(v ?? "")));
      if (uniq.size === rawTableData.length) set.add(f);
    }
    return set;
  }, [fields, rawTableData, getRowValue, derivedColumnsByName]);

  /** Valida el grain seleccionado: cuenta duplicados en la muestra. { duplicateRows, uniqueKeys } o null si no hay grain válido. */
  const grainValidation = useMemo(() => {
    const cols = grainOption === "_custom" ? grainCustomColumns : grainOption ? [grainOption] : [];
    if (cols.length === 0 || rawTableData.length === 0) return null;
    const keys = rawTableData.map((r) =>
      cols.map((c) => String(getRowValue(r as Record<string, unknown>, c) ?? "\x00")).join("\x01")
    );
    const uniqueKeys = new Set(keys).size;
    const duplicateRows = keys.length - uniqueKeys;
    return { duplicateRows, uniqueKeys, totalRows: keys.length };
  }, [grainOption, grainCustomColumns, rawTableData, getRowValue]);

  /** True si la expresión usa funciones de agregación (SUM, AVERAGE, COUNTIF, etc.). No debe crearse como columna. */
  const expressionHasAggregation = useCallback((expr: string) => {
    const t = (expr || "").trim();
    return Array.from(AGGREGATE_FUNCTION_NAMES).some((fn) => new RegExp(`\\b${fn}\\s*\\(`, "i").test(t));
  }, []);

  /** Validación de sintaxis de la fórmula: paréntesis balanceados e identificadores válidos (columnas o funciones conocidas). */
  const formulaSyntaxError = useMemo(() => {
    const expr = (formMetrics[0] as { expression?: string })?.expression?.trim() ?? "";
    if (!expr) return null;
    let depth = 0;
    let inQuote: string | null = null;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (inQuote) {
        if (c === inQuote && expr[i - 1] !== "\\") inQuote = null;
        continue;
      }
      if (c === "'" || c === '"') { inQuote = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth < 0) return "Paréntesis de cierre ) sin apertura."; }
    }
    if (depth !== 0) return "Faltan paréntesis de cierre.";
    const allowedChars = /^[a-zA-Z0-9_*+\-/().,\s'"%;^=<>!]+$/;
    if (!allowedChars.test(expr)) return "La fórmula contiene caracteres no permitidos. Usá columnas, números, operadores ( * - + / ^ ) y comparaciones (=, <, >, <>, !=).";
    const columnsSet = new Set([...fields, ...derivedColumns.map((d) => d.name)].map((x) => x.toLowerCase()));
    const savedMetricNamesSet = new Set((data?.savedMetrics ?? []).map((s: { name?: string }) => (s.name ?? "").toLowerCase()));
    const protectedStr = expr.replace(/'([^']*)'|"([^"]*)"/g, " __STR__ ");
    const prefixedCols = protectedStr.match(/\b(primary\.[a-zA-Z_][a-zA-Z0-9_]*|join_\d+\.[a-zA-Z_][a-zA-Z0-9_]*)\b/g) ?? [];
    const restStr = protectedStr.replace(/\b(primary\.[a-zA-Z_][a-zA-Z0-9_]*|join_\d+\.[a-zA-Z_][a-zA-Z0-9_]*)\b/g, " ");
    const simpleWords = restStr.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) ?? [];
    const words = [...prefixedCols, ...simpleWords];
    for (const w of words) {
      if (/^\d+\.?\d*$/.test(w)) continue;
      const upper = w.toUpperCase();
      if (KNOWN_FORMULA_IDENTIFIERS.has(upper)) continue;
      if (columnsSet.has(w.toLowerCase())) continue;
      if (savedMetricNamesSet.has(w.toLowerCase())) continue;
      return `«${w}» no es una columna del dataset ni una función conocida. Revisá el nombre o usá «Insertar métrica guardada».`;
    }
    return null;
  }, [formMetrics, fields, derivedColumns, data?.savedMetrics]);

  /** Error de sintaxis del nombre de columna (alias): solo letras, números y _. */
  const aliasSyntaxError = useMemo(() => {
    const alias = (formMetrics[0]?.alias ?? "").trim();
    if (!alias) return null;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) return "El nombre de la columna solo puede tener letras, números y _ (ej. total_linea).";
    return null;
  }, [formMetrics]);

  /** Seguridad de granularidad (Grain Safety): para crear columna, la expresión no debe depender de resultados agregados (metric_0, metric_1, ...). */
  const grainSafetyErrorForColumn = useMemo(() => {
    const expr = (formMetrics[0] as { expression?: string })?.expression?.trim() ?? "";
    if (!expr) return null;
    if (/\bmetric_\d+\b/i.test(expr)) return "Seguridad de granularidad: la expresión no puede depender de métricas agregadas (metric_0, metric_1, …). Creá una columna solo con columnas del dataset y funciones por fila.";
    return null;
  }, [formMetrics]);

  const getColumnDisplayKey = (col: string): string => {
    const cd = data?.columnDisplay;
    if (!cd) return col;
    if (cd[col] !== undefined) return col;
    const found = Object.keys(cd).find((k) => k.toLowerCase() === col.toLowerCase());
    return found ?? col;
  };

  const getSampleDisplayLabel = (col: string): string => {
    const key = getColumnDisplayKey(col);
    const label = data?.columnDisplay?.[key]?.label?.trim();
    return label || col;
  };

  const getFilterSelectedValues = (f: AggregationFilterEdit): string[] =>
    Array.isArray(f.value) ? f.value : (f.value != null && f.value !== "" ? [String(f.value)] : []);

  /** Etiqueta para mostrar en listas de medidas: columnas base o "nombre (calculada)" si es derivada. */
  const getMeasureColumnLabel = (col: string): string =>
    derivedColumnsByName[col] ? `${col} (calculada)` : getSampleDisplayLabel(col);

  /** Para fechas ISO en UTC (ej. 2025-10-01T00:00:00.000Z) usa componentes UTC para mostrar la fecha de calendario correcta (1/10, no 30/09 en UTC-3). */
  const dateComponents = (date: Date, value: unknown): { d: number; m: number; y: number; monthIndex: number } => {
    const isIsoDateOnly =
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}/.test(value.trim()) &&
      (value.length === 10 || /T00:00:00(\.0*)?Z?$/i.test(value.trim()));
    if (isIsoDateOnly) {
      return { d: date.getUTCDate(), m: date.getUTCMonth() + 1, y: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
    }
    return { d: date.getDate(), m: date.getMonth() + 1, y: date.getFullYear(), monthIndex: date.getMonth() };
  };

  const formatNumber = useCallback((v: unknown): string => {
    if (v == null) return "—";
    const n = typeof v === "number" ? v : Number(v);
    if (isNaN(n)) return String(v);
    let val = n;
    let suffix = "";
    if (chartValueScale === "K" && Math.abs(n) >= 1000) { val = n / 1_000; suffix = "K"; }
    else if (chartValueScale === "M" && Math.abs(n) >= 1_000_000) { val = n / 1_000_000; suffix = "M"; }
    else if (chartValueScale === "M" && Math.abs(n) >= 1000) { val = n / 1_000; suffix = "K"; }
    else if (chartValueScale === "BI" && Math.abs(n) >= 1_000_000_000) { val = n / 1_000_000_000; suffix = "BI"; }
    else if (chartValueScale === "BI" && Math.abs(n) >= 1_000_000) { val = n / 1_000_000; suffix = "M"; }
    else if (chartValueScale === "BI" && Math.abs(n) >= 1000) { val = n / 1_000; suffix = "K"; }
    const formatted = new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: chartDecimals,
      useGrouping: chartThousandSep,
    }).format(val);
    if (chartValueType === "percent") return `${formatted}${suffix}%`;
    if (chartValueType === "currency") return `${chartCurrencySymbol}${formatted}${suffix}`;
    return `${formatted}${suffix}`;
  }, [chartValueType, chartValueScale, chartDecimals, chartThousandSep, chartCurrencySymbol]);

  /** Formatea un valor de celda como fecha en la vista previa cuando la columna es de tipo fecha (dimensión temporal o columna fecha). */
  const formatPreviewDateValue = useCallback(
    (value: unknown, columnKey: string): string | null => {
      if (value == null || value === "") return null;
      const isDateCol =
        (timeColumn && (columnKey === timeColumn || columnKey.trim().toLowerCase() === timeColumn.trim().toLowerCase())) ||
        dateFields.some((f) => f.trim().toLowerCase() === (columnKey || "").trim().toLowerCase());
      if (!isDateCol) {
        const s = String(value).trim();
        if (!/^\d{4}-\d{2}-\d{2}/.test(s) && !/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return null;
      }
      let date: Date | null = null;
      if (value instanceof Date) date = value;
      else if (typeof value === "string") date = new Date(value);
      else if (typeof value === "number") date = value > 1e10 ? new Date(value) : new Date(1899, 11, 30 + (value | 0));
      if (!date || isNaN(date.getTime())) return null;
      const pad = (n: number) => String(n).padStart(2, "0");
      const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      if (analysisDateFormat === "short") return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
      if (analysisDateFormat === "monthYear") return `${months[date.getMonth()]} ${date.getFullYear()}`;
      if (analysisDateFormat === "year") return String(date.getFullYear());
      if (analysisDateFormat === "datetime") return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    },
    [timeColumn, dateFields, analysisDateFormat]
  );

  const formatSampleCell = (col: string, value: unknown): string => {
    if (value === null || value === undefined) return "";
    const key = getColumnDisplayKey(col);
    const format = data?.columnDisplay?.[key]?.format?.trim();
    const isDate = dateFieldSet.has(col) || [...dateFieldSet].some((f) => f.toLowerCase() === col.toLowerCase());
    const isNumber = numericFieldSet.has(col) || [...numericFieldSet].some((f) => f.toLowerCase() === col.toLowerCase());
    if (isDate && format) {
      let date: Date | null = null;
      if (value instanceof Date) date = value;
      else if (typeof value === "string") date = new Date(value);
      else if (typeof value === "number") date = value > 1e10 ? new Date(value) : new Date(1899, 11, 30 + (value | 0));
      if (date && !isNaN(date.getTime())) {
        const { d, m, y, monthIndex } = dateComponents(date, value);
        const pad = (n: number) => String(n).padStart(2, "0");
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        if (format === "DD/MM/YYYY") return `${pad(d)}/${pad(m)}/${y}`;
        if (format === "MM/DD/YYYY") return `${pad(m)}/${pad(d)}/${y}`;
        if (format === "YYYY-MM-DD") return `${y}-${pad(m)}-${pad(d)}`;
        if (format === "DD-MM-YYYY") return `${pad(d)}-${pad(m)}-${y}`;
        if (format === "DD MMM YYYY") return `${pad(d)} ${months[monthIndex]} ${y}`;
      }
    }
    if (isNumber && (typeof value === "number" || (typeof value === "string" && /^-?\d+([.,]\d+)?$/.test(String(value).trim())))) {
      const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
      if (!Number.isNaN(num)) {
        if (format === "currency") return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
        if (format === "percent") return new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num / 100);
        if (format === "number") return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
      }
    }
    return String(value);
  };

  const openNew = () => {
    setEditingId(null);
    setFormName("");
    setFormChartType("bar");
    setFormDimensions([]);
    setFormMetrics([{ id: `m-${Date.now()}`, field: "", func: "SUM", alias: "resultado", expression: "" } as AggregationMetricEdit]);
    setFormFilters([]);
    setFormOrderBy(null);
    setFormLimit(100);
    setFormMetric({ id: `m-${Date.now()}`, field: "", func: "SUM", alias: "resultado" });
    setCalcType("formula");
    setPreviewData(null);
    setGrainOption("");
    setGrainCustomColumns([]);
    setWizard("A");
    setWizardStep(0);
    setShowForm(true);
  };

  const openEdit = (saved: SavedMetricForm) => {
    setEditingId(saved.id);
    setFormName(saved.name);
    const cfg = saved.aggregationConfig as SavedMetricAggregationConfig | undefined;
    setFormChartType((cfg as { chartType?: string })?.chartType ?? (saved as { chartType?: string }).chartType ?? "bar");
    if (cfg) {
      const dims = Array.isArray(cfg.dimensions) ? cfg.dimensions : [cfg.dimension, cfg.dimension2].filter((d): d is string => typeof d === "string" && d !== "");
      setFormDimensions(dims.length > 0 ? dims : []);
      setFormMetrics((cfg.metrics ?? [saved.metric]).map((m) => ({ ...m, id: m.id || `m-${Date.now()}-${Math.random().toString(36).slice(2)}` })));
      setFormFilters((cfg.filters ?? []).map((f) => ({ ...f, id: f.id || `f-${Date.now()}-${Math.random().toString(36).slice(2)}` })));
      setFormOrderBy(cfg.orderBy ?? null);
      setFormLimit(cfg.limit ?? 100);
      setChartXAxis(cfg.chartXAxis ?? "");
      setChartYAxes(Array.isArray(cfg.chartYAxes) ? cfg.chartYAxes : []);
      setChartSeriesField(cfg.chartSeriesField ?? "");
      const cfgFormat = cfg as { chartValueType?: string; chartValueScale?: string; chartNumberFormat?: string };
      if (cfgFormat.chartValueType != null && ["number", "currency", "percent"].includes(String(cfgFormat.chartValueType))) {
        setChartValueType(cfgFormat.chartValueType as "number" | "currency" | "percent");
      } else {
        const legacy = cfgFormat.chartNumberFormat;
        if (legacy === "currency" || legacy === "percent") {
          setChartValueType(legacy as "currency" | "percent");
        } else {
          setChartValueType("number");
        }
      }
      if (cfgFormat.chartValueScale != null && ["none", "K", "M", "BI"].includes(String(cfgFormat.chartValueScale))) {
        setChartValueScale(cfgFormat.chartValueScale as "none" | "K" | "M" | "BI");
      } else {
        const legacy = cfgFormat.chartNumberFormat;
        if (legacy === "K" || legacy === "M" || legacy === "BI") {
          setChartValueScale(legacy as "K" | "M" | "BI");
        } else {
          setChartValueScale("none");
        }
      }
      setChartCurrencySymbol(cfg.chartCurrencySymbol ?? "$");
      setChartThousandSep(cfg.chartThousandSep !== false);
      setChartDecimals(cfg.chartDecimals ?? 2);
      setChartSortDirection(
        (["none", "asc", "desc"] as const).includes(cfg.chartSortDirection as "none" | "asc" | "desc")
          ? (cfg.chartSortDirection as "none" | "asc" | "desc")
          : "none"
      );
      setChartSortBy((["series", "axis"] as const).includes(cfg.chartSortBy as "series" | "axis") ? (cfg.chartSortBy as "series" | "axis") : "series");
      setChartSortByMetric(typeof (cfg as Record<string, unknown>).chartSortByMetric === "string" ? (cfg as Record<string, unknown>).chartSortByMetric as string : "");
      setChartAxisOrder((["alpha", "date_asc", "date_desc"] as const).includes(cfg.chartAxisOrder as "alpha" | "date_asc" | "date_desc") ? (cfg.chartAxisOrder as "alpha" | "date_asc" | "date_desc") : "alpha");
      setChartScaleMode((["auto", "dataset", "custom"] as const).includes(cfg.chartScaleMode as "auto" | "dataset" | "custom") ? (cfg.chartScaleMode as "auto" | "dataset" | "custom") : "auto");
      setChartScaleMin(typeof cfg.chartScaleMin === "string" || typeof cfg.chartScaleMin === "number" ? String(cfg.chartScaleMin) : "");
      setChartScaleMax(typeof cfg.chartScaleMax === "string" || typeof cfg.chartScaleMax === "number" ? String(cfg.chartScaleMax) : "");
      setChartAxisStep(typeof cfg.chartAxisStep === "string" || typeof cfg.chartAxisStep === "number" ? String(cfg.chartAxisStep) : "");
      setChartRankingEnabled(!!cfg.chartRankingEnabled);
      setChartRankingTop(cfg.chartRankingTop ?? 5);
      setChartRankingMetric(cfg.chartRankingMetric ?? "");
      setChartPinnedDimensions(Array.isArray(cfg.chartPinnedDimensions) ? cfg.chartPinnedDimensions : []);
      setChartColorScheme(cfg.chartColorScheme ?? "auto");
      setChartSeriesColors(cfg.chartSeriesColors && typeof cfg.chartSeriesColors === "object" ? cfg.chartSeriesColors : {});
      setChartLabelOverrides(cfg.chartLabelOverrides && typeof cfg.chartLabelOverrides === "object" ? cfg.chartLabelOverrides : {});
      setChartMetricFormats(cfg.chartMetricFormats && typeof cfg.chartMetricFormats === "object" ? cfg.chartMetricFormats : {});
      setChartComboSyncAxes(!!cfg.chartComboSyncAxes);
      setChartGridXDisplay(cfg.chartGridXDisplay !== false);
      setChartGridYDisplay(cfg.chartGridYDisplay !== false);
      setChartGridColor(typeof cfg.chartGridColor === "string" ? cfg.chartGridColor : "");
      setChartScalePerMetric(cfg.chartScalePerMetric && typeof cfg.chartScalePerMetric === "object" ? cfg.chartScalePerMetric : {});
      setShowDataLabels(!!cfg.showDataLabels);
      setInterCrossFilter(cfg.interCrossFilter !== false);
      setInterCrossFilterFields(Array.isArray(cfg.interCrossFilterFields) ? cfg.interCrossFilterFields : []);
      setInterDrilldown(!!cfg.interDrilldown);
      setInterDrilldownHierarchy(Array.isArray(cfg.interDrilldownHierarchy) ? cfg.interDrilldownHierarchy : []);
      setInterDrillThrough(!!cfg.interDrillThrough);
      setInterDrillThroughTarget(cfg.interDrillThroughTarget ?? "");
      setInterTooltipFields(Array.isArray(cfg.interTooltipFields) ? cfg.interTooltipFields : ["value", "delta_pct"]);
      setInterHighlight(cfg.interHighlight !== false);
      const dateRange = (cfg as { dateRangeFilter?: { field: string; last?: number; unit?: string; from?: string; to?: string } }).dateRangeFilter;
      const dateCol = (cfg as { dateDimension?: string; timeColumn?: string }).dateDimension ?? (cfg as { timeColumn?: string }).timeColumn;
      if (typeof dateCol === "string" && dateCol) setTimeColumn(dateCol);
      const gran = (cfg as { dateGroupByGranularity?: string }).dateGroupByGranularity;
      if (gran && ["day", "week", "month", "quarter", "semester", "year"].includes(gran)) setAnalysisGranularity(gran);
      if (dateRange?.from != null && dateRange?.to != null) {
        setAnalysisTimeRange("custom");
        setAnalysisDateFrom(String(dateRange.from));
        setAnalysisDateTo(String(dateRange.to));
      } else if (dateRange?.last != null && dateRange?.unit) {
        setAnalysisTimeRange(String(dateRange.last));
        setAnalysisDateFrom("");
        setAnalysisDateTo("");
      } else {
        setAnalysisTimeRange("0");
        setAnalysisDateFrom("");
        setAnalysisDateTo("");
      }
      const first = (cfg.metrics ?? [saved.metric])[0];
      setFormMetric(first ? { ...first, id: first.id || `m-${Date.now()}` } : { id: `m-${Date.now()}`, field: "", func: "SUM", alias: "" });
    } else {
      setFormDimensions([]);
      setFormMetrics([{ ...saved.metric, id: saved.metric.id || `m-${Date.now()}` }]);
      setFormFilters([]);
      setFormOrderBy(null);
      setFormLimit(100);
      setChartXAxis("");
      setChartYAxes([]);
      setChartSeriesField("");
      setChartValueType("number");
      setChartValueScale("none");
      setChartCurrencySymbol("$");
      setChartThousandSep(true);
      setChartDecimals(2);
      setChartSortDirection("none");
      setChartSortBy("series");
      setChartRankingEnabled(false);
      setChartRankingTop(5);
      setChartRankingMetric("");
      setChartSortByMetric("");
      setChartPinnedDimensions([]);
      setChartColorScheme("auto");
      setChartSeriesColors({});
      setChartLabelOverrides({});
      setChartMetricFormats({});
      setShowDataLabels(false);
      setInterCrossFilter(true);
      setInterCrossFilterFields([]);
      setInterDrilldown(false);
      setInterDrilldownHierarchy([]);
      setInterDrillThrough(false);
      setInterDrillThroughTarget("");
      setInterTooltipFields(["value", "delta_pct"]);
      setInterHighlight(true);
      setFormMetric({ ...saved.metric, id: saved.metric.id || `m-${Date.now()}` });
    }
    setPreviewData(null);
    setShowForm(true);
  };

  const tableNameForPreview = data?.schema && data?.tableName ? `${data.schema}.${data.tableName}` : null;

  /** En Análisis (C) o Gráfico (D): envía todas las métricas de cada tarjeta (bases + fórmula) para que las fórmulas tengan metric_0, metric_1, etc. disponibles. Fórmulas se reescriben con índices globales. */
  const effectiveFormMetrics = useMemo((): AggregationMetricEdit[] => {
    if ((wizard === "C" || wizard === "D") && analysisSelectedMetricIds.length > 0) {
      const selected = analysisSelectedMetricIds
        .map((id) => savedMetrics.find((s) => String(s.id) === String(id)))
        .filter((s): s is SavedMetricForm => s != null);
      const out: AggregationMetricEdit[] = [];
      const norm = (a: string) => (a || "").trim().toLowerCase();
      let globalIndex = 0;
      for (const s of selected) {
        const cfg = s.aggregationConfig;
        const list = cfg?.metrics?.length ? cfg.metrics : (s.metric ? [s.metric] : []);
        const start = globalIndex;
        const savedName = (s.name || "").trim();
        const resultIdx = list.findIndex((m) => norm((m as { alias?: string }).alias ?? "") === norm(savedName));
        const displayIdx = resultIdx >= 0 ? resultIdx : list.length - 1;
        for (let i = 0; i < list.length; i++) {
          const m = { ...list[i], id: (list[i] as { id?: string }).id ?? `${s.id}-${i}` } as AggregationMetricEdit;
          if (i === displayIdx && savedName) m.alias = savedName;
          const formula = (m as { formula?: string }).formula?.trim();
          if (formula) {
            let rewritten = formula;
            for (let k = list.length - 1; k >= 0; k--)
              rewritten = rewritten.replace(new RegExp(`metric_${k}\\b`, "gi"), `metric_${start + k}`);
            (m as { formula?: string }).formula = rewritten;
          }
          out.push(m);
          globalIndex++;
        }
      }
      return out;
    }
    if (wizard === "B" && formulaFromSavedMetricIds.length >= 2) {
      const ordered = formulaFromSavedMetricIds
        .map((id) => savedMetrics.find((s) => String(s.id) === String(id)))
        .filter((s): s is SavedMetricForm => s != null);
      if (ordered.length >= 2) {
        const baseMetrics = ordered.flatMap((s) => {
          const cfg = s.aggregationConfig;
          const list = cfg?.metrics?.length ? cfg.metrics : (s.metric ? [s.metric] : []);
          return list.map((m, i) => ({ ...(m as object), id: (m as { id?: string }).id || `${s.id}-${i}` }));
        }) as AggregationMetricEdit[];
        return [...baseMetrics, { formula: formulaFromReuseExpr, func: "FORMULA", alias: formName } as AggregationMetricEdit];
      }
    }
    return formMetrics;
  }, [wizard, analysisSelectedMetricIds, savedMetrics, formMetrics, formulaFromSavedMetricIds, formulaFromReuseExpr, formName]);

  /** En wizard C/D: un alias de columna a mostrar por cada métrica guardada seleccionada (nombre de la tarjeta o alias del resultado). */
  const analysisDisplayMetricAliases = useMemo((): string[] => {
    if ((wizard !== "C" && wizard !== "D") || analysisSelectedMetricIds.length === 0) return [];
    const norm = (a: string) => (a || "").trim().toLowerCase();
    return analysisSelectedMetricIds
      .map((id) => savedMetrics.find((s) => String(s.id) === String(id)))
      .filter((s): s is SavedMetricForm => s != null)
      .map((s) => {
        const list = s.aggregationConfig?.metrics?.length ? s.aggregationConfig.metrics : (s.metric ? [s.metric] : []);
        const savedName = (s.name || "").trim();
        const byName = list.find((m) => norm((m as { alias?: string }).alias ?? "") === norm(savedName));
        const resultMetric = byName ?? list[list.length - 1];
        return savedName || ((resultMetric as { alias?: string })?.alias ?? (resultMetric as { field?: string })?.field ?? "");
      })
      .filter(Boolean);
  }, [wizard, analysisSelectedMetricIds, savedMetrics]);

  const fetchPreview = useCallback(async () => {
    if (effectiveFormMetrics.length === 0) return;
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      type MetricsDataRes = { data?: { schema?: string; tableName?: string; datasetConfig?: { derivedColumns?: { name: string; expression: string; defaultAggregation?: string }[]; derived_columns?: { name: string; expression: string; default_aggregation?: string }[] } } };
      const metricsRes = await fetch(`/api/etl/${etlId}/metrics-data`);
      const metricsJson = await safeJsonResponse<MetricsDataRes>(metricsRes);
      const freshSchema = metricsJson?.data?.schema;
      const freshTableName = metricsJson?.data?.tableName;
      const tableName = freshSchema && freshTableName ? `${freshSchema}.${freshTableName}` : tableNameForPreview;
      if (!tableName) {
        toast.error("No hay tabla de datos. Ejecutá el ETL y recargá la página.");
        return;
      }
      let freshDerived: { name: string; expression: string; defaultAggregation?: string }[] | null = null;
      const cfg = metricsJson?.data?.datasetConfig;
      if (Array.isArray(cfg?.derivedColumns)) freshDerived = cfg.derivedColumns as { name: string; expression: string; defaultAggregation?: string }[];
      else if (Array.isArray((cfg as { derived_columns?: { name: string; expression: string; default_aggregation?: string }[] })?.derived_columns))
        freshDerived = ((cfg as { derived_columns: { name: string; expression: string; default_aggregation?: string }[] }).derived_columns).map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.default_aggregation || "SUM" }));
      if (!freshDerived?.length && (formMetrics.some((m) => m.field && !(m as { expression?: string }).expression) || derivedColumns.length > 0)) {
        try {
          type MetricsApiRes = { data?: { datasetConfig?: { derivedColumns?: { name: string; expression: string; defaultAggregation?: string }[] } } };
          const metricsApiRes = await fetch(`/api/etl/${etlId}/metrics`);
          const metricsApiJson = await safeJsonResponse<MetricsApiRes>(metricsApiRes);
          const fromMetrics = metricsApiJson?.data?.datasetConfig?.derivedColumns;
          if (Array.isArray(fromMetrics) && fromMetrics.length > 0) freshDerived = fromMetrics as { name: string; expression: string; defaultAggregation?: string }[];
        } catch {
          // ignore
        }
      }
      const fromApi: DerivedColumn[] = (freshDerived ?? []).map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation ?? "SUM" }));
      if (fromApi.length > 0) setDerivedColumns(fromApi);
      const mergedByName = new Map<string, DerivedColumn>();
      for (const d of derivedColumns) mergedByName.set(d.name.toLowerCase(), { name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" });
      for (const d of fromApi) mergedByName.set(d.name.toLowerCase(), { name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" });
      const derivedToSend = Array.from(mergedByName.values());
      const derivedByNameForPayload = Object.fromEntries(derivedToSend.map((d) => [d.name.toLowerCase(), d]));
      const savedByName = (name: string) => savedMetrics.find((s) => (s.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase());
      const getSavedFirstMetric = (s: SavedMetricForm) => (s.aggregationConfig?.metrics?.[0] ?? (s as { metric?: { field?: string; func?: string; alias?: string; expression?: string } }).metric) as { field?: string; func?: string; alias?: string; expression?: string } | undefined;
      const metricsPayload = effectiveFormMetrics.map((m) => {
        const rawExpr = ((m as { expression?: string }).expression ?? "").trim();
        let fieldStr = m.field != null ? String(m.field).trim() : "";
        let func = m.func;
        const derived = fieldStr ? derivedByNameForPayload[fieldStr.toLowerCase()] ?? derivedColumnsByName[fieldStr] : undefined;
        let effectiveExpr = rawExpr || derived?.expression || "";
        const savedByField = fieldStr ? savedByName(fieldStr) : undefined;
        const savedByExpr = rawExpr && !derived ? savedByName(rawExpr) : undefined;
        if (savedByField && !effectiveExpr) {
          const first = getSavedFirstMetric(savedByField);
          if (first) {
            const ex = (first as { expression?: string }).expression?.trim();
            const f = String((first as { field?: string }).field ?? "").trim();
            if (ex) effectiveExpr = ex;
            if (f && f.toLowerCase() !== (savedByField.name || "").trim().toLowerCase()) fieldStr = f;
            if (first.func) func = first.func;
          }
        }
        if (savedByExpr && rawExpr === rawExpr.trim() && !derived && savedByName(rawExpr)) {
          const first = getSavedFirstMetric(savedByExpr);
          if (first) {
            const ex = (first as { expression?: string }).expression?.trim();
            const f = String((first as { field?: string }).field ?? "").trim();
            if (ex) effectiveExpr = ex;
            else if (f) effectiveExpr = f;
            if (f && !fieldStr) fieldStr = f;
            if (first.func) func = first.func;
          }
        }
        return {
          field: fieldStr || "",
          func,
          alias: m.alias || m.field || fieldStr || "valor",
          ...(m.condition ? { condition: m.condition } : {}),
          ...(m.formula ? { formula: m.formula } : {}),
          ...(effectiveExpr ? { expression: effectiveExpr } : {}),
        };
      });
      const body: Record<string, unknown> = {
        tableName,
        etlId,
        dimensions: formDimensions.length > 0 ? formDimensions.filter(Boolean) : undefined,
        metrics: metricsPayload,
        filters: formFilters.length ? formFilters.map((f) => ({ field: f.field, operator: Array.isArray(f.value) ? "IN" : f.operator, value: f.value })) : undefined,
        orderBy: formOrderBy?.field ? formOrderBy : undefined,
        unlimited: true,
        ...(formLimit != null && formLimit > 0 ? { limit: formLimit } : {}),
      };
      if (derivedToSend.length > 0) {
        body.derivedColumns = derivedToSend.map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" }));
      }
      const includePeriodInResult = formDimensions.some((d) => d && String(d).trim() === timeColumn);
      if (wizard === "C" && timeColumn) {
        if (analysisTimeRange === "custom" && analysisDateFrom && analysisDateTo) {
          body.dateRangeFilter = { field: timeColumn, from: analysisDateFrom, to: analysisDateTo };
        } else if (analysisTimeRange && analysisTimeRange !== "0") {
          const rangeNum = Number(analysisTimeRange);
          if (rangeNum > 0) {
            const unit = analysisTimeRange === "7" || analysisTimeRange === "30" ? "days" : "months";
            body.dateRangeFilter = { field: timeColumn, last: rangeNum, unit };
          }
        }
        // Si no se elige rango (valor "0" o vacío), no se envía dateRangeFilter: se traen todos los datos.
        if (analysisGranularity && includePeriodInResult) {
          body.dateGroupBy = { field: timeColumn, granularity: analysisGranularity };
        }
      }
      if (wizard === "C" && transformCompare !== "none") {
        if (transformCompare === "mom") {
          body.comparePeriod = "previous_month";
          body.dateDimension = timeColumn || undefined;
        }
        if (transformCompare === "yoy") {
          body.comparePeriod = "previous_year";
          body.dateDimension = timeColumn || undefined;
        }
        if (transformCompare === "fixed") {
          const fixed = parseFloat(transformCompareFixedValue);
          if (Number.isFinite(fixed)) body.compareFixedValue = fixed;
        }
      }
      const res = await fetch("/api/dashboard/aggregate-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok) {
        const msg = (json?.error ?? "Error al cargar previsualización") as string;
        toast.error(msg);
        return;
      }
      setPreviewData(Array.isArray(json) ? json : []);
    } catch {
      toast.error("Error al cargar vista previa");
    } finally {
      setPreviewLoading(false);
    }
  }, [etlId, tableNameForPreview, formDimensions, effectiveFormMetrics, formFilters, formOrderBy, formLimit, fetchData, derivedColumnsByName, derivedColumns, wizard, timeColumn, analysisGranularity, analysisTimeRange, analysisDateFrom, analysisDateTo, transformCompare, transformCompareFixedValue, savedMetrics]);

  const fetchPreviewRef = useRef(fetchPreview);
  fetchPreviewRef.current = fetchPreview;

  // Refrescar previsualización solo una vez al entrar al paso de vista previa (wizard C, paso 5). No incluir fetchPreview en deps para evitar bucle infinito.
  const prevWizardStepRef = useRef<{ wizard: string; wizardStep: number; showForm: boolean }>({ wizard: "", wizardStep: -1, showForm: false });
  useEffect(() => {
    const now = wizard === "C" && wizardStep === 5 && showForm;
    const prev = prevWizardStepRef.current;
    const wasAlreadyHere = prev.wizard === "C" && prev.wizardStep === 5 && prev.showForm;
    prevWizardStepRef.current = { wizard, wizardStep, showForm };
    if (now && !wasAlreadyHere) {
      fetchPreviewRef.current();
    }
  }, [wizard, wizardStep, showForm]);

  /** Única fuente de sugerencias de tipo de gráfico según métricas, dimensiones y datos (evitar duplicar lógica en otros pasos). */
  const { recommendationText, suggestedChartType } = useMemo(() => {
    const hasDim = formDimensions.filter(Boolean).length > 0;
    const dimCount = formDimensions.filter(Boolean).length;
    const metricCount = effectiveFormMetrics.length;
    const hasTimeConfig = !!timeColumn && !!analysisGranularity;
    const firstDim = formDimensions[0] ?? "";
    const firstDimIsDate = !!firstDim && dateFields.includes(firstDim);
    const isTimeSeriesStrict = hasTimeConfig && (!hasDim || firstDim === timeColumn || firstDimIsDate);
    const hasTransformCompare = transformCompare === "mom" || transformCompare === "yoy";
    const previewRows = previewData?.length ?? 0;
    const geoKeywords = /lat|lng|lon|geo|country|pais|ciudad|city|region|provincia|estado|state|zip|postal|coord/i;
    const hasGeoDim = formDimensions.some((d) => geoKeywords.test(d));

    if (!hasDim && metricCount === 0) return { recommendationText: "Elegí al menos una métrica; las dimensiones son opcionales (sin dimensión = KPI único).", suggestedChartType: "bar" };
    if (!hasDim && metricCount >= 1) return { recommendationText: "Un solo valor numérico sin dimensiones: recomendamos **KPI** para destacar el número.", suggestedChartType: "kpi" };
    if (hasGeoDim) return { recommendationText: "Dimensión geográfica detectada: recomendamos **Mapa** para visualizar distribución espacial.", suggestedChartType: "map" };
    if (dimCount >= 1 && previewRows <= 6 && metricCount === 1) return { recommendationText: "Pocas categorías (" + previewRows + " filas): recomendamos **Circular** o **Dona** para distribución, o **Barras** para comparar.", suggestedChartType: "pie" };
    if (dimCount >= 1 && previewRows > 12) return { recommendationText: "Muchas categorías (" + previewRows + " filas): recomendamos **Barras horizontales** o **Tabla** para mejor lectura.", suggestedChartType: "horizontalBar" };
    if (hasDim && metricCount >= 2 && !isTimeSeriesStrict) return { recommendationText: "Varias métricas con categorías: recomendamos **Combo** (barras + línea) o **Tabla** para comparar.", suggestedChartType: "combo" };
    if (isTimeSeriesStrict && hasTransformCompare && metricCount >= 1) return { recommendationText: "Serie temporal con comparación: recomendamos **Combo** (barras para valor actual, línea para período anterior).", suggestedChartType: "combo" };
    if (isTimeSeriesStrict && metricCount === 1) return { recommendationText: "Serie temporal con una métrica: recomendamos **Líneas** para ver la tendencia, o **Área** para resaltar volumen.", suggestedChartType: "line" };
    if (isTimeSeriesStrict && metricCount > 1) return { recommendationText: "Serie temporal con varias métricas: recomendamos **Combo** (barras + línea) para comparar escalas.", suggestedChartType: "combo" };
    if (hasDim && metricCount === 1) return { recommendationText: "Una dimensión y un valor: recomendamos **Barras** para comparar categorías.", suggestedChartType: "bar" };
    return { recommendationText: "Seleccioná el tipo de gráfico que mejor represente tu análisis.", suggestedChartType: "bar" };
  }, [formDimensions, effectiveFormMetrics, timeColumn, analysisGranularity, transformCompare, previewData, dateFields]);

  /** Restricciones por datos: sin rol Geo no permitir Mapa; con dimensión no permitir KPI. */
  const chartTypeRestrictions = useMemo(() => {
    const hasDim = formDimensions.filter(Boolean).length > 0;
    const geoKeywords = /lat|lng|lon|geo|country|pais|ciudad|city|region|provincia|estado|state|zip|postal|coord/i;
    const hasGeo = formDimensions.some((d) => columnRoles[d]?.role === "geo" || geoKeywords.test(d));
    return { hasDimension: hasDim, hasGeo };
  }, [formDimensions, columnRoles]);

  const chartAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (wizard === "D" && wizardStep === 0 && !chartAutoSelectedRef.current) {
      chartAutoSelectedRef.current = true;
      setFormChartType(suggestedChartType);
    }
    if (wizard !== "D") chartAutoSelectedRef.current = false;
  }, [wizard, wizardStep, suggestedChartType]);

  useEffect(() => {
    if (wizard !== "D" || wizardStep !== 0) return;
    const { hasDimension, hasGeo } = chartTypeRestrictions;
    if (formChartType === "kpi" && hasDimension) setFormChartType(suggestedChartType);
    if (formChartType === "map" && !hasGeo) setFormChartType(suggestedChartType);
  }, [wizard, wizardStep, formChartType, chartTypeRestrictions, suggestedChartType]);

  /** Filas de vista previa con orden y Top N aplicados (misma lógica que el gráfico). Usar en tabla y en previewChartConfig. */
  const previewProcessedRows = useMemo(() => {
    if (!previewData || previewData.length === 0) return [];
    const first = previewData[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    const xKey = chartXAxis && keys.includes(chartXAxis) ? chartXAxis : (() => {
      const firstDim = formDimensions[0];
      if (firstDim && keys.includes(firstDim)) return firstDim;
      if (timeColumn && keys.includes(timeColumn)) return timeColumn;
      const dimByNorm = (k: string) => timeColumn && k.trim().toLowerCase() === timeColumn.trim().toLowerCase();
      const timeMatch = keys.find(dimByNorm);
      if (timeMatch) return timeMatch;
      const metricKeys = keys.filter((k) => /^metric_\d+$/.test(k));
      return metricKeys.length === keys.length ? undefined : keys[0];
    })();
    let yKeys = chartYAxes.filter((k) => keys.includes(k));
    if (yKeys.length === 0) {
      yKeys = effectiveFormMetrics.map((m) => m.alias || m.field || "").filter(Boolean).filter((k) => keys.includes(k));
    }
    if (yKeys.length === 0) {
      yKeys = xKey != null ? keys.filter((k) => k !== xKey) : keys.filter((k) => /^metric_\d+$/.test(k));
    }
    if (yKeys.length === 0) return [...previewData];
    let rows = [...previewData];
    if (chartSortBy === "axis" && xKey) {
      rows.sort((a, b) => {
        const va = (a as Record<string, unknown>)[xKey];
        const vb = (b as Record<string, unknown>)[xKey];
        const sa = String(va ?? "");
        const sb = String(vb ?? "");
        if (chartAxisOrder === "date_asc" || chartAxisOrder === "date_desc") {
          const ta = typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : 0;
          const tb = typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : 0;
          return chartAxisOrder === "date_asc" ? ta - tb : tb - ta;
        }
        return chartAxisOrder === "alpha" ? sa.localeCompare(sb, undefined, { numeric: true }) : sb.localeCompare(sa, undefined, { numeric: true });
      });
    } else if (chartSortDirection !== "none" && xKey && chartSortBy === "series") {
      let sortKey = yKeys[0]!;
      if (chartSortByMetric) {
        if (keys.includes(chartSortByMetric)) sortKey = chartSortByMetric;
        else {
          const metricMatch = chartSortByMetric.match(/^metric_(\d+)$/);
          if (metricMatch) {
            const idx = parseInt(metricMatch[1]!, 10);
            const resolved = yKeys[idx];
            if (resolved != null && keys.includes(resolved)) sortKey = resolved;
          }
        }
      }
      rows.sort((a, b) => {
        const va = Number((a as Record<string, unknown>)[sortKey] ?? 0);
        const vb = Number((b as Record<string, unknown>)[sortKey] ?? 0);
        return chartSortDirection === "asc" ? va - vb : vb - va;
      });
    }
    const isTimeSeriesX = !!xKey && (xKey === timeColumn || timeColumn?.trim().toLowerCase() === xKey.trim().toLowerCase() || dateFields.some((f) => f.trim().toLowerCase() === (xKey || "").trim().toLowerCase()));
    if (chartRankingEnabled && chartRankingTop > 0 && !isTimeSeriesX) {
      let rKey = yKeys[0]!;
      if (chartRankingMetric) {
        if (keys.includes(chartRankingMetric)) rKey = chartRankingMetric;
        else {
          const metricMatch = chartRankingMetric.match(/^metric_(\d+)$/);
          if (metricMatch) {
            const idx = parseInt(metricMatch[1]!, 10);
            const resolved = yKeys[idx];
            if (resolved != null && keys.includes(resolved)) rKey = resolved;
          }
        }
      }
      rows.sort((a, b) => Number((b as Record<string, unknown>)[rKey] ?? 0) - Number((a as Record<string, unknown>)[rKey] ?? 0));
      rows = rows.slice(0, chartRankingTop);
    }
    return rows;
  }, [previewData, formDimensions, effectiveFormMetrics, chartXAxis, chartYAxes, chartSortDirection, chartSortBy, chartSortByMetric, chartAxisOrder, chartRankingEnabled, chartRankingTop, chartRankingMetric, timeColumn, dateFields]);

  const previewChartConfig = useMemo(() => {
    if (!previewProcessedRows || previewProcessedRows.length === 0) return null;
    const first = previewProcessedRows[0] as Record<string, unknown>;
    const keys = Object.keys(first);

    const xKey = chartXAxis && keys.includes(chartXAxis) ? chartXAxis : (() => {
      const firstDim = formDimensions[0];
      if (firstDim && keys.includes(firstDim)) return firstDim;
      if (timeColumn && keys.includes(timeColumn)) return timeColumn;
      const dimByNorm = (k: string) => timeColumn && k.trim().toLowerCase() === timeColumn.trim().toLowerCase();
      const timeMatch = keys.find(dimByNorm);
      if (timeMatch) return timeMatch;
      const metricKeys = keys.filter((k) => /^metric_\d+$/.test(k));
      return metricKeys.length === keys.length ? undefined : keys[0];
    })();

    let yKeys = chartYAxes.filter((k) => keys.includes(k));
    if (yKeys.length === 0) {
      yKeys = effectiveFormMetrics.map((m) => m.alias || m.field || "").filter(Boolean).filter((k) => keys.includes(k));
    }
    if (yKeys.length === 0) {
      yKeys = xKey != null ? keys.filter((k) => k !== xKey) : keys.filter((k) => /^metric_\d+$/.test(k));
    }
    if (yKeys.length === 0) return null;

    const defaultPalette = [
      "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
      "#06b6d4", "#84cc16", "#eab308", "#dc2626", "#a855f7", "#d946ef", "#0d9488", "#ea580c",
      "#2563eb", "#16a34a", "#ca8a04", "#b91c1c", "#7c3aed", "#c026d3", "#0f766e", "#c2410c",
    ];
    const colLabel = (k: string) => {
      const match = k.match(/^metric_(\d+)$/);
      if (match) {
        const idx = parseInt(match[1]!, 10);
        const m = effectiveFormMetrics[idx];
        return m ? (m.alias || m.field || k) : k;
      }
      return k;
    };
    const colorKeys = Object.keys(chartSeriesColors);
    const getColor = (label: string, idx: number) => {
      const byLabel = chartSeriesColors[label] ?? chartSeriesColors[label?.trim?.() ?? ""];
      if (byLabel) return byLabel;
      if (colorKeys[idx] != null) return chartSeriesColors[colorKeys[idx]!]!;
      return defaultPalette[idx % defaultPalette.length]!;
    };
    const getColorByLabelStable = (label: string) => {
      const byLabel = chartSeriesColors[label] ?? chartSeriesColors[label?.trim?.() ?? ""];
      if (byLabel) return byLabel;
      let hash = 0;
      const s = String(label ?? "");
      for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
      const idx = Math.abs(hash) % defaultPalette.length;
      return defaultPalette[idx]!;
    };

    const rows = previewProcessedRows;

    const formatLabel = (v: unknown, colKey: string) => {
      const formatted = formatPreviewDateValue(v, colKey);
      return formatted ?? String(v ?? "");
    };
    const labelOverride = (v: string) => {
      if (!chartLabelOverrides || Object.keys(chartLabelOverrides).length === 0) return v;
      const s = String(v ?? "").trim();
      if (s === "") return v;
      if (s in chartLabelOverrides) return chartLabelOverrides[s];
      for (const [k, val] of Object.entries(chartLabelOverrides)) {
        if (String(k).trim() === s) return val;
      }
      return v;
    };

    if (chartSeriesField && keys.includes(chartSeriesField) && xKey) {
      const seriesValues = [...new Set(rows.map((r) => String((r as Record<string, unknown>)[chartSeriesField] ?? "")))];
      const xValuesRaw = [...new Set(rows.map((r) => (r as Record<string, unknown>)[xKey]))];
      const xValues = xValuesRaw.map((xv) => String(xv ?? ""));
      const labels = xValues.map((xv) => labelOverride(formatLabel(xv, xKey)));
      const datasets = seriesValues.flatMap((sv, svIdx) =>
        yKeys.map((yKey, yIdx) => {
          const label = `${labelOverride(sv)} (${colLabel(yKey)})`;
          const color = getColor(label, svIdx * yKeys.length + yIdx);
          return {
            label,
            data: xValues.map((xv) => {
              const row = rows.find((r) => String((r as Record<string, unknown>)[xKey] ?? "") === xv && String((r as Record<string, unknown>)[chartSeriesField] ?? "") === sv);
              return row ? Number((row as Record<string, unknown>)[yKey] ?? 0) : 0;
            }),
            backgroundColor: color + "99",
            borderColor: color,
            borderWidth: 1,
          };
        })
      );
      return { labels, datasets };
    }

    const labels = xKey != null ? rows.map((r) => labelOverride(formatLabel((r as Record<string, unknown>)[xKey], xKey))) : rows.map((_, i) => (i === 0 ? "Total" : ""));
    const datasets = yKeys.map((alias, idx) => {
      const label = colLabel(alias);
      const color = getColor(label, idx);
      const isBarOrHorizontalBar = formChartType === "bar" || formChartType === "horizontalBar";
      const oneMetricManyCategories = isBarOrHorizontalBar && yKeys.length === 1 && labels.length > 0;
      const barColors = oneMetricManyCategories
        ? labels.map((l) => getColorByLabelStable(l))
        : null;
      return {
        label,
        data: rows.map((r) => Number((r as Record<string, unknown>)[alias] ?? 0)),
        backgroundColor: barColors ? barColors.map((c) => c + "99") : color + "99",
        borderColor: barColors ? barColors : color,
        borderWidth: 1,
      };
    });

    if (formChartType === "combo" && yKeys.length >= 2) {
      return {
        labels,
        datasets: [
          { ...datasets[0], type: "bar" as const, yAxisID: "y" },
          { ...datasets[1], type: "line" as const, fill: false, yAxisID: "y1" },
        ],
      };
    }

    if (formChartType === "pie" || formChartType === "doughnut") {
      const yKey = yKeys[0]!;
      const sliceColors = labels.map((label) => getColorByLabelStable(label));
      const hoverColors = sliceColors.map((c) => {
        const hex = String(c).replace(/^#/, "");
        if (hex.length >= 6) {
          const r = Math.min(255, (parseInt(hex.slice(0, 2), 16) || 0) + 28);
          const g = Math.min(255, (parseInt(hex.slice(2, 4), 16) || 0) + 28);
          const b = Math.min(255, (parseInt(hex.slice(4, 6), 16) || 0) + 28);
          return `rgb(${r},${g},${b})`;
        }
        return c;
      });
      return {
        labels,
        datasets: [{
          label: colLabel(yKey),
          data: rows.map((r) => Number((r as Record<string, unknown>)[yKey] ?? 0)),
          backgroundColor: sliceColors,
          hoverBackgroundColor: hoverColors,
          borderColor: "#fff",
          borderWidth: 2,
        }],
      };
    }

    return { labels, datasets };
  }, [previewProcessedRows, formDimensions, effectiveFormMetrics, chartXAxis, chartYAxes, chartSeriesField, chartSeriesColors, formChartType, timeColumn, formatPreviewDateValue, dateFields, chartLabelOverrides]);

  const previewKpiValue = useMemo(() => {
    if (!previewData || previewData.length === 0 || !previewChartConfig) return undefined;
    const firstNum = previewChartConfig.datasets[0]?.data?.[0];
    return firstNum != null ? firstNum : undefined;
  }, [previewData, previewChartConfig]);

  /** Resultado principal del cálculo (paso Cálculo): valor de la última métrica = fórmula o métrica principal. La API devuelve metric_0, metric_1, ... */
  const previewCalculationResult = useMemo(() => {
    if (!previewData || previewData.length === 0 || effectiveFormMetrics.length === 0) return undefined;
    const row = previewData[0] as Record<string, unknown>;
    const lastKey = `metric_${effectiveFormMetrics.length - 1}`;
    const val = row[lastKey];
    if (val != null && typeof val === "number" && !Number.isNaN(val)) return val;
    for (let i = effectiveFormMetrics.length - 1; i >= 0; i--) {
      const v = row[`metric_${i}`];
      if (v != null && typeof v === "number" && !Number.isNaN(v)) return v;
    }
    return undefined;
  }, [previewData, effectiveFormMetrics.length]);

  /** Solo columnas solicitadas: dimensiones + métricas elegidas (+ columnas de comparación si aplica). En C/D usamos un alias por tarjeta (analysisDisplayMetricAliases). */
  const previewVisibleKeys = useMemo(() => {
    if (!previewData?.[0]) return [];
    const row = previewData[0] as Record<string, unknown>;
    const rowKeysSet = new Set(Object.keys(row));
    const requested: string[] = [];
    for (const d of formDimensions) {
      if (d && rowKeysSet.has(d)) requested.push(d);
    }
    const metricAliases =
      (wizard === "C" || wizard === "D") && analysisDisplayMetricAliases.length > 0
        ? analysisDisplayMetricAliases
        : effectiveFormMetrics.map((m) => (m.alias || m.field || "valor").trim()).filter(Boolean);
    for (const alias of metricAliases) {
      if (rowKeysSet.has(alias)) requested.push(alias);
    }
    if (transformCompare === "mom" || transformCompare === "yoy") {
      for (const alias of metricAliases) {
        if (transformShowDeltaPct && rowKeysSet.has(`${alias}_delta_pct`)) requested.push(`${alias}_delta_pct`);
        if (transformShowDelta && rowKeysSet.has(`${alias}_delta`)) requested.push(`${alias}_delta`);
        if (transformShowAccum && rowKeysSet.has(`${alias}_acumulado`)) requested.push(`${alias}_acumulado`);
        if (rowKeysSet.has(`${alias}_prev`)) requested.push(`${alias}_prev`);
      }
    }
    if (transformCompare === "fixed") {
      for (const alias of metricAliases) {
        if (rowKeysSet.has(`${alias}_vs_fijo`)) requested.push(`${alias}_vs_fijo`);
        if (rowKeysSet.has(`${alias}_var_pct_fijo`)) requested.push(`${alias}_var_pct_fijo`);
      }
    }
    return requested;
  }, [previewData, formDimensions, wizard, analysisDisplayMetricAliases, effectiveFormMetrics, transformCompare, transformShowDelta, transformShowDeltaPct, transformShowAccum]);

  const chartAvailableColumns = useMemo(() => {
    if (!previewData?.[0]) return [];
    return previewVisibleKeys.map((k) => {
      const match = k.match(/^metric_(\d+)$/);
      let label = k;
      if (match) {
        const idx = parseInt(match[1]!, 10);
        const m = effectiveFormMetrics[idx];
        label = m ? (m.alias || m.field || k) : k;
      }
      return { key: k, label };
    });
  }, [previewVisibleKeys, previewData, effectiveFormMetrics]);

  const chartDimensionColumns = useMemo(() => chartAvailableColumns.filter((c) => {
    if (/^metric_\d+/.test(c.key)) return false;
    if (c.key.endsWith("_prev") || c.key.endsWith("_delta") || c.key.endsWith("_delta_pct") || c.key.endsWith("_acumulado") || c.key.endsWith("_vs_fijo") || c.key.endsWith("_var_pct_fijo")) return false;
    const norm = (s: string) => (s || "").trim().toLowerCase();
    if (formDimensions.some((d) => norm(d) === norm(c.key))) return true;
    if (timeColumn && norm(timeColumn) === norm(c.key)) return true;
    if (dateFields.some((f) => norm(f) === norm(c.key))) return true;
    return false;
  }), [chartAvailableColumns, formDimensions, timeColumn, dateFields]);

  const chartNumericColumns = useMemo(() => {
    const isDimensionKey = (key: string) => chartDimensionColumns.some((d) => d.key === key);
    const isTransformCol = (key: string) =>
      key.endsWith("_prev") || key.endsWith("_delta") || key.endsWith("_delta_pct") || key.endsWith("_acumulado") || key.endsWith("_vs_fijo") || key.endsWith("_var_pct_fijo");
    return chartAvailableColumns.filter((c) => {
      if (/^metric_\d+/.test(c.key)) return true;
      const metricAliases = effectiveFormMetrics.map((m) => m.alias || m.field || "").filter(Boolean);
      if (metricAliases.includes(c.key)) return true;
      if (isTransformCol(c.key)) return true;
      if (!isDimensionKey(c.key)) return true;
      return false;
    });
  }, [chartAvailableColumns, effectiveFormMetrics, chartDimensionColumns]);

  const lastChartTypeForMappingRef = useRef<string | null>(null);
  useEffect(() => {
    if (wizard !== "D" || wizardStep !== 1) return;
    const dims = chartDimensionColumns;
    const nums = chartNumericColumns;
    const chartTypeChanged = lastChartTypeForMappingRef.current !== formChartType;
    lastChartTypeForMappingRef.current = formChartType;
    const emptyMapping = !chartXAxis && chartYAxes.length === 0;
    if (!chartTypeChanged && !emptyMapping) return;
    if (dims.length === 0 && nums.length === 0) return;

    if (formChartType === "kpi") {
      setChartXAxis("");
      setChartYAxes(nums.length ? [nums[0]!.key] : []);
      setChartSeriesField("");
    } else if (formChartType === "map") {
      const geoCol = dims.find((c) => columnRoles[c.key]?.role === "geo") ?? dims[0];
      setChartXAxis(geoCol?.key ?? "");
      setChartYAxes(nums.length ? nums.slice(0, 2).map((c) => c.key) : []);
      setChartSeriesField("");
    } else {
      if (!chartXAxis && dims.length > 0) setChartXAxis(dims[0]!.key);
      if (chartYAxes.length === 0 && nums.length > 0) setChartYAxes(nums.slice(0, Math.min(3, nums.length)).map((c) => c.key));
      if (dims.length >= 2 && !chartSeriesField) setChartSeriesField(dims[1]!.key);
    }
  }, [wizard, wizardStep, formChartType, chartDimensionColumns, chartNumericColumns, chartXAxis, chartYAxes.length, chartSeriesField, columnRoles]);

  /** Encabezados para la tabla de previsualización: metric_0 → alias de la métrica (estilo Excel). */
  const previewDisplayHeaders = useMemo(() => {
    if (!previewData?.[0] || effectiveFormMetrics.length === 0) return previewVisibleKeys;
    return previewVisibleKeys.map((k) => {
      const match = k.match(/^metric_(\d+)$/);
      if (match) {
        const i = parseInt(match[1]!, 10);
        const m = effectiveFormMetrics[i];
        return m ? (m.alias || m.field || k) : k;
      }
      return k;
    });
  }, [previewData, previewVisibleKeys, effectiveFormMetrics]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setWizard("A");
    setAnalysisSelectedMetricIds([]);
    setWizardStep(0);
    setAfterSaveInB(null);
  };

  const saveDashboardFiltersOnly = useCallback(async () => {
    if (!etlId) return;
    setDashboardSyncing(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedMetrics: savedMetrics,
          dashboardFilters,
          ...(linkedDashboardId != null && { dashboardId: linkedDashboardId }),
        }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        toast.error((json as { error?: string }).error ?? "Error al guardar filtros");
        return;
      }
      setData((prev) => (prev ? { ...prev, dashboardFilters } : null));
      toast.success("Filtros guardados");
    } catch {
      toast.error("Error al guardar filtros");
    } finally {
      setDashboardSyncing(false);
    }
  }, [etlId, savedMetrics, dashboardFilters, linkedDashboardId]);

  const saveMetric = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error("Nombre requerido");
      return;
    }
    const firstMetric = effectiveFormMetrics[0];
    if (!firstMetric) {
      toast.error("Agregá al menos una métrica (seleccioná en Análisis o creá en Métrica)");
      return;
    }
    const metricToSave = { ...firstMetric, id: firstMetric.id || `m-${Date.now()}` };
    const aggregationConfig = {
      dimension: formDimensions[0] || undefined,
      dimension2: formDimensions[1] || undefined,
      dimensions: formDimensions.length > 0 ? formDimensions : undefined,
      metrics: effectiveFormMetrics.map((m) => ({ ...m, id: m.id || `m-${Date.now()}` })),
      filters: formFilters.length ? formFilters.map((f) => ({ ...f, operator: Array.isArray(f.value) ? "IN" : f.operator })) : undefined,
      orderBy: formOrderBy ?? undefined,
      limit: formLimit ?? 100,
      chartType: formChartType || undefined,
      chartXAxis: chartXAxis || undefined,
      chartYAxes: chartYAxes.length > 0 ? chartYAxes : undefined,
      chartSeriesField: chartSeriesField || undefined,
      chartValueType: chartValueType !== "number" ? chartValueType : undefined,
      chartValueScale: chartValueScale !== "none" ? chartValueScale : undefined,
      chartNumberFormat: chartValueScale !== "none" ? chartValueScale : chartValueType !== "number" ? chartValueType : undefined,
      chartCurrencySymbol: chartValueType === "currency" ? chartCurrencySymbol : undefined,
      chartThousandSep,
      chartDecimals,
      chartSortDirection: chartSortDirection !== "none" ? chartSortDirection : undefined,
      chartSortBy: chartSortBy !== "series" ? chartSortBy : undefined,
      chartSortByMetric: chartSortByMetric || undefined,
      chartAxisOrder: chartAxisOrder !== "alpha" ? chartAxisOrder : undefined,
      chartScaleMode: chartScaleMode !== "auto" ? chartScaleMode : undefined,
      chartScaleMin: chartScaleMode === "custom" && chartScaleMin !== "" ? chartScaleMin : undefined,
      chartScaleMax: chartScaleMode === "custom" && chartScaleMax !== "" ? chartScaleMax : undefined,
      chartAxisStep: chartAxisStep !== "" ? chartAxisStep : undefined,
      chartRankingEnabled: chartRankingEnabled || undefined,
      chartRankingTop: chartRankingEnabled ? chartRankingTop : undefined,
      chartRankingMetric: chartRankingEnabled && chartRankingMetric ? chartRankingMetric : undefined,
      chartPinnedDimensions: chartPinnedDimensions.length > 0 ? chartPinnedDimensions : undefined,
      chartColorScheme: chartColorScheme !== "auto" ? chartColorScheme : undefined,
      chartSeriesColors: Object.keys(chartSeriesColors).length > 0 ? chartSeriesColors : undefined,
      chartLabelOverrides: Object.keys(chartLabelOverrides).length > 0 ? chartLabelOverrides : undefined,
      dateDimension: timeColumn || undefined,
      dateGroupByGranularity:
        analysisGranularity && ["day", "week", "month", "quarter", "semester", "year"].includes(analysisGranularity)
          ? (analysisGranularity as "day" | "week" | "month" | "quarter" | "semester" | "year")
          : undefined,
      dateRangeFilter:
        timeColumn && analysisTimeRange === "custom" && analysisDateFrom && analysisDateTo
          ? { field: timeColumn, from: analysisDateFrom, to: analysisDateTo }
          : timeColumn && analysisTimeRange && analysisTimeRange !== "0" && Number(analysisTimeRange) > 0
            ? {
                field: timeColumn,
                last: Number(analysisTimeRange),
                unit: analysisTimeRange === "7" || analysisTimeRange === "30" ? "days" : "months",
              }
            : undefined,
      chartMetricFormats:
        chartYAxes.length > 1
          ? Object.fromEntries(
              chartYAxes.map((key) => [
                key,
                chartMetricFormats[key] ?? {
                  valueType: chartValueType,
                  valueScale: chartValueScale,
                  currencySymbol: chartCurrencySymbol,
                  decimals: chartDecimals,
                  thousandSep: chartThousandSep,
                },
              ])
            )
          : Object.keys(chartMetricFormats).length > 0
            ? chartMetricFormats
            : undefined,
      chartComboSyncAxes: formChartType === "combo" && chartYAxes.length >= 2 ? chartComboSyncAxes : undefined,
      chartGridXDisplay: chartGridXDisplay === false ? false : undefined,
      chartGridYDisplay: chartGridYDisplay === false ? false : undefined,
      chartGridColor: chartGridColor.trim() || undefined,
      chartScalePerMetric: Object.keys(chartScalePerMetric).length > 0 ? chartScalePerMetric : undefined,
      showDataLabels: showDataLabels || undefined,
      interCrossFilter: interCrossFilter === false ? false : undefined,
      interCrossFilterFields: interCrossFilterFields.length > 0 ? interCrossFilterFields : undefined,
      interDrilldown: interDrilldown || undefined,
      interDrilldownHierarchy: interDrilldownHierarchy.length > 0 ? interDrilldownHierarchy : undefined,
      interDrillThrough: interDrillThrough || undefined,
      interDrillThroughTarget: interDrillThrough && interDrillThroughTarget ? interDrillThroughTarget : undefined,
      interTooltipFields: interTooltipFields.length > 0 ? interTooltipFields : undefined,
      interHighlight: interHighlight === false ? false : undefined,
    };
    let expr = (firstMetric as { expression?: string }).expression;
    const alias = (firstMetric.alias || "").trim();
    const isAggregateExpr = expressionHasAggregation(expr || "");
    const createDerivedColumn = !isAggregateExpr && expr && alias && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias);
    let nextDerivedColumns = derivedColumns;
    if (createDerivedColumn && expr) {
      let derivedAgg = firstMetric.func || "SUM";
      const aggMatch = expr.match(/^\s*(SUM|AVG|COUNT|MIN|MAX)\s*\((.+)\)\s*$/i);
      if (aggMatch) { derivedAgg = aggMatch[1]!.toUpperCase(); expr = aggMatch[2]!.trim(); }
      nextDerivedColumns = [...derivedColumns.filter((d) => d.name !== alias), { name: alias, expression: expr, defaultAggregation: derivedAgg }];
    }
    const datasetConfigToSave: Record<string, unknown> = {
      ...buildFullDatasetConfig(),
      ...(createDerivedColumn && { derivedColumns: nextDerivedColumns }),
    };

    setSaving(true);
    try {
      let next: SavedMetricForm[];
      const item: SavedMetricForm = {
        id: editingId ?? `sm-${Date.now()}`,
        name,
        metric: metricToSave,
        aggregationConfig,
      };
      if (editingId) {
        next = savedMetrics.map((s) => (s.id === editingId ? item : s));
      } else {
        next = [...savedMetrics, item];
      }
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedMetrics: next,
          datasetConfig: datasetConfigToSave,
        }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al guardar");
        return;
      }
      toast.success(editingId ? "Métrica actualizada" : "Métrica creada");
      if (editingId) toast.success("También se actualizó en los dashboards que la utilizan.", { duration: 4000 });
      if (createDerivedColumn) toast.success(`Se creó la columna «${alias}» en el dataset; la podés usar en «Insertar columna» en otras métricas.`, { duration: 6000 });
      setData((prev) => (prev ? { ...prev, savedMetrics: next, datasetConfig: datasetConfigToSave } : null));
      if (createDerivedColumn) setDerivedColumns(nextDerivedColumns);
      closeForm();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const createColumnFromFormula = async () => {
    const m = formMetrics[0];
    let expr = (m as { expression?: string })?.expression?.trim() ?? "";
    const alias = (m?.alias ?? "").trim();
    if (!expr) {
      toast.error("Escribí una expresión (ej. CANTIDAD * PRECIO_UNITARIO) para crear la columna.");
      return;
    }
    if (formulaSyntaxError) {
      toast.error(formulaSyntaxError);
      return;
    }
    if (expressionHasAggregation(expr)) {
      toast.error("Seguridad de granularidad: la fórmula incluye agregaciones. No se puede crear columna (no debe modificarse la cantidad de filas). Guardala como métrica.");
      return;
    }
    if (grainSafetyErrorForColumn) {
      toast.error(grainSafetyErrorForColumn);
      return;
    }
    if (!alias) {
      toast.error("Indicá un nombre para la nueva columna (ej. factura, total_linea).");
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
      toast.error("El nombre de la columna solo puede tener letras, números y _ (ej. factura).");
      return;
    }
    // Expresión por fila: sin agregación; se guarda como columna calculada
    let derivedAgg = (m?.func as string) || "SUM";
    const aggMatch = expr.match(/^\s*(SUM|AVG|COUNT|MIN|MAX)\s*\((.+)\)\s*$/i);
    if (aggMatch) {
      derivedAgg = aggMatch[1]!.toUpperCase();
      expr = aggMatch[2]!.trim();
    }
    const colName = alias;
    setCreatingColumn(true);
    try {
      const nextDerived = [...derivedColumns.filter((d) => d.name !== colName), { name: colName, expression: expr, defaultAggregation: derivedAgg }];
      const datasetConfigToSave = { ...buildFullDatasetConfig(), derivedColumns: nextDerived };
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: savedMetrics, datasetConfig: datasetConfigToSave }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al crear la columna");
        return;
      }
      setDerivedColumns(nextDerived);
      setData((prev) => (prev ? { ...prev, datasetConfig: datasetConfigToSave } : null));
      setColumnRoles((prev) => ({ ...prev, [colName]: { role: "measure", aggregation: "sum", label: colName, visible: true } }));
      toast.success(`Columna «${colName}» creada. Aparece en Rol BI, Profiling e «Insertar columna».`);
      setAfterSaveInB("column");
    } catch {
      toast.error("Error al crear la columna");
    } finally {
      setCreatingColumn(false);
    }
  };

  /** Guardar la métrica actual desde el paso B (Cálculo/Preview). El nombre se toma de formName (Cálculo) o metricNameToSave (Preview). */
  const saveMetricFromCalculationStep = async () => {
    const name = (metricNameToSave || formName).trim();
    if (!name) {
      toast.error("Escribí un nombre para la métrica (campo «Nombre de la métrica»).");
      return;
    }
    const useReuseFlow = formulaFromSavedMetricIds.length >= 2 && formulaFromReuseExpr.trim();
    let metricsToStore: AggregationMetricEdit[];
    let metricToSave: AggregationMetricEdit & { id?: string };
    if (useReuseFlow) {
      const ordered = formulaFromSavedMetricIds
        .map((id) => savedMetrics.find((s) => String(s.id) === String(id)))
        .filter((s): s is SavedMetricForm => s != null);
      if (ordered.length < 2) {
        toast.error("Seleccioná al menos dos métricas guardadas para el ratio.");
        return;
      }
      const baseMetrics = ordered.flatMap((s) => {
        const cfg = s.aggregationConfig;
        const list = cfg?.metrics?.length ? cfg.metrics : (s.metric ? [s.metric] : []);
        return list.map((m, i) => ({ ...(m as object), id: (m as { id?: string }).id || `m-${Date.now()}-${i}` }));
      }) as AggregationMetricEdit[];
      const formulaMetric: AggregationMetricEdit = { id: `m-formula-${Date.now()}`, field: "", func: "FORMULA", alias: name, formula: formulaFromReuseExpr.trim() };
      metricsToStore = [...baseMetrics, formulaMetric];
      metricToSave = formulaMetric;
    } else {
      const firstMetric = formMetrics[0];
      if (!firstMetric) return;
      const expr = (firstMetric as { expression?: string })?.expression?.trim();
      if (!expr) {
        toast.error("Escribí una fórmula para la métrica o usá «Ratio entre métricas guardadas».");
        return;
      }
      if (formulaSyntaxError) {
        toast.error(formulaSyntaxError);
        return;
      }
      metricToSave = { ...firstMetric, id: firstMetric.id || `m-${Date.now()}` };
      metricsToStore = formMetrics.map((m) => ({ ...m, id: m.id || `m-${Date.now()}` }));
    }
    const aggregationConfig = {
      dimension: formDimensions[0] || undefined,
      dimension2: formDimensions[1] || undefined,
      dimensions: formDimensions.length > 0 ? formDimensions : undefined,
      metrics: metricsToStore,
      filters: formFilters.length ? formFilters.map((f) => ({ ...f, operator: Array.isArray(f.value) ? "IN" : f.operator })) : undefined,
      orderBy: formOrderBy ?? undefined,
      limit: formLimit ?? 100,
      chartType: formChartType || undefined,
      chartXAxis: chartXAxis || undefined,
      chartYAxes: chartYAxes.length > 0 ? chartYAxes : undefined,
      chartSeriesField: chartSeriesField || undefined,
      chartValueType: chartValueType !== "number" ? chartValueType : undefined,
      chartValueScale: chartValueScale !== "none" ? chartValueScale : undefined,
      chartNumberFormat: chartValueScale !== "none" ? chartValueScale : chartValueType !== "number" ? chartValueType : undefined,
      chartCurrencySymbol: chartValueType === "currency" ? chartCurrencySymbol : undefined,
      chartThousandSep,
      chartDecimals,
      chartSortDirection: chartSortDirection !== "none" ? chartSortDirection : undefined,
      chartSortBy: chartSortBy !== "series" ? chartSortBy : undefined,
      chartSortByMetric: chartSortByMetric || undefined,
      chartAxisOrder: chartAxisOrder !== "alpha" ? chartAxisOrder : undefined,
      chartScaleMode: chartScaleMode !== "auto" ? chartScaleMode : undefined,
      chartScaleMin: chartScaleMode === "custom" && chartScaleMin !== "" ? chartScaleMin : undefined,
      chartScaleMax: chartScaleMode === "custom" && chartScaleMax !== "" ? chartScaleMax : undefined,
      chartAxisStep: chartAxisStep !== "" ? chartAxisStep : undefined,
      chartRankingEnabled: chartRankingEnabled || undefined,
      chartRankingTop: chartRankingEnabled ? chartRankingTop : undefined,
      chartRankingMetric: chartRankingEnabled && chartRankingMetric ? chartRankingMetric : undefined,
      chartPinnedDimensions: chartPinnedDimensions.length > 0 ? chartPinnedDimensions : undefined,
      chartColorScheme: chartColorScheme !== "auto" ? chartColorScheme : undefined,
      chartSeriesColors: Object.keys(chartSeriesColors).length > 0 ? chartSeriesColors : undefined,
      chartLabelOverrides: Object.keys(chartLabelOverrides).length > 0 ? chartLabelOverrides : undefined,
      chartMetricFormats:
        chartYAxes.length > 1
          ? Object.fromEntries(
              chartYAxes.map((key) => [
                key,
                chartMetricFormats[key] ?? {
                  valueType: chartValueType,
                  valueScale: chartValueScale,
                  currencySymbol: chartCurrencySymbol,
                  decimals: chartDecimals,
                  thousandSep: chartThousandSep,
                },
              ])
            )
          : Object.keys(chartMetricFormats).length > 0
            ? chartMetricFormats
            : undefined,
      chartComboSyncAxes: formChartType === "combo" && chartYAxes.length >= 2 ? chartComboSyncAxes : undefined,
      chartGridXDisplay: chartGridXDisplay === false ? false : undefined,
      chartGridYDisplay: chartGridYDisplay === false ? false : undefined,
      chartGridColor: chartGridColor.trim() || undefined,
      chartScalePerMetric: Object.keys(chartScalePerMetric).length > 0 ? chartScalePerMetric : undefined,
      showDataLabels: showDataLabels || undefined,
      interCrossFilter: interCrossFilter === false ? false : undefined,
      interCrossFilterFields: interCrossFilterFields.length > 0 ? interCrossFilterFields : undefined,
      interDrilldown: interDrilldown || undefined,
      interDrilldownHierarchy: interDrilldownHierarchy.length > 0 ? interDrilldownHierarchy : undefined,
      interDrillThrough: interDrillThrough || undefined,
      interDrillThroughTarget: interDrillThrough && interDrillThroughTarget ? interDrillThroughTarget : undefined,
      interTooltipFields: interTooltipFields.length > 0 ? interTooltipFields : undefined,
      interHighlight: interHighlight === false ? false : undefined,
    };
    const item: SavedMetricForm = {
      id: `sm-${Date.now()}`,
      name,
      metric: metricToSave,
      aggregationConfig,
    };
    setSaving(true);
    try {
      const next = [...savedMetrics, item];
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: next }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al guardar la métrica");
        return;
      }
      setData((prev) => (prev ? { ...prev, savedMetrics: next } : null));
      toast.success(`Métrica «${name}» guardada en Calculadas (métricas).`);
      setAfterSaveInB("metric");
    } catch {
      toast.error("Error al guardar la métrica");
    } finally {
      setSaving(false);
    }
  };

  const deleteMetric = async (id: string) => {
    const next = savedMetrics.filter((s) => s.id !== id);
    setSaving(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: next }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al eliminar");
        return;
      }
      toast.success("Métrica eliminada");
      setData((prev) => (prev ? { ...prev, savedMetrics: next } : null));
      setDeleteTarget(null);
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const saveAnalysisToEtl = async () => {
    const name = analysisNameToSave.trim();
    if (!name) {
      toast.error("Escribí un nombre para el análisis.");
      return;
    }
    if (analysisSelectedMetricIds.length === 0) {
      toast.error("Seleccioná al menos una métrica para el análisis.");
      return;
    }
    const newAnalysis = {
      id: `sa-${Date.now()}`,
      name,
      metricIds: [...analysisSelectedMetricIds],
      dimensions: formDimensions.length > 0 ? formDimensions : undefined,
      dimension: formDimensions[0] || undefined,
      dimension2: formDimensions[1] || undefined,
      chartType: formChartType || undefined,
      chartXAxis: chartXAxis || undefined,
      chartYAxes: chartYAxes.length > 0 ? chartYAxes : undefined,
      chartSeriesField: chartSeriesField || undefined,
      chartLabelOverrides: Object.keys(chartLabelOverrides).length > 0 ? chartLabelOverrides : undefined,
      chartValueType: chartValueType !== "number" ? chartValueType : undefined,
      chartValueScale: chartValueScale !== "none" ? chartValueScale : undefined,
      chartCurrencySymbol: chartValueType === "currency" ? chartCurrencySymbol : undefined,
      chartThousandSep,
      chartDecimals,
      chartSeriesColors: Object.keys(chartSeriesColors).length > 0 ? chartSeriesColors : undefined,
      chartGridXDisplay: chartGridXDisplay === false ? false : undefined,
      chartGridYDisplay: chartGridYDisplay === false ? false : undefined,
      chartGridColor: chartGridColor.trim() || undefined,
      chartSortDirection: chartSortDirection !== "none" ? chartSortDirection : undefined,
      chartSortBy: chartSortBy !== "series" ? chartSortBy : undefined,
      chartSortByMetric: chartSortByMetric || undefined,
      chartRankingEnabled: chartRankingEnabled || undefined,
      chartRankingTop: chartRankingEnabled ? chartRankingTop : undefined,
      chartRankingMetric: chartRankingEnabled && chartRankingMetric ? chartRankingMetric : undefined,
      filters: formFilters.length ? formFilters : undefined,
      orderBy: formOrderBy ?? undefined,
      limit: formLimit ?? 100,
      dateDimension: timeColumn || undefined,
      dateGroupByGranularity:
        analysisGranularity && ["day", "week", "month", "quarter", "semester", "year"].includes(analysisGranularity)
          ? (analysisGranularity as "day" | "week" | "month" | "quarter" | "semester" | "year")
          : undefined,
      dateRangeFilter:
        timeColumn && analysisTimeRange === "custom" && analysisDateFrom && analysisDateTo
          ? { field: timeColumn, from: analysisDateFrom, to: analysisDateTo }
          : timeColumn && analysisTimeRange && analysisTimeRange !== "0" && Number(analysisTimeRange) > 0
            ? {
                field: timeColumn,
                last: Number(analysisTimeRange),
                unit: analysisTimeRange === "7" || analysisTimeRange === "30" ? "days" : "months",
              }
            : undefined,
    };
    const nextAnalyses = [...(data?.savedAnalyses ?? []), newAnalysis];
    setSavingAnalysis(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: savedMetrics, savedAnalyses: nextAnalyses }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al guardar el análisis");
        return;
      }
      setData((prev) => (prev ? { ...prev, savedAnalyses: nextAnalyses } : null));
      toast.success(`Análisis «${name}» guardado. Aparecerá al añadir al dashboard.`);
      setAnalysisNameToSave("");
    } catch {
      toast.error("Error al guardar el análisis");
    } finally {
      setSavingAnalysis(false);
    }
  };

  const deleteDerivedColumn = async (name: string) => {
    const nextDerived = derivedColumns.filter((d) => d.name !== name);
    const datasetConfigToSave = {
      ...buildFullDatasetConfig(),
      derivedColumns: nextDerived.map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" })),
    };
    setSaving(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: savedMetrics, datasetConfig: datasetConfigToSave }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al eliminar la columna calculada");
        return;
      }
      setDerivedColumns(nextDerived);
      setData((prev) => (prev ? { ...prev, datasetConfig: datasetConfigToSave } : null));
      toast.success("Columna calculada eliminada");
      setDeleteTarget(null);
    } catch {
      toast.error("Error al eliminar la columna calculada");
    } finally {
      setSaving(false);
    }
  };

  const closeDeleteModal = useCallback(() => {
    if (!saving) setDeleteTarget(null);
  }, [saving]);

  const confirmDeleteFromModal = useCallback(async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "metric") await deleteMetric(deleteTarget.id);
    else await deleteDerivedColumn(deleteTarget.name);
  }, [deleteTarget]);

  const PERIODICITY_OPTIONS = [
    { value: "Diaria", label: "Diaria" },
    { value: "Semanal", label: "Semanal" },
    { value: "Mensual", label: "Mensual" },
    { value: "Anual", label: "Anual" },
    { value: "Irregular", label: "Irregular" },
  ];

  const savePeriodicityOverrides = useCallback(
    async (overrides: Record<string, string>) => {
      try {
        const res = await fetch(`/api/etl/${etlId}/metrics`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ savedMetrics: savedMetrics, dateColumnPeriodicityOverrides: overrides }),
        });
        const json = await safeJsonResponse(res);
        if (!res.ok || !json.ok) toast.error(json.error ?? "Error al guardar periodicidad");
        else setData((prev) => (prev ? { ...prev, dateColumnPeriodicityOverrides: overrides } : null));
      } catch {
        toast.error("Error al guardar periodicidad");
      }
    },
    [etlId, savedMetrics]
  );

  const goToDashboard = () => {
    router.push(`/admin/dashboard?create=1&etlId=${etlId}`);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--platform-accent)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 max-w-4xl mx-auto w-full p-6 gap-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          {!(datasetOnly && embeddedInDatasetsModal) && (
            <Link
              href={datasetOnly ? "/admin/datasets" : `/admin/etl/${etlId}`}
              className="flex items-center gap-2 text-sm font-medium rounded-lg transition-colors"
              style={{ color: "var(--platform-fg-muted)" }}
            >
              <ChevronLeft className="h-4 w-4" />
              {datasetOnly ? "Volver a Datasets" : "Volver al ETL"}
            </Link>
          )}
          <h1 className="text-xl font-semibold" style={{ color: "var(--platform-fg)" }}>
            {datasetOnly ? `Configurar dataset – ${etlTitle}` : `Métricas reutilizables – ${etlTitle}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!datasetOnly && (
            <Link
              href={`/admin/datasets?etlId=${etlId}`}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors"
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
            >
              Configurar dataset
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            onClick={goToDashboard}
          >
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Ir al Dashboard
          </Button>
          {!datasetOnly && hasData && (
            <Button
              type="button"
              className="rounded-xl"
              style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
              onClick={openNew}
              disabled={hideDatasetTab && !currentDataset}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva métrica
            </Button>
          )}
        </div>
      </header>

      {hideDatasetTab && hasData && (
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>
            Dataset a utilizar
          </p>
          {datasetsListLoading ? (
            <p className="text-sm flex items-center gap-2" style={{ color: "var(--platform-fg-muted)" }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando...
            </p>
          ) : currentDataset ? (
            <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
              {currentDataset.name || currentDataset.etl_title || etlTitle}
            </p>
          ) : (
            <p className="text-sm mb-2" style={{ color: "var(--platform-fg-muted)" }}>
              Este ETL aún no tiene dataset configurado. Configuralo en Datasets para usar grain, tiempo y roles al crear métricas.
            </p>
          )}
          {hideDatasetTab && !currentDataset && !datasetsListLoading && (
            <Link
              href={`/admin/datasets?etlId=${etlId}`}
              className="inline-flex items-center gap-2 text-sm font-medium mt-2"
              style={{ color: "var(--platform-accent)" }}
            >
              Ir a configurar dataset
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}

      {!hasData && (
        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-surface)",
            color: "var(--platform-fg-muted)",
          }}
        >
          <p className="text-sm">
            Ejecutá el ETL primero para generar datos y poder crear métricas reutilizables.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Link
              href={`/admin/etl/${etlId}?run=1`}
              className="inline-flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--platform-accent)" }}
            >
              Ir a ejecutar ETL
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg"
              onClick={() => fetchData()}
              disabled={loading}
              style={{ color: "var(--platform-fg-muted)" }}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Recargar
            </Button>
          </div>
        </div>
      )}

      {showForm && hasData && (
        <div className="flex flex-col rounded-2xl border overflow-hidden" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", minHeight: "480px" }}>
          {/* Tabs: Dataset, Métrica, Análisis, Gráfico (ocultar Dataset si hideDatasetTab; ocultar todos si datasetOnly) */}
          {!datasetOnly && (
            <div className="flex border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              {(["A", "B", "C", "D"] as const).filter((w) => !hideDatasetTab || w !== "A").map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => { setWizard(w); setWizardStep(0); }}
                  className="flex-1 min-w-0 py-3 px-4 text-sm font-medium transition-colors relative"
                  style={{
                    color: wizard === w ? "var(--platform-accent)" : "var(--platform-fg-muted)",
                    background: wizard === w ? "var(--platform-surface)" : "transparent",
                  }}
                >
                  {w === "A" ? "Dataset" : w === "B" ? "Métrica" : w === "C" ? "Análisis" : "Gráfico"}
                  <span className="ml-1.5 text-xs font-normal opacity-80" style={{ color: "inherit" }}>({WIZARD_STEPS[w].length})</span>
                  {wizard === w && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: "var(--platform-accent)" }} />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col min-w-0 flex-1">
            {/* Top bar: step title + actions */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              <div>
                <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{wizard === "A" ? "Dataset" : wizard === "B" ? "Métrica" : wizard === "C" ? "Análisis" : "Gráfico"} — {WIZARD_STEPS[wizard][wizardStep]}</p>
                <h2 className="text-base font-semibold" style={{ color: "var(--platform-fg)" }}>{WIZARD_STEPS[wizard][wizardStep]}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={datasetOnly ? (embeddedInDatasetsModal && onDatasetSaved ? () => onDatasetSaved() : () => router.push("/admin/datasets")) : closeForm}>{datasetOnly ? "Volver" : "Cancelar"}</Button>
                {canPrev && <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>← Anterior</Button>}
                {(wizard === "D" && wizardStep === WIZARD_STEPS.D.length - 1) ? (
                  <Button type="button" size="sm" className="rounded-lg" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetric} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Guardar cambios" : analysisSelectedMetricIds.length > 0 ? "Guardar análisis" : "Crear métrica"}</Button>
                ) : (
                  canNext && (
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-lg"
                      style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                      disabled={isGrainStep && !hasValidGrain}
                      onClick={() => {
                        if (isGrainStep && !hasValidGrain) toast.error("Elegí una columna o varias (Personalizado) como clave única para avanzar.");
                        else goNext();
                      }}
                    >
                      Siguiente
                    </Button>
                  )
                )}
              </div>
            </div>

            {/* Stepper (steps within current wizard) */}
            <div className="flex gap-1 px-4 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              {WIZARD_STEPS[wizard].map((label, i) => (
                <button key={i} type="button" onClick={() => setWizardStep(i)} className="flex-1 min-w-0 py-2 px-2 rounded-lg text-center text-xs font-medium transition-colors" style={{ color: wizardStep === i ? "var(--platform-accent)" : "var(--platform-fg-muted)", background: wizardStep === i ? "var(--platform-accent-dim)" : "transparent" }}>
                  <span className="w-6 h-6 rounded-full mx-auto mb-1 flex items-center justify-center text-xs" style={{ background: wizardStep === i ? "var(--platform-accent)" : "var(--platform-surface)", color: wizardStep === i ? "var(--platform-bg)" : "var(--platform-fg-muted)" }}>{i + 1}</span>
                  <span className="truncate block">{label}</span>
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Wizard A0: Profiling — datos ETL tipo Excel */}
              {wizard === "A" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Profiling — Datos del ETL</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Revisá la tabla y columnas que usará la métrica. Podés analizar los datos como en una hoja.</p>
                  <div className="grid gap-4 sm:grid-cols-2 mb-4">
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>ETL</p><p className="font-medium" style={{ color: "var(--platform-fg)" }}>{etlTitle}</p></div>
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>Tabla</p><p className="font-mono text-sm" style={{ color: "var(--platform-fg)" }}>{data?.schema}.{data?.tableName}</p></div>
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>Filas</p><p className="font-medium" style={{ color: "var(--platform-fg)" }}>{data?.rowCount ?? 0}</p></div>
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>Columnas</p><p className="font-medium" style={{ color: "var(--platform-fg)" }}>{displayColumnsForProfiling.length}</p></div>
                  </div>
                  <div className="mb-4">
                    <p className="text-xs font-medium uppercase mb-2" style={{ color: "var(--platform-fg-muted)" }}>Vista de datos (muestra)</p>
                    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <div className="overflow-auto max-h-[320px]">
                        <table className="w-full text-sm border-collapse" style={{ color: "var(--platform-fg)" }}>
                          <thead className="sticky top-0 z-10" style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                            <tr>
                              {displayColumnsForProfiling.map((k) => {
                                const dc = derivedColumnsByName[k];
                                return (
                                  <th key={k} className="text-left px-3 py-2 font-medium whitespace-nowrap border-r last:border-r-0" style={{ borderColor: "var(--platform-border)", fontSize: "11px", textTransform: "uppercase", color: dc ? "var(--platform-accent)" : undefined }} title={dc ? `${k} = ${dc.expression} (${dc.defaultAggregation})` : undefined}>
                                    {getSampleDisplayLabel(k)}{dc ? <span className="font-normal ml-1 opacity-70" style={{ fontSize: "10px" }}>= {dc.expression}</span> : null}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody style={{ background: "var(--platform-bg)" }}>
                            {(rawTableData.length > 0 ? rawTableData : []).map((row, idx) => {
                              const r = row as Record<string, unknown>;
                              const keys = Object.keys(r);
                              const getCell = (col: string, colIndex: number) => {
                                if (derivedColumnsByName[col]) return undefined;
                                if (r[col] !== undefined && r[col] !== null) return r[col];
                                const colNorm = col.replace(/\./g, "_").toLowerCase();
                                const key = keys.find((k) => k.replace(/\./g, "_").toLowerCase() === colNorm);
                                if (key !== undefined) return r[key];
                                if (keys.length === displayColumnsForProfiling.length && keys[colIndex] !== undefined) return r[keys[colIndex]];
                                const withUnderscore = col.replace(/\./g, "_");
                                if (r[withUnderscore] !== undefined && r[withUnderscore] !== null) return r[withUnderscore];
                                if (r[withUnderscore.toLowerCase()] !== undefined && r[withUnderscore.toLowerCase()] !== null) return r[withUnderscore.toLowerCase()];
                                return undefined;
                              };
                              return (
                                <tr key={idx} className="border-b last:border-b-0 hover:opacity-90" style={{ borderColor: "var(--platform-border)" }}>
                                  {displayColumnsForProfiling.map((col, colIndex) => {
                                    const dc = derivedColumnsByName[col];
                                    let formatted: string;
                                    if (dc) {
                                      try {
                                        const tokens = dc.expression.split(/([+\-*/])/).map((t: string) => t.trim()).filter(Boolean);
                                        let val = 0;
                                        let op = "+";
                                        let valid = true;
                                        for (const t of tokens) {
                                          if (["+", "-", "*", "/"].includes(t)) { op = t; continue; }
                                          const colVal = getCell(t, -1) ?? getCell(t.toLowerCase(), -1) ?? getCell(t.toUpperCase(), -1);
                                          const n = Number(colVal);
                                          if (colVal == null || isNaN(n)) { valid = false; break; }
                                          if (op === "+") val += n;
                                          else if (op === "-") val -= n;
                                          else if (op === "*") val *= n;
                                          else if (op === "/") val = n !== 0 ? val / n : 0;
                                        }
                                        formatted = valid ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : `= ${dc.expression}`;
                                      } catch {
                                        formatted = `= ${dc.expression}`;
                                      }
                                    } else {
                                      const raw = getCell(col, colIndex);
                                      formatted = formatSampleCell(col, raw);
                                    }
                                    return (
                                      <td key={col} className="px-3 py-1.5 whitespace-nowrap border-r last:border-r-0 text-xs" style={{ borderColor: "var(--platform-border)", color: dc ? "var(--platform-accent)" : "var(--platform-fg-muted)" }} title={dc ? `${col} = ${dc.expression}` : formatted}>{formatted}</td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                          {rawTableData.length > 0 && (
                            <tfoot className="sticky bottom-0 z-10" style={{ background: "var(--platform-surface)", borderTop: "2px solid var(--platform-border)" }}>
                              <tr>
                                {displayColumnsForProfiling.map((col, colIndex) => {
                                  const dc = derivedColumnsByName[col];
                                  const isNumeric = numericFieldSet.has(col) || dc;
                                  if (!isNumeric) {
                                    return <td key={col} className="px-3 py-2 text-xs font-medium border-r last:border-r-0" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>{colIndex === 0 ? `Σ (${rawTableData.length} filas)` : ""}</td>;
                                  }
                                  let sum = 0;
                                  let count = 0;
                                  for (const row of rawTableData) {
                                    const r = row as Record<string, unknown>;
                                    const keys = Object.keys(r);
                                    if (dc) {
                                      try {
                                        const tokens = dc.expression.split(/([+\-*/])/).map((t: string) => t.trim()).filter(Boolean);
                                        let val = 0; let op = "+"; let valid = true;
                                        for (const t of tokens) {
                                          if (["+", "-", "*", "/"].includes(t)) { op = t; continue; }
                                          const cv = r[t] ?? r[t.toLowerCase()] ?? r[t.toUpperCase()] ?? (() => { const k = keys.find((k2) => k2.toLowerCase() === t.toLowerCase()); return k ? r[k] : undefined; })();
                                          const n = Number(cv);
                                          if (cv == null || isNaN(n)) { valid = false; break; }
                                          if (op === "+") val += n; else if (op === "-") val -= n; else if (op === "*") val *= n; else if (op === "/") val = n !== 0 ? val / n : 0;
                                        }
                                        if (valid) { sum += val; count++; }
                                      } catch { /* skip */ }
                                    } else {
                                      const cn = col.replace(/\./g, "_").toLowerCase();
                                      const raw = r[col] ?? r[col.replace(/\./g, "_")] ?? r[cn] ?? (() => { const k = keys.find((k2) => k2.replace(/\./g, "_").toLowerCase() === cn); return k ? r[k] : undefined; })();
                                      const n = Number(raw);
                                      if (raw != null && !isNaN(n)) { sum += n; count++; }
                                    }
                                  }
                                  return (
                                    <td key={col} className="px-3 py-2 text-xs font-bold whitespace-nowrap border-r last:border-r-0" style={{ borderColor: "var(--platform-border)", color: dc ? "var(--platform-accent)" : "var(--platform-fg)" }}>
                                      {count > 0 ? sum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      <p className="text-xs px-3 py-2 border-t" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)", background: "var(--platform-surface)" }}>
                        {rawTableData.length} filas mostradas {data?.rowCount && data.rowCount > rawTableData.length ? `(de ${data.rowCount} total)` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Filas para profiling:</span>
                    <select
                      value={profileRowLimit}
                      onChange={(e) => {
                        const v = e.target.value;
                        setProfileRowLimit(v === "unlimited" ? "unlimited" : (Number(v) as 200 | 500 | 5000 | 200000 | 500000));
                      }}
                      className="rounded-lg border text-sm h-8 px-2"
                      style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                    >
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                      <option value={5000}>5.000</option>
                      <option value={200000}>200.000</option>
                      <option value={500000}>500.000</option>
                      <option value="unlimited">Sin límite (muestra completa)</option>
                    </select>
                    <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => fetchData({ bustCache: true, ...(profileRowLimit === "unlimited" ? { unlimited: true } : { sampleRows: profileRowLimit }) })} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Recargar muestra
                    </Button>
                  </div>
                  <div className="flex justify-between">
                    <div />
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Grain</Button>
                  </div>
                </section>
              )}

              {/* Wizard A1: Grain — obligatorio */}
              {wizard === "A" && wizardStep === 1 && (() => {
                const hasValidGrain = (grainOption !== "" && grainOption !== "_custom") || (grainOption === "_custom" && grainCustomColumns.length > 0);
                const hasDuplicates = grainValidation != null && grainValidation.duplicateRows > 0;
                const canAdvanceGrain = hasValidGrain && !hasDuplicates;
                return (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Grain técnico (clave única)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Elegí una columna o varias (concatenadas) que identifiquen de forma única cada fila. Se valida que no haya duplicados con la combinación elegida.</p>
                  {rawTableData.length > 0 && (
                    <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Sugerencias basadas en la muestra actual ({rawTableData.length} filas). Las columnas con 100% de valores únicos se marcan como sugeridas (orientativo).</p>
                  )}
                  <div className="space-y-2 mb-4">
                    {fields.map((f) => (
                      <label key={f} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: grainOption === f ? "var(--platform-accent)" : "var(--platform-border)", background: grainOption === f ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                        <input type="radio" name="grain" checked={grainOption === f} onChange={() => setGrainOption(f)} className="rounded-full" />
                        <span className="font-medium" style={{ color: "var(--platform-fg)" }}>{getSampleDisplayLabel(f)}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--platform-surface)", color: "var(--platform-fg-muted)" }}>1 columna</span>
                        {suggestedUniqueColumns.has(f) && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}>Sugerido (100% únicos en muestra)</span>
                        )}
                      </label>
                    ))}
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: grainOption === "_custom" ? "var(--platform-accent)" : "var(--platform-border)", background: grainOption === "_custom" ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                      <input type="radio" name="grain" checked={grainOption === "_custom"} onChange={() => setGrainOption("_custom")} className="rounded-full" />
                      <span style={{ color: "var(--platform-fg)" }}>Personalizado — definir una o varias columnas (clave única = concatenación)</span>
                    </label>
                  </div>
                  {grainOption === "_custom" && (
                    <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-medium mb-3" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná una o más columnas para formar la clave única:</p>
                      <div className="flex flex-wrap gap-2">
                        {fields.map((col) => {
                          const checked = grainCustomColumns.includes(col);
                          return (
                            <label
                              key={col}
                              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors"
                              style={{ borderColor: checked ? "var(--platform-accent)" : "var(--platform-border)", background: checked ? "var(--platform-accent-dim)" : "var(--platform-surface)" }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) setGrainCustomColumns((prev) => [...prev, col]);
                                  else setGrainCustomColumns((prev) => prev.filter((c) => c !== col));
                                }}
                                className="rounded"
                              />
                              <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{getSampleDisplayLabel(col)}</span>
                            </label>
                          );
                        })}
                      </div>
                      {grainCustomColumns.length > 0 && (
                        <p className="text-xs mt-2" style={{ color: "var(--platform-fg-muted)" }}>
                          Clave única = {grainCustomColumns.map(getSampleDisplayLabel).join(" + ")}
                        </p>
                      )}
                    </div>
                  )}
                  {hasValidGrain && grainValidation != null && (
                    <div className="mb-4">
                      {hasDuplicates ? (
                        <div className="rounded-xl border p-4 flex items-start gap-3" style={{ borderColor: "var(--platform-error, #dc2626)", background: "rgba(220, 38, 38, 0.06)" }}>
                          <span className="text-lg" aria-hidden>⚠️</span>
                          <div>
                            <p className="font-medium text-sm mb-1" style={{ color: "var(--platform-error, #dc2626)" }}>Se detectaron registros duplicados con la clave elegida</p>
                            <p className="text-sm mb-1" style={{ color: "var(--platform-fg-muted)" }}>
                              En la muestra: <strong>{grainValidation.duplicateRows}</strong> fila(s) duplicada(s) (claves repetidas). <strong>{grainValidation.uniqueKeys}</strong> claves únicas en {grainValidation.totalRows} filas.
                            </p>
                            <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Elegí otra columna o combinación que identifique de forma única cada fila para poder avanzar.</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm py-2" style={{ color: "var(--platform-fg-muted)" }}>
                          ✓ Sin duplicados en la muestra ({grainValidation.totalRows} filas, {grainValidation.uniqueKeys} claves únicas).
                        </p>
                      )}
                    </div>
                  )}
                  {!hasValidGrain && (grainOption === "_custom" && grainCustomColumns.length === 0) && (
                    <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná al menos una columna en Personalizado para continuar.</p>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button
                      type="button"
                      className="rounded-xl"
                      style={{ background: canAdvanceGrain ? "var(--platform-accent)" : "var(--platform-bg-elevated)", color: canAdvanceGrain ? "var(--platform-bg)" : "var(--platform-fg-muted)" }}
                      onClick={() => {
                        if (!hasValidGrain) { toast.error("Elegí una columna o varias (Personalizado) como clave única para avanzar."); return; }
                        if (hasDuplicates) { toast.error("Corregí la definición del grain: hay duplicados con la clave elegida. No se puede avanzar hasta que sea única."); return; }
                        goNext();
                      }}
                      disabled={!canAdvanceGrain}
                    >
                      Siguiente: Tiempo
                    </Button>
                  </div>
                </section>
                );
              })()}

              {/* Wizard A2: Tiempo — opción de dimensión temporal y tabla de columnas fecha */}
              {wizard === "A" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Dimensión temporal</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Indicá si el dataset tiene dimensión temporal. Si la tiene, definí columnas de tipo fecha y su periodicidad natural.</p>
                  <label className="flex items-center gap-3 p-3 rounded-lg border mb-4 cursor-pointer transition-colors" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <input
                      type="checkbox"
                      checked={datasetHasTime}
                      onChange={(e) => setDatasetHasTime(e.target.checked)}
                      className="rounded"
                    />
                    <span className="font-medium" style={{ color: "var(--platform-fg)" }}>Este dataset tiene dimensión temporal</span>
                  </label>
                  {datasetHasTime && (
                    <>
                      <p className="text-sm mb-2" style={{ color: "var(--platform-fg-muted)" }}>Columnas de tipo fecha y su periodicidad natural (inferida del dato).</p>
                      <div className="overflow-hidden rounded-xl border mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <table className="w-full text-sm border-collapse">
                          <thead style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                            <tr>
                              <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Columna temporal</th>
                              <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Periodicidad natural</th>
                            </tr>
                          </thead>
                          <tbody style={{ color: "var(--platform-fg)" }}>
                            {dateFields.length === 0 ? (
                              <tr>
                                <td colSpan={2} className="px-3 py-4 text-sm" style={{ color: "var(--platform-fg-muted)" }}>No hay columnas de tipo fecha en este dataset.</td>
                              </tr>
                            ) : (
                              dateFields.map((f) => {
                                const effectivePeriodicity = periodicityOverrides[f] ?? data?.dateColumnPeriodicity?.[f] ?? "Irregular";
                                return (
                                  <tr key={f} className="border-b last:border-b-0" style={{ borderColor: "var(--platform-border)" }}>
                                    <td className="px-3 py-2 font-medium" style={{ color: "var(--platform-fg)" }}>{getSampleDisplayLabel(f)}</td>
                                    <td className="px-3 py-2">
                                      <Select
                                        value={effectivePeriodicity}
                                        onChange={(val: string) => {
                                          const next = { ...periodicityOverrides, [f]: val };
                                          setPeriodicityOverrides(next);
                                          savePeriodicityOverrides(next);
                                        }}
                                        options={PERIODICITY_OPTIONS}
                                        placeholder="Periodicidad"
                                        className="min-w-[120px]"
                                        buttonClassName="h-8 text-sm rounded-lg border bg-[var(--platform-bg)]"
                                      />
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {!datasetHasTime && (
                    <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Sin dimensión temporal. Podés continuar al siguiente paso.</p>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Roles BI</Button>
                  </div>
                </section>
              )}

              {/* Wizard A3: Roles BI */}
              {wizard === "A" && wizardStep === 3 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Clasificación BI de columnas (roles)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Definí qué columnas son dimensión, medida, clave o geo. El rol <strong>geo</strong> permite identificar columnas de ubicación (país, provincia, ciudad, dirección, lat/lon); si el nombre de la columna coincide, se sugiere automáticamente.</p>
                  <div className="overflow-x-auto rounded-xl border mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <table className="w-full text-sm">
                      <thead style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                        <tr>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Columna</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Rol BI</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Agregación / Tipo geo</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Etiqueta</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Visible</th>
                        </tr>
                      </thead>
                      <tbody style={{ color: "var(--platform-fg)" }}>
                        {allColumnsForRoles.map((col) => {
                          const isDerived = derivedColumnsByName[col];
                          const r = columnRoles[col] ?? { role: (isDerived ? "measure" : "dimension") as ColumnRole, aggregation: isDerived ? "sum" : "—", label: col, visible: true };
                          const geoType = (r as { geoType?: GeoType }).geoType ?? "country";
                          return (
                            <tr key={col} className="border-b last:border-b-0" style={{ borderColor: "var(--platform-border)" }}>
                              <td className="px-3 py-2 font-medium">{col}{isDerived ? <span className="text-xs ml-1" style={{ color: "var(--platform-fg-muted)" }}>(calculada)</span> : null}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={r.role}
                                  onChange={(e) => {
                                    const newRole = e.target.value as ColumnRole;
                                    const suggested = newRole === "geo" ? suggestGeoTypeByColumnName(col) : null;
                                    setColumnRoles((prev) => ({
                                      ...prev,
                                      [col]: { ...prev[col], role: newRole, ...(newRole === "geo" && { geoType: suggested ?? "country" }) },
                                    }));
                                  }}
                                  className="h-8 rounded border px-2 text-xs w-full max-w-[120px]"
                                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                                >
                                  <option value="key">key</option>
                                  <option value="time">time</option>
                                  <option value="dimension">dimension</option>
                                  <option value="measure">measure</option>
                                  <option value="geo">geo</option>
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                {r.role === "measure" ? (
                                  <select value={r.aggregation} onChange={(e) => setColumnRoles((prev) => ({ ...prev, [col]: { ...prev[col], aggregation: e.target.value } }))} className="h-8 rounded border px-2 text-xs w-20" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                                    <option value="sum">sum</option>
                                    <option value="avg">avg</option>
                                    <option value="min">min</option>
                                    <option value="max">max</option>
                                    <option value="none">none</option>
                                  </select>
                                ) : r.role === "geo" ? (
                                  <select
                                    value={geoType}
                                    onChange={(e) => setColumnRoles((prev) => ({ ...prev, [col]: { ...prev[col], geoType: e.target.value as GeoType } }))}
                                    className="h-8 rounded border px-2 text-xs max-w-[160px]"
                                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                                  >
                                    {(Object.entries(GEO_TYPE_LABELS) as [GeoType, string][]).map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                ) : <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>—</span>}
                              </td>
                              <td className="px-3 py-2">
                                <Input value={r.label} onChange={(e) => setColumnRoles((prev) => ({ ...prev, [col]: { ...prev[col], label: e.target.value } }))} className="h-8 text-xs max-w-[120px] rounded" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                              </td>
                              <td className="px-3 py-2">
                                <input type="checkbox" checked={r.visible} onChange={(e) => setColumnRoles((prev) => ({ ...prev, [col]: { ...prev[col], visible: e.target.checked } }))} className="rounded" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Relaciones</Button>
                  </div>
                </section>
              )}

              {/* Wizard A4: Relaciones — conectar con tablas de otras conexiones */}
              {wizard === "A" && wizardStep === 4 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Relaciones entre datasets (joins)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Opcional: definí cómo se combina este dataset con tablas de otras conexiones para análisis multi-dataset.</p>
                  <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--platform-fg-muted)" }}>Dataset actual</p>
                    <p className="font-medium text-sm" style={{ color: "var(--platform-fg)" }}>{etlTitle}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>{data?.schema}.{data?.tableName} · {data?.rowCount ?? 0} filas</p>
                  </div>
                  {datasetRelations.length > 0 && (
                    <div className="rounded-xl border mb-4 overflow-hidden" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <table className="w-full text-sm border-collapse">
                        <thead style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                          <tr>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Conexión / Tabla</th>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Columna este dataset</th>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Columna otra tabla</th>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Join</th>
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody style={{ color: "var(--platform-fg)" }}>
                          {datasetRelations.map((r) => (
                            <tr key={r.id} className="border-b last:border-b-0" style={{ borderColor: "var(--platform-border)" }}>
                              <td className="px-3 py-2">{r.connectionTitle} · {r.tableLabel}</td>
                              <td className="px-3 py-2">{getSampleDisplayLabel(r.thisColumn)}</td>
                              <td className="px-3 py-2">{r.otherColumn}</td>
                              <td className="px-3 py-2">{r.joinType}</td>
                              <td className="px-2 py-2">
                                <button type="button" onClick={() => removeRelation(r.id)} className="text-xs rounded px-2 py-1 hover:bg-red-500/10 text-red-600" aria-label="Quitar relación">Quitar</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                    <p className="text-xs font-medium mb-3" style={{ color: "var(--platform-fg-muted)" }}>Agregar relación</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[180px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Conexión</Label>
                        <Select value={relationFormConnectionId} onChange={(v: string) => setRelationFormConnectionId(v)} options={[{ value: "", label: "Elegir conexión" }, ...connectionOptions]} placeholder="Conexión" className="text-sm" buttonClassName="h-9" disablePortal />
                      </div>
                      <div className="min-w-[160px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Tabla</Label>
                        <Select
                          value={relationFormTableKey}
                          onChange={(v: string) => setRelationFormTableKey(v)}
                          options={[{ value: "", label: connectionTablesLoading ? "Cargando…" : "Elegir tabla" }, ...connectionTables.map((t) => ({ value: `${t.schema}.${t.name}`, label: `${t.schema}.${t.name}` }))]}
                          placeholder="Tabla"
                          className="text-sm"
                          buttonClassName="h-9"
                          disablePortal
                        />
                      </div>
                      <div className="min-w-[140px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Columna (este dataset)</Label>
                        <Select value={relationFormThisColumn} onChange={(v: string) => setRelationFormThisColumn(v)} options={[{ value: "", label: "Columna" }, ...fields.map((c) => ({ value: c, label: getSampleDisplayLabel(c) }))]} placeholder="Columna" className="text-sm" buttonClassName="h-9" disablePortal />
                      </div>
                      <div className="min-w-[140px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Columna (otra tabla)</Label>
                        <Select value={relationFormOtherColumn} onChange={(v: string) => setRelationFormOtherColumn(v)} options={[{ value: "", label: otherTableColumnsLoading ? "Cargando…" : "Columna" }, ...otherTableColumnsLoaded.map((c) => ({ value: c, label: c }))]} placeholder="Columna" className="text-sm" buttonClassName="h-9" disablePortal />
                      </div>
                      <div className="min-w-[100px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Tipo join</Label>
                        <Select value={relationFormJoinType} onChange={(v: string) => setRelationFormJoinType(v as "INNER" | "LEFT")} options={[{ value: "LEFT", label: "LEFT" }, { value: "INNER", label: "INNER" }]} buttonClassName="h-9" disablePortal />
                      </div>
                      <Button type="button" variant="outline" size="sm" className="rounded-lg h-9" style={{ borderColor: "var(--platform-border)" }} onClick={addRelation}>Agregar</Button>
                    </div>
                  </div>
                  {connectionsProp.length === 0 && (
                    <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>No hay otras conexiones disponibles. Creá conexiones en Admin para poder relacionar tablas.</p>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Publicar</Button>
                  </div>
                </section>
              )}

              {/* Wizard A5: Publicar (validación final) — resumen de todas las pestañas */}
              {wizard === "A" && wizardStep === 5 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Validación final</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Resumen de la configuración del dataset. Esta metadata quedará guardada para usar en métricas.</p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg)" }}>Nombre del dataset (opcional)</label>
                    <input
                      type="text"
                      value={datasetName}
                      onChange={(e) => setDatasetName(e.target.value)}
                      placeholder={etlTitle || "Ej. Ventas por región"}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                    />
                  </div>
                  <div className="space-y-4 mb-6">
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Origen (Profiling)</p>
                      <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                        <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Tabla: {data?.schema}.{data?.tableName}</li>
                        <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Columnas: {fields.length}</li>
                      </ul>
                    </div>
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Grain (clave única)</p>
                      <p className="text-sm" style={{ color: "var(--platform-fg)" }}>{grainOption ? (grainOption === "_custom" ? (grainCustomColumns.length > 0 ? grainCustomColumns.map(getSampleDisplayLabel).join(" + ") : "Personalizado") : getSampleDisplayLabel(grainOption)) : "—"}</p>
                    </div>
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Dimensión temporal</p>
                      {datasetHasTime ? (
                        <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                          <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Sí · Columna de tiempo: {(() => { const col = timeColumn || dateFields[0]; return col ? (data?.columnDisplay?.[col]?.label?.trim() || col) : "—"; })()} · {periodicity}</li>
                          {dateFields.length > 0 && (
                            <li className="pl-5 text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                              Columnas fecha: {dateFields.map((f) => `${getSampleDisplayLabel(f)} (${periodicityOverrides[f] ?? data?.dateColumnPeriodicity?.[f] ?? "Irregular"})`).join(", ")}
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-sm" style={{ color: "var(--platform-fg)" }}>No (sin dimensión temporal)</p>
                      )}
                    </div>
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Roles BI</p>
                      <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                        {(() => {
                          const allCols = [...new Set([...fields, ...derivedColumns.map((d) => d.name)])];
                          const keys = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "key");
                          const timeCols = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "time");
                          const dims = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "dimension");
                          const geoCols = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "geo");
                          const measures = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "measure");
                          return (
                            <>
                              {keys.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Key: {keys.map((c) => getSampleDisplayLabel(c)).join(", ")}</li>}
                              {timeCols.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Tiempo: {timeCols.map((c) => getSampleDisplayLabel(c)).join(", ")}</li>}
                              {dims.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Dimensiones: {dims.length} — {dims.slice(0, 5).map((c) => getSampleDisplayLabel(c)).join(", ")}{dims.length > 5 ? "…" : ""}</li>}
                              {geoCols.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Geo: {geoCols.map((c) => { const r = columnRoles[c] as { geoType?: GeoType }; const gt = r?.geoType ? GEO_TYPE_LABELS[r.geoType] : "—"; return `${getSampleDisplayLabel(c)} (${gt})`; }).join(", ")}</li>}
                              {measures.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Medidas: {measures.length} — {measures.slice(0, 5).map((c) => { const r = columnRoles[c]; const agg = r?.aggregation && r.aggregation !== "—" ? r.aggregation : "sum"; return `${getMeasureColumnLabel(c)} (${agg})`; }).join(", ")}{measures.length > 5 ? "…" : ""}</li>}
                            </>
                          );
                        })()}
                      </ul>
                    </div>
                    {derivedColumns.length > 0 && (
                      <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Columnas calculadas</p>
                        <p className="text-sm mb-1.5" style={{ color: "var(--platform-fg)" }}>Creadas desde métricas con fórmula; disponibles en «Insertar columna».</p>
                        <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                          {derivedColumns.map((d) => (
                            <li key={d.name} className="flex items-center justify-between gap-2">
                              <span><span style={{ color: "var(--platform-accent)" }}>✓</span> <strong>{d.name}</strong> = {d.expression} ({d.defaultAggregation})</span>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-500 hover:bg-red-500/10" onClick={() => setDeleteTarget({ type: "derived", name: d.name })} disabled={saving} title="Eliminar columna calculada" aria-label={`Eliminar ${d.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Relaciones (joins)</p>
                      {datasetRelations.length > 0 ? (
                        <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                          {datasetRelations.map((r) => (
                            <li key={r.id} className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> {r.connectionTitle} · {r.tableLabel}: {getSampleDisplayLabel(r.thisColumn)} = {r.otherColumn} ({r.joinType})</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Ninguna (solo este dataset)</p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveDatasetConfigAndGoToMetric} disabled={savingDatasetConfig}>
                      {savingDatasetConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {savingDatasetConfig ? " Guardando…" : datasetOnly ? " Guardar y volver a Datasets" : " Siguiente: Métrica"}
                    </Button>
                  </div>
                </section>
              )}

              {/* Wizard B0: Cálculo (unificado: tipo + simple / conteo / ratio / fórmula personalizada) */}
              {wizard === "B" && wizardStep === 0 && (
                <section className="rounded-xl border p-6 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Cálculo de la métrica</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Escribí la fórmula con nombres de columnas (estilo Excel). Podés usar números, literales entre comillas e IF(condición, valor_si_verdadero, valor_si_falso). Diferenciá entre cálculo por fila y cálculo agregado.</p>

                  {afterSaveInB && (
                    <div className="rounded-lg border p-3 flex flex-wrap items-center gap-3" style={{ borderColor: "var(--platform-accent)", background: "var(--platform-accent-dim, rgba(59,130,246,0.06))" }}>
                      <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
                        {afterSaveInB === "metric" ? "Métrica guardada." : "Columna creada."}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className="rounded-xl h-8" style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }} onClick={() => { setFormName(""); setAfterSaveInB(null); }}>
                          {afterSaveInB === "metric" ? "Crear otra métrica" : "Crear otra columna"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl h-8" style={{ borderColor: "var(--platform-border)" }} onClick={() => { setAfterSaveInB(null); setWizard("C"); setWizardStep(0); }}>
                          Ir a Análisis
                        </Button>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const exprMetric = formMetrics[0];
                    const exprValue = (exprMetric as { expression?: string })?.expression ?? "";
                    const isAggregate = expressionHasAggregation(exprValue);
                    return (
                    <div className="space-y-4">
                      <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                        <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Determinación automática según la fórmula</p>
                        <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Según la fórmula que uses, se guarda en un lugar u otro:</p>
                        <ul className="text-xs space-y-1" style={{ color: "var(--platform-fg-muted)" }}>
                          <li><strong>Por fila</strong> (sin SUM, AVG, COUNT…): se guarda como <strong>columna en el dataset</strong>. No modifica la cantidad de filas.</li>
                          <li><strong>Agregado</strong> (con SUM, AVERAGE, COUNT…): se guarda como <strong>métrica en «Calculadas»</strong>. No se puede crear columna (seguridad de granularidad).</li>
                        </ul>
                        {exprValue.trim() && (
                          <p className="text-xs font-medium" style={{ color: isAggregate ? "var(--platform-accent)" : "var(--platform-fg)" }}>
                            {isAggregate ? "→ Se guardará como métrica en «Calculadas» (determinado por la fórmula)." : "→ Se guardará como columna en el dataset (determinado por la fórmula)."}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Fórmulas predeterminadas (estilo Excel)</Label>
                        <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Escribí la expresión con nombres de columnas (ej. CANTIDAD * PRECIO_UNITARIO o IF(ESTADO=&quot;PAGADO&quot;, 1, 0)). Usá «Insertar columna» para medidas ya creadas.</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {[" * ", " / ", " + ", " - ", " * 100 / "].map((op) => (
                            <button key={op} type="button" onClick={() => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: ((m as { expression?: string }).expression ?? "") + op } : m))} className="px-2 py-1.5 rounded text-xs border font-mono" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}>{op.trim()}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Label className="text-sm font-medium block" style={{ color: "var(--platform-fg-muted)" }}>Fórmula personalizada (columnas)</Label>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0" onClick={() => setFormulasHelpOpen(true)} title="Ver todas las fórmulas de Excel" style={{ color: "var(--platform-accent)" }}>
                              <HelpCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        <div className="flex gap-2 flex-wrap items-end">
                          <div className="flex-1 min-w-[200px]">
                            <Input
                              ref={(el) => { formulaInputRef.current = el; }}
                              value={exprValue}
                              onChange={(e) => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: e.target.value } : m))}
                              placeholder="Ej. CANTIDAD * PRECIO_UNITARIO"
                              className="font-mono text-sm rounded-lg w-full !bg-[var(--platform-bg)]"
                              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Insertar medida</Label>
                            <Select
                              value=""
                              onChange={(val: string) => {
                                if (!val) return;
                                const el = formulaInputRef.current;
                                if (el && "value" in el) {
                                  const input = el as HTMLInputElement;
                                  const cur = exprValue;
                                  const start = input.selectionStart ?? cur.length;
                                  const end = input.selectionEnd ?? cur.length;
                                  setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: cur.slice(0, start) + val + cur.slice(end) } : m));
                                  setTimeout(() => { input.focus(); input.setSelectionRange(start + val.length, start + val.length); }, 0);
                                }
                              }}
                              options={[{ value: "", label: "Medida…" }, ...measureColumns.map((c) => ({ value: c, label: getMeasureColumnLabel(c) }))]}
                              placeholder={measureColumns.length === 0 ? "Sin medidas" : "Medida…"}
                              className="min-w-[140px]"
                              buttonClassName="h-9 text-sm"
                              disablePortal
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Insertar dimensión</Label>
                            <Select
                              value=""
                              onChange={(val: string) => {
                                if (!val) return;
                                const el = formulaInputRef.current;
                                if (el && "value" in el) {
                                  const input = el as HTMLInputElement;
                                  const cur = exprValue;
                                  const start = input.selectionStart ?? cur.length;
                                  const end = input.selectionEnd ?? cur.length;
                                  setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: cur.slice(0, start) + val + cur.slice(end) } : m));
                                  setTimeout(() => { input.focus(); input.setSelectionRange(start + val.length, start + val.length); }, 0);
                                }
                              }}
                              options={[{ value: "", label: "Dimensión…" }, ...fields.filter((c) => { const role = columnRoles[c]?.role ?? "dimension"; return role === "dimension" || role === "key" || role === "time" || role === "geo"; }).map((c) => ({ value: c, label: getSampleDisplayLabel(c) }))]}
                              placeholder="Dimensión…"
                              className="min-w-[140px]"
                              buttonClassName="h-9 text-sm"
                              disablePortal
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Insertar métrica guardada</Label>
                            <Select
                              value=""
                              onChange={(val: string) => {
                                if (!val) return;
                                const el = formulaInputRef.current;
                                if (el && "value" in el) {
                                  const input = el as HTMLInputElement;
                                  const cur = exprValue;
                                  const start = input.selectionStart ?? cur.length;
                                  const end = input.selectionEnd ?? cur.length;
                                  setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: cur.slice(0, start) + val + cur.slice(end) } : m));
                                  setTimeout(() => { input.focus(); input.setSelectionRange(start + val.length, start + val.length); }, 0);
                                }
                              }}
                              options={[{ value: "", label: "Calculadas…" }, ...savedMetrics.map((s) => ({ value: s.name, label: s.name }))]}
                              placeholder={savedMetrics.length === 0 ? "Sin métricas" : "Calculadas…"}
                              className="min-w-[160px]"
                              buttonClassName="h-9 text-sm"
                              disablePortal
                            />
                          </div>
                          {savedMetrics.length >= 2 && (
                            <div className="rounded-lg border p-3 space-y-2 col-span-full" style={{ borderColor: "var(--platform-accent-dim)", background: "var(--platform-surface)" }}>
                              <Label className="text-sm font-medium block" style={{ color: "var(--platform-fg)" }}>Reutilizar métricas existentes (ratio)</Label>
                              <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Elegí dos métricas guardadas y una fórmula con metric_0 (primera) y metric_1 (segunda). Ej.: metric_0 / NULLIF(metric_1, 0).</p>
                              <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex flex-col gap-1">
                                  <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Métrica 1 (metric_0)</Label>
                                  <Select
                                    value={formulaFromSavedMetricIds[0] ?? ""}
                                    onChange={(val: string) => setFormulaFromSavedMetricIds((prev) => [val ?? "", prev[1] ?? ""])}
                                    options={[{ value: "", label: "—" }, ...savedMetrics.map((s) => ({ value: String(s.id), label: s.name ?? String(s.id) }))]}
                                    placeholder="Seleccionar"
                                    className="min-w-[160px]"
                                    buttonClassName="h-9 text-sm"
                                    disablePortal
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Métrica 2 (metric_1)</Label>
                                  <Select
                                    value={formulaFromSavedMetricIds[1] ?? ""}
                                    onChange={(val: string) => setFormulaFromSavedMetricIds((prev) => [prev[0] ?? "", val ?? ""])}
                                    options={[{ value: "", label: "—" }, ...savedMetrics.filter((s) => String(s.id) !== formulaFromSavedMetricIds[0]).map((s) => ({ value: String(s.id), label: s.name ?? String(s.id) }))]}
                                    placeholder="Seleccionar"
                                    className="min-w-[160px]"
                                    buttonClassName="h-9 text-sm"
                                    disablePortal
                                  />
                                </div>
                                <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                                  <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Fórmula (metric_0, metric_1)</Label>
                                  <Input
                                    value={formulaFromReuseExpr}
                                    onChange={(e) => setFormulaFromReuseExpr(e.target.value)}
                                    placeholder="metric_0 / NULLIF(metric_1, 0)"
                                    className="font-mono text-sm rounded-lg !bg-[var(--platform-bg)]"
                                    style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                                  />
                                </div>
                              </div>
                              {formulaFromSavedMetricIds.length >= 2 && (
                                <p className="text-xs" style={{ color: "var(--platform-accent)" }}>Vista previa usará estas dos métricas + la fórmula. Guardá con el nombre de la métrica abajo.</p>
                              )}
                            </div>
                          )}
                          {formMetrics.length > 1 && (
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Combinar métricas de este análisis (metric_0, metric_1…)</Label>
                              <Select
                                value=""
                                onChange={(val: string) => {
                                  if (!val) return;
                                  const el = formulaInputRef.current;
                                  if (el && "value" in el) {
                                    const input = el as HTMLInputElement;
                                    const cur = exprValue;
                                    const start = input.selectionStart ?? cur.length;
                                    const end = input.selectionEnd ?? cur.length;
                                    setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: cur.slice(0, start) + val + cur.slice(end) } : m));
                                    setTimeout(() => { input.focus(); input.setSelectionRange(start + val.length, start + val.length); }, 0);
                                  }
                                }}
                                options={[{ value: "", label: "Insertar…" }, ...formMetrics.map((mm, idx) => ({ value: `metric_${idx}`, label: `metric_${idx} (${mm.alias || mm.field || `Métrica ${idx + 1}`})` }))]}
                                placeholder="metric_0, metric_1…"
                                className="min-w-[180px]"
                                buttonClassName="h-9 text-sm"
                                disablePortal
                              />
                              <p className="text-[11px]" style={{ color: "var(--platform-fg-muted)" }}>Orden: {formMetrics.map((mm, idx) => `metric_${idx}=«${mm.alias || mm.field || ""}»`).join(", ")}</p>
                            </div>
                          )}
                        </div>
                        {formulaSyntaxError && (
                          <p className="text-sm mt-2 rounded-lg py-2 px-3 border" role="alert" style={{ color: "var(--platform-fg)", borderColor: "var(--platform-error, #dc2626)", background: "var(--platform-error-muted, rgba(220,38,38,0.08))" }}>
                            {formulaSyntaxError}
                          </p>
                        )}
                        {/* Opción explícita: Columna o Métrica. Sugerencia automática según fórmula. */}
                        <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                          <Label className="text-sm font-medium block" style={{ color: "var(--platform-fg)" }}>Definí cómo guardar</Label>
                          <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>
                            {exprValue.trim() ? (
                              isAggregate
                                ? "Sugerencia automática: se guardará como métrica (la fórmula usa agregación). Podés usar el botón «Guardar como métrica»."
                                : "Sugerencia automática: se puede guardar como columna (fórmula por fila). Elegí «Crear columna» o «Guardar como métrica»."
                            ) : "Escribí una fórmula y elegí si guardar como columna en el dataset o como métrica en «Calculadas»."}
                          </p>
                          {grainSafetyErrorForColumn && (
                            <p className="text-xs py-1.5 px-2 rounded border" role="alert" style={{ color: "var(--platform-error, #dc2626)", borderColor: "var(--platform-error, #dc2626)", background: "var(--platform-error-muted, rgba(220,38,38,0.08))" }}>{grainSafetyErrorForColumn}</p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs block" style={{ color: "var(--platform-fg-muted)" }}>Nombre de columna (para «Crear columna»)</Label>
                              <Input value={exprMetric?.alias ?? ""} onChange={(e) => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, alias: e.target.value } : m))} placeholder="Ej. factura, total_linea" className="h-9 text-sm rounded-lg w-full max-w-[220px] !bg-[var(--platform-bg)]" style={{ borderColor: aliasSyntaxError ? "var(--platform-error, #dc2626)" : "var(--platform-border)", color: "var(--platform-fg)" }} />
                              {aliasSyntaxError && <p className="text-xs" style={{ color: "var(--platform-error, #dc2626)" }}>{aliasSyntaxError}</p>}
                              <Button type="button" className="rounded-xl h-9" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={createColumnFromFormula} disabled={creatingColumn || !exprValue.trim() || !(exprMetric?.alias ?? "").trim() || !!formulaSyntaxError || !!aliasSyntaxError || !!grainSafetyErrorForColumn || isAggregate} title={isAggregate ? "La fórmula usa agregación; usá «Guardar como métrica»." : undefined}>
                                {creatingColumn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {creatingColumn ? " Creando…" : " Crear columna"}
                              </Button>
                              {isAggregate && exprValue.trim() && (
                                <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Fórmula con agregación: solo disponible «Guardar como métrica».</p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs block" style={{ color: "var(--platform-fg-muted)" }}>Nombre de la métrica (para «Guardar como métrica»)</Label>
                              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej. Ventas totales, Cantidad vendida" className="h-9 text-sm rounded-lg w-full max-w-[220px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                              <Button type="button" className="rounded-xl h-9" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetricFromCalculationStep} disabled={saving || !formName.trim() || (!(formulaFromSavedMetricIds.length >= 2 && formulaFromReuseExpr.trim()) && (!exprValue.trim() || !!formulaSyntaxError))}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {saving ? " Guardando…" : " Guardar como métrica"}
                              </Button>
                            </div>
                          </div>
                        </div>
                        {/* Vista previa de lo que se guardará */}
                        {(exprValue.trim() || (exprMetric?.alias ?? "").trim()) && (
                          <div className="rounded-lg border p-4 mt-3" style={{ borderColor: "var(--platform-accent)", background: "var(--platform-accent-dim, rgba(59,130,246,0.06))" }}>
                            <p className="text-sm font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Vista previa de lo que se guardará</p>
                            {isAggregate ? (
                              <ul className="text-xs space-y-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                                <li><strong style={{ color: "var(--platform-fg)" }}>Se guardará como métrica</strong> en «Calculadas (métricas)»:</li>
                                <li>· Nombre: <strong style={{ color: "var(--platform-fg)" }}>{formName || "—"}</strong></li>
                                <li>· Fórmula: <code className="text-xs font-mono">{exprValue || "—"}</code></li>
                                <li>· Agregación: <strong>{formMetrics[0]?.func ?? "SUM"}</strong></li>
                              </ul>
                            ) : (
                              <ul className="text-xs space-y-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                                <li><strong style={{ color: "var(--platform-fg)" }}>Se guardará como columna</strong> en «Columnas calculadas del dataset»:</li>
                                <li>· Nombre de columna: <strong style={{ color: "var(--platform-fg)" }}>{(exprMetric?.alias ?? "").trim() || "—"}</strong></li>
                                <li>· Expresión: <code className="text-xs font-mono">{exprValue || "—"}</code></li>
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  {/* Previsualización del resultado en el paso Cálculo */}
                  <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-sm font-medium mb-2" style={{ color: "var(--platform-fg)" }}>Previsualización del resultado</p>
                    <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Verificá que el cálculo devuelve el valor esperado antes de seguir.</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={previewLoading || formMetrics.length === 0 || !!formulaSyntaxError} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                        {previewLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        Actualizar previsualización
                      </Button>
                    </div>
                    {previewData && previewData.length > 0 && (() => {
                      const hasPeriodo = previewData.length > 1 && (previewData[0] as Record<string, unknown>)["periodo"] != null;
                      const metricKey = `metric_${formMetrics.length - 1}`;
                      const totalValue = hasPeriodo
                        ? previewData.reduce((sum, row) => sum + (Number((row as Record<string, unknown>)[metricKey]) || 0), 0)
                        : previewCalculationResult;
                      return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                            <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--platform-accent)" }}>{totalValue != null ? formatNumber(totalValue) : "—"}</p>
                            <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>{hasPeriodo ? `Total (${previewData.length} períodos)` : "Resultado"}</p>
                          </div>
                          <div className="rounded-xl border col-span-2 overflow-auto max-h-[240px]" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                            <table className="w-full text-xs" style={{ color: "var(--platform-fg)" }}>
                              <thead className="sticky top-0 z-10" style={{ background: "var(--platform-surface)" }}><tr style={{ borderBottom: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}>{previewDisplayHeaders.map((label, i) => (<th key={i} className="text-left py-1.5 px-2 font-medium">{label}</th>))}</tr></thead>
                              <tbody>{previewData.map((row, idx) => {
                                const raw = row as Record<string, unknown>;
                                const keys = Object.keys(raw);
                                return (<tr key={idx} style={{ borderBottom: "1px solid var(--platform-border)" }}>{keys.map((k, i) => {
                                  const v = raw[k];
                                  const dateDisplay = formatPreviewDateValue(v, k);
                                  const display = dateDisplay ?? (typeof v === "number" ? formatNumber(v) : String(v ?? ""));
                                  return (<td key={i} className="py-1.5 px-2 tabular-nums">{display}</td>);
                                })}</tr>);
                              })}</tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                      );
                    })()}
                  </div>

                  {((formMetrics[0] as { expression?: string })?.expression ?? "").includes("/") && (
                    <div className="rounded-lg border p-3 flex items-start gap-2 mt-4" style={{ borderColor: "var(--platform-accent)", background: "var(--platform-accent-dim, rgba(59,130,246,0.06))" }}>
                      <span className="text-sm" style={{ color: "var(--platform-fg)" }}>Detectamos un ratio (división). En el siguiente paso podés confirmar cómo se debe agregar.</span>
                    </div>
                  )}

                  <div className="flex justify-between pt-2">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext} disabled={!!formulaSyntaxError}>
                      Siguiente: Propiedades
                    </Button>
                  </div>
                </section>
              )}

              {/* Wizard B1: Propiedades matemáticas */}
              {wizard === "B" && wizardStep === 1 && (() => {
                const formulaHasDivision = ((formMetrics[0] as { expression?: string })?.expression ?? "").includes("/");
                return (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Propiedades matemáticas</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Declara el comportamiento de la métrica. Previene agregaciones incorrectas en tablas y totales.</p>
                  {formulaHasDivision && metricAdditivity === "additive" && (
                    <div className="rounded-lg border p-3 mb-4" style={{ borderColor: "var(--platform-error, #dc2626)", background: "rgba(220,38,38,0.06)" }}>
                      <p className="text-xs font-medium" style={{ color: "var(--platform-error, #dc2626)" }}>La fórmula contiene una división. Si la definís como Aditiva, al agrupar por otra dimensión el resultado puede ser incorrecto (se sumarían ratios en lugar de calcular SUM(numerador)/SUM(denominador)). Recomendamos dejar «No aditiva (ratio)».</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {(["additive", "semi", "non"] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setMetricAdditivity(t)} className="p-4 rounded-xl border text-left transition-colors" style={{ borderColor: metricAdditivity === t ? "var(--platform-accent)" : "var(--platform-border)", background: metricAdditivity === t ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                        <span className="font-medium block" style={{ color: "var(--platform-fg)" }}>{t === "additive" ? "Aditiva" : t === "semi" ? "Semi-aditiva" : "No aditiva (ratio)"}</span>
                        <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{t === "additive" ? "Se suma en todos los ejes" : t === "semi" ? "Ej: stock (no suma en tiempo)" : "Ej: margen%, conversión"}</span>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Ratios y cálculos no aditivos</p>
                    <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Si la métrica es un ratio o porcentaje, definila como <strong style={{ color: "var(--platform-fg)" }}>No aditiva (ratio)</strong>. El motor prioriza el cálculo agregado correcto.</p>
                    <p className="text-xs mb-1" style={{ color: "var(--platform-error, #dc2626)" }}>Incorrecto: SUM(MARGEN_PCT) — sumar porcentajes por fila da resultados erróneos.</p>
                    <p className="text-xs" style={{ color: "var(--platform-accent)" }}>Correcto: SUM(VENTA - COSTO) / SUM(VENTA) — definí dos métricas (numerador y denominador) y una fórmula ratio (metric_0 / metric_1).</p>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Filtros base</Button>
                  </div>
                </section>
              ); })()}

              {/* Wizard B2: Filtros base */}
              {wizard === "B" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Filtros base (opcional)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Filtros que se aplican siempre a esta métrica.</p>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>Filtros</Label>
                    <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 text-xs" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} onClick={() => setFormFilters((f) => [...f, { id: `f-${Date.now()}`, field: fields[0] ?? "", operator: "=", value: "" }])}>+ Añadir filtro</Button>
                  </div>
                  {formFilters.length > 0 && (
                    <div className="space-y-2">
                      {formFilters.map((f, i) => {
                        const selectedArr = getFilterSelectedValues(f);
                        const isListMode = Array.isArray(f.value);
                        const listValues = filterFieldValues[f.field] ?? [];
                        const filteredList = !filterListSearch.trim() ? listValues : listValues.filter((v) => String(v).toLowerCase().includes(filterListSearch.trim().toLowerCase()));
                        return (
                        <div key={f.id} className="flex flex-wrap gap-2 items-center rounded-lg border p-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                          <Select value={f.field} onChange={(val: string) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, field: val } : ff))} options={allColumnsForRoles.map((name) => ({ value: name, label: derivedColumnsByName[name] ? `${name} (calculada)` : getSampleDisplayLabel(name) }))} placeholder="Campo" className="min-w-[120px]" buttonClassName="h-9 text-xs" disablePortal />
                          <Select value={f.operator} onChange={(val: string) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, operator: val } : ff))} options={FILTER_OPERATOR_OPTIONS} placeholder="Op" className="min-w-[140px]" buttonClassName="h-9 text-xs" disablePortal />
                          <Input value={isListMode ? "" : (f.value != null ? String(f.value) : "")} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: e.target.value || null } : ff))} placeholder={isListMode ? `${selectedArr.length} de lista` : "Valor (manual)"} className="h-8 text-xs rounded-lg flex-1 min-w-[80px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                          {f.field && (
                            <>
                              {dateFields.includes(f.field) && (
                                <Select
                                  value={filterDateLevel[f.id] || "year"}
                                  onChange={(val: string) => {
                                    const level = val || "year";
                                    setFilterDateLevel((prev) => ({ ...prev, [f.id]: level }));
                                    const opt = DATE_LEVEL_OPTIONS.find((o) => o.value === level);
                                    if (opt) setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, operator: opt!.operator } : ff));
                                    setFilterFieldValues((prev) => ({ ...prev, [f.field]: [] }));
                                  }}
                                  options={DATE_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                                  placeholder="Nivel"
                                  className="min-w-[100px]"
                                  buttonClassName="h-8 text-xs"
                                  disablePortal
                                />
                              )}
                              <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} disabled={filterFieldLoading === f.field} onClick={async () => { setFilterFieldLoading(f.field); try { const dateLevel = dateFields.includes(f.field) ? (filterDateLevel[f.id] || "year") : undefined; const url = dateLevel ? `/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(f.field)}&dateLevel=${encodeURIComponent(dateLevel)}` : `/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(f.field)}`; const res = await fetch(url); const data = await safeJsonResponse(res); if (res.ok && Array.isArray(data.values)) setFilterFieldValues((prev) => ({ ...prev, [f.field]: data.values as string[] })); } finally { setFilterFieldLoading(null); } }}>
                                {filterFieldLoading === f.field ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cargar lista"}
                              </Button>
                              {listValues.length ? (
                                <Popover open={filterListOpenId === f.id} onOpenChange={(open) => { setFilterListOpenId(open ? f.id : null); if (!open) setFilterListSearch(""); }}>
                                  <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0 min-w-[120px]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}>
                                      {selectedArr.length ? `${selectedArr.length} seleccionado${selectedArr.length !== 1 ? "s" : ""}` : "Elegir de la lista…"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80 p-2" align="start" style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)" }}>
                                    <div className="flex gap-1 mb-2">
                                      <Button type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: [...listValues] } : ff))}>Seleccionar todos</Button>
                                      <Button type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: [] } : ff))}>Quitar todo</Button>
                                    </div>
                                    <input type="text" placeholder="Buscar…" value={filterListOpenId === f.id ? filterListSearch : ""} onChange={(e) => setFilterListSearch(e.target.value)} className="w-full rounded border px-2 py-1.5 text-xs mb-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                                      {filteredList.map((v) => {
                                        const checked = selectedArr.includes(v);
                                        return (
                                          <label key={String(v)} className="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-black/5 text-sm" style={{ color: "var(--platform-fg)" }}>
                                            <Checkbox checked={checked} onCheckedChange={(checked) => { const next = checked ? [...selectedArr, v] : selectedArr.filter((x) => x !== v); setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: next } : ff)); }} />
                                            <span>{String(v)}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              ) : null}
                            </>
                          )}
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setFormFilters((prev) => prev.filter((_, ii) => ii !== i))}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ); })}
                    </div>
                  )}

                  <div className="mt-6 rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Ver valores de una columna</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                      Elegí una columna y cargá los valores que tiene la tabla. Sirve para revisar opciones al definir filtros (igual que en Columnas y filtros del ETL).
                    </p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columna</span>
                      <Select
                        value={metricsDistinctColumn ?? ""}
                        onChange={(val: string) => {
                          const col = val || null;
                          setMetricsDistinctColumn(col);
                          setMetricsDistinctValues([]);
                          setMetricsDistinctSearch("");
                        }}
                        options={[{ value: "", label: "Elegir columna" }, ...allColumnsForRoles.map((col) => ({ value: col, label: derivedColumnsByName[col] ? `${col} (calculada)` : getSampleDisplayLabel(col) }))]}
                        placeholder="Elegir columna"
                        className="min-w-[160px]"
                        disablePortal
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        style={{ borderColor: "var(--platform-border)" }}
                        disabled={!metricsDistinctColumn || metricsDistinctLoading}
                        onClick={async () => {
                          if (!metricsDistinctColumn) return;
                          setMetricsDistinctLoading(true);
                          setMetricsDistinctValues([]);
                          try {
                            const res = await fetch(`/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(metricsDistinctColumn)}`);
                            const data = await safeJsonResponse(res);
                            if (data.ok && Array.isArray(data.values)) setMetricsDistinctValues(data.values);
                            else toast.error(data?.error || "No se pudieron cargar los valores");
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Error al cargar");
                          } finally {
                            setMetricsDistinctLoading(false);
                          }
                        }}
                      >
                        {metricsDistinctLoading ? "Cargando…" : "Cargar valores"}
                      </Button>
                    </div>
                    {metricsDistinctValues.length > 0 && metricsDistinctColumn && (
                      <>
                        <input
                          type="text"
                          placeholder="Buscar valor…"
                          value={metricsDistinctSearch}
                          onChange={(e) => setMetricsDistinctSearch(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                        />
                        <div className="max-h-48 overflow-y-auto rounded-lg border space-y-0.5 p-2" style={{ borderColor: "var(--platform-border)" }}>
                          {metricsDistinctValues
                            .filter((v) => !metricsDistinctSearch.trim() || String(v).toLowerCase().includes(metricsDistinctSearch.trim().toLowerCase()))
                            .map((val) => (
                              <div
                                key={String(val)}
                                className="py-1.5 px-2 rounded text-sm"
                                style={{ color: "var(--platform-fg)" }}
                              >
                                {String(val)}
                              </div>
                            ))}
                        </div>
                        <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                          {metricsDistinctValues.length} valor{metricsDistinctValues.length !== 1 ? "es" : ""} en esta columna.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Preview</Button>
                  </div>
                </section>
              )}

              {/* Wizard B3: Preview métrica */}
              {wizard === "B" && wizardStep === 3 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Preview de la métrica</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Validá que el KPI se comporta como esperás. Si guardás como métrica, indicá un nombre abajo.</p>
                  <div className="mb-4">
                    <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Nombre al guardar (opcional)</Label>
                    <Input value={metricNameToSave} onChange={(e) => setMetricNameToSave(e.target.value)} placeholder="Ej. Ventas totales" className="rounded-xl max-w-md" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                    <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>Obligatorio si hacés clic en «Guardar métrica». Aparecerá en «Calculadas (métricas)».</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={previewLoading || formMetrics.length === 0} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                      {previewLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Actualizar preview
                    </Button>
                  </div>
                  {previewData && previewData.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--platform-accent)" }}>{previewKpiValue != null ? formatNumber(previewKpiValue) : "—"}</p>
                        <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>Total {metricNameToSave || formMetrics[0]?.alias || formMetrics[0]?.field || "métrica"}</p>
                      </div>
                      <div className="rounded-xl border p-4 col-span-2 overflow-auto max-h-[180px]" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <table className="w-full text-xs" style={{ color: "var(--platform-fg)" }}>
                          <thead><tr style={{ borderBottom: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}>{previewData[0] && Object.keys(previewData[0]).map((k) => (<th key={k} className="text-left py-1 px-2">{k}</th>))}</tr></thead>
                          <tbody>{previewData.slice(0, 5).map((row, idx) => {
                            const raw = row as Record<string, unknown>;
                            const keys = Object.keys(raw);
                            return (
                            <tr key={idx} style={{ borderBottom: "1px solid var(--platform-border)" }}>
                              {keys.map((k, i) => {
                                const v = raw[k];
                                const dateDisplay = formatPreviewDateValue(v, k);
                                const num = typeof v === "number" ? v : (v != null && v !== "" ? Number(v) : NaN);
                                const display = dateDisplay ?? (!isNaN(num) ? formatNumber(num) : String(v ?? ""));
                                return (<td key={i} className="py-1 px-2 tabular-nums">{display}</td>);
                              })}
                            </tr>
                          ); })}</tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Análisis</Button>
                  </div>
                </section>
              )}

              {/* Wizard C0: Identidad del análisis */}
              {wizard === "C" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Identidad — Nombre del análisis</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Nombre para este análisis o vista. Se usará al guardar el gráfico o widget.</p>
                  <div className="mb-4">
                    <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Nombre del análisis</Label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej. Ventas por mes, Cantidad y Facturación" className="rounded-xl max-w-md" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Métricas</Button>
                  </div>
                </section>
              )}

              {/* Wizard C1: Métricas (selección de una o varias métricas guardadas) */}
              {wizard === "C" && wizardStep === 1 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Métricas del análisis</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná una o varias métricas creadas para visualizarlas en tabla o gráfico (p. ej. Cantidad y Facturación en un Combo).</p>
                  {savedMetrics.length === 0 ? (
                    <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-sm mb-2" style={{ color: "var(--platform-fg-muted)" }}>No hay métricas guardadas. Creá al menos una en el paso <strong style={{ color: "var(--platform-fg)" }}>Métrica</strong> (Cálculo → guardar) y volvé acá.</p>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }} onClick={() => { setWizard("B"); setWizardStep(0); }}>Ir a Métrica</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {savedMetrics.map((m) => {
                          const selected = analysisSelectedMetricIds.includes(m.id);
                          return (
                            <label key={m.id} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors" style={{ borderColor: selected ? "var(--platform-accent)" : "var(--platform-border)", background: selected ? "var(--platform-accent-dim)" : "var(--platform-bg)", color: "var(--platform-fg)" }}>
                              <input type="checkbox" checked={selected} onChange={() => setAnalysisSelectedMetricIds((prev) => selected ? prev.filter((id) => id !== m.id) : [...prev, m.id])} className="rounded" />
                              <span>{m.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>{analysisSelectedMetricIds.length} métrica{analysisSelectedMetricIds.length !== 1 ? "s" : ""} seleccionada{analysisSelectedMetricIds.length !== 1 ? "s" : ""}.</p>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl mb-4" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} onClick={() => { setWizard("B"); setWizardStep(0); }}>+ Crear nueva métrica</Button>
                    </>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext} disabled={savedMetrics.length > 0 && analysisSelectedMetricIds.length === 0}>Siguiente: Dimensiones y Tiempo</Button>
                  </div>
                </section>
              )}

              {/* Wizard C2: Dimensiones y Tiempo (unificado: si se selecciona una dimensión tipo Fecha, se despliega Tiempo abajo) */}
              {wizard === "C" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Dimensiones y Tiempo</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Elegí dimensiones para agrupar (opcional). Si agregás una de tipo Fecha, abajo se despliega la configuración de Tiempo (rango y granularidad).</p>

                  <div className="mb-6">
                    <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Dimensiones (opcionales)</Label>
                    <div className="space-y-3">
                      {formDimensions.map((dim, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <Label className="text-xs font-medium block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Dimensión {formDimensions.length > 1 ? i + 1 : ""}</Label>
                            <AdminFieldSelector label="" value={dim} onChange={(v) => setFormDimensions((prev) => prev.map((d, j) => (j === i ? v : d)))} etlData={etlData} fieldType="all" placeholder="Ninguna..." className="[&_button]:!rounded-lg [&_button]:!border [&_button]:!border-[var(--platform-border)] [&_button]:!bg-[var(--platform-bg)] [&_button]:!text-[var(--platform-fg)]" />
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-500 mt-6" onClick={() => setFormDimensions((prev) => prev.filter((_, j) => j !== i))} title="Quitar dimensión"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} onClick={() => setFormDimensions((prev) => [...prev, ""])}>
                        + Agregar dimensión
                      </Button>
                    </div>
                    {formDimensions.length === 0 && (
                      <p className="text-xs mt-2" style={{ color: "var(--platform-fg-muted)" }}>Sin dimensiones: el resultado será un único valor agregado (ideal para KPIs).</p>
                    )}
                  </div>

                  {/* Tiempo: se despliega cuando hay al menos una dimensión de tipo Fecha seleccionada */}
                  {(() => {
                    const dateDimsInSelection = formDimensions.filter((d) => d && dateFields.includes(d));
                    const showTime = dateDimsInSelection.length > 0;
                    if (!showTime) {
                      if (dateFields.length > 0 && formDimensions.some(Boolean)) {
                        return <p className="text-xs mt-2" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná una columna de tipo Fecha en Dimensiones para desplegar la configuración de Tiempo (rango y granularidad).</p>;
                      }
                      return null;
                    }
                    return (
                      <div className="rounded-lg border p-4 mt-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                        <h4 className="text-sm font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Tiempo: rango y granularidad</h4>
                        <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Configurá el período y la granularidad para la dimensión temporal. Si elegiste una columna Fecha en Dimensiones, usala como base.</p>
                        {dateFields.length > 0 ? (
                          <>
                            <div className="mb-4">
                              <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Dimensión temporal</Label>
                              <Select
                                value={timeColumn || dateDimsInSelection[0] || dateFields[0] || ""}
                                onChange={(v: string) => setTimeColumn(v)}
                                options={dateFields.map((f) => ({ value: f, label: getSampleDisplayLabel(f) }))}
                                placeholder="Elegir columna de fecha…"
                                className="w-full"
                                buttonClassName="h-9 text-sm"
                                disablePortal
                              />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 mb-4">
                              <div>
                                <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Rango</Label>
                                <Select
                                  value={analysisTimeRange}
                                  onChange={(v: string) => setAnalysisTimeRange(v)}
                                  options={[
                                    { value: "0", label: "No aplicar rango" },
                                    { value: "custom", label: "Personalizable" },
                                    { value: "7", label: "Últimos 7 días" },
                                    { value: "30", label: "Últimos 30 días" },
                                    { value: "3", label: "Últimos 3 meses" },
                                    { value: "6", label: "Últimos 6 meses" },
                                    { value: "12", label: "Últimos 12 meses" },
                                    { value: "24", label: "Últimos 24 meses" },
                                  ]}
                                  placeholder="Rango…"
                                  className="w-full"
                                  buttonClassName="h-9 text-sm"
                                  disablePortal
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Granularidad</Label>
                                <Select
                                  value={analysisGranularity}
                                  onChange={(v: string) => setAnalysisGranularity(v)}
                                  options={[
                                    { value: "", label: "No agrupar por tiempo" },
                                    { value: "day", label: "Día" },
                                    { value: "week", label: "Semana" },
                                    { value: "month", label: "Mes" },
                                    { value: "quarter", label: "Trimestre" },
                                    { value: "semester", label: "Semestre" },
                                    { value: "year", label: "Año" },
                                  ]}
                                  placeholder="Granularidad…"
                                  className="w-full"
                                  buttonClassName="h-9 text-sm"
                                  disablePortal
                                />
                              </div>
                            </div>
                            <div className="mb-4">
                              <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Formato de fecha en vista previa</Label>
                              <Select
                                value={analysisDateFormat}
                                onChange={(v: string) => setAnalysisDateFormat(v as typeof analysisDateFormat)}
                                options={[
                                  { value: "short", label: "dd/MM/yyyy" },
                                  { value: "monthYear", label: "Mes Año (ej. Oct 2025)" },
                                  { value: "year", label: "Solo año" },
                                  { value: "datetime", label: "dd/MM/yyyy HH:mm" },
                                ]}
                                placeholder="Formato…"
                                className="w-full"
                                buttonClassName="h-9 text-sm"
                                disablePortal
                              />
                            </div>
                            {analysisTimeRange === "custom" && (
                              <div className="grid grid-cols-2 gap-3 mb-4">
                                <div>
                                  <Label className="text-sm font-medium mb-1 block" style={{ color: "var(--platform-fg-muted)" }}>Desde</Label>
                                  <Input type="date" value={analysisDateFrom} onChange={(e) => setAnalysisDateFrom(e.target.value)} className="h-9 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                                </div>
                                <div>
                                  <Label className="text-sm font-medium mb-1 block" style={{ color: "var(--platform-fg-muted)" }}>Hasta</Label>
                                  <Input type="date" value={analysisDateTo} onChange={(e) => setAnalysisDateTo(e.target.value)} className="h-9 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>No hay columnas de fecha en el dataset. Configurá una en el paso Tiempo del Dataset (Wizard A).</p>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex justify-between mt-6">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Filtros</Button>
                  </div>
                </section>
              )}

              {/* Wizard C3: Filtros del análisis (estructurales; sin ordenar/sentido) */}
              {wizard === "C" && wizardStep === 3 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Filtros del análisis</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Filtros estructurales que se aplican antes de la agregación. Seleccioná el campo, la condición y el valor. Podés agregar varios filtros a la vez.</p>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>Filtros</Label>
                    <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 text-xs" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} onClick={() => setFormFilters((f) => [...f, { id: `f-${Date.now()}`, field: fields[0] ?? "", operator: "=", value: "" }])}>+ Agregar filtro</Button>
                  </div>
                  {formFilters.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {formFilters.map((f, i) => {
                        const selectedArrC = getFilterSelectedValues(f);
                        const isListModeC = Array.isArray(f.value);
                        const listValuesC = filterFieldValues[f.field] ?? [];
                        const filteredListC = !filterListSearch.trim() ? listValuesC : listValuesC.filter((v) => String(v).toLowerCase().includes(filterListSearch.trim().toLowerCase()));
                        return (
                        <div key={f.id} className="flex flex-wrap gap-2 items-center rounded-lg border p-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                          <span className="text-xs font-medium w-20 shrink-0" style={{ color: "var(--platform-fg-muted)" }}>Campo</span>
                          <Select value={f.field} onChange={(val: string) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, field: val } : ff))} options={allColumnsForRoles.map((name) => ({ value: name, label: derivedColumnsByName[name] ? `${name} (calculada)` : getSampleDisplayLabel(name) }))} placeholder="Seleccionar campo" className="min-w-[140px]" buttonClassName="h-9 text-xs" disablePortal />
                          <span className="text-xs font-medium w-16 shrink-0" style={{ color: "var(--platform-fg-muted)" }}>Condición</span>
                          <Select value={f.operator} onChange={(val: string) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, operator: val } : ff))} options={FILTER_OPERATOR_OPTIONS} placeholder="Op" className="min-w-[140px]" buttonClassName="h-9 text-xs" disablePortal />
                          <span className="text-xs font-medium w-12 shrink-0" style={{ color: "var(--platform-fg-muted)" }}>Valor</span>
                          <Input value={isListModeC ? "" : (f.value != null ? String(f.value) : "")} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: e.target.value || null } : ff))} placeholder={isListModeC ? `${selectedArrC.length} de lista` : "Valor (manual)"} className="h-8 text-xs rounded-lg flex-1 min-w-[80px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                          {f.field && (
                            <>
                              {dateFields.includes(f.field) && (
                                <Select
                                  value={filterDateLevel[f.id] || "year"}
                                  onChange={(val: string) => {
                                    const level = val || "year";
                                    setFilterDateLevel((prev) => ({ ...prev, [f.id]: level }));
                                    const opt = DATE_LEVEL_OPTIONS.find((o) => o.value === level);
                                    if (opt) setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, operator: opt!.operator } : ff));
                                    setFilterFieldValues((prev) => ({ ...prev, [f.field]: [] }));
                                  }}
                                  options={DATE_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                                  placeholder="Nivel"
                                  className="min-w-[100px]"
                                  buttonClassName="h-8 text-xs"
                                  disablePortal
                                />
                              )}
                              <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} disabled={filterFieldLoading === f.field} onClick={async () => { setFilterFieldLoading(f.field); try { const dateLevel = dateFields.includes(f.field) ? (filterDateLevel[f.id] || "year") : undefined; const url = dateLevel ? `/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(f.field)}&dateLevel=${encodeURIComponent(dateLevel)}` : `/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(f.field)}`; const res = await fetch(url); const data = await safeJsonResponse(res); if (res.ok && Array.isArray(data.values)) setFilterFieldValues((prev) => ({ ...prev, [f.field]: data.values as string[] })); } finally { setFilterFieldLoading(null); } }}>
                                {filterFieldLoading === f.field ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cargar lista"}
                              </Button>
                              {listValuesC.length ? (
                                <Popover open={filterListOpenId === f.id} onOpenChange={(open) => { setFilterListOpenId(open ? f.id : null); if (!open) setFilterListSearch(""); }}>
                                  <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0 min-w-[120px]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}>
                                      {selectedArrC.length ? `${selectedArrC.length} seleccionado${selectedArrC.length !== 1 ? "s" : ""}` : "Elegir de la lista…"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80 p-2" align="start" style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)" }}>
                                    <div className="flex gap-1 mb-2">
                                      <Button type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: [...listValuesC] } : ff))}>Seleccionar todos</Button>
                                      <Button type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: [] } : ff))}>Quitar todo</Button>
                                    </div>
                                    <input type="text" placeholder="Buscar…" value={filterListOpenId === f.id ? filterListSearch : ""} onChange={(e) => setFilterListSearch(e.target.value)} className="w-full rounded border px-2 py-1.5 text-xs mb-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                                      {filteredListC.map((v) => {
                                        const checked = selectedArrC.includes(v);
                                        return (
                                          <label key={String(v)} className="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-black/5 text-sm" style={{ color: "var(--platform-fg)" }}>
                                            <Checkbox checked={checked} onCheckedChange={(checked) => { const next = checked ? [...selectedArrC, v] : selectedArrC.filter((x) => x !== v); setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: next } : ff)); }} />
                                            <span>{String(v)}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              ) : null}
                            </>
                          )}
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setFormFilters((prev) => prev.filter((_, ii) => ii !== i))} title="Quitar filtro"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ); })}
                    </div>
                  ) : (
                    <p className="text-sm mb-4 rounded-lg border p-3" style={{ color: "var(--platform-fg-muted)", borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>Ningún filtro. Tocá «Agregar filtro» para restringir el análisis por campo, condición y valor.</p>
                  )}
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Ver valores de una columna</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Cargá los valores posibles de una columna para elegir mejor al definir filtros.</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Select value={metricsDistinctColumn ?? ""} onChange={(val: string) => { const col = val || null; setMetricsDistinctColumn(col); setMetricsDistinctValues([]); setMetricsDistinctSearch(""); }} options={[{ value: "", label: "Elegir columna" }, ...allColumnsForRoles.map((col) => ({ value: col, label: derivedColumnsByName[col] ? `${col} (calculada)` : getSampleDisplayLabel(col) }))]} placeholder="Elegir columna" className="min-w-[160px]" disablePortal />
                      <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} disabled={!metricsDistinctColumn || metricsDistinctLoading} onClick={async () => { if (!metricsDistinctColumn) return; setMetricsDistinctLoading(true); setMetricsDistinctValues([]); try { const res = await fetch(`/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(metricsDistinctColumn)}`); const data = await safeJsonResponse(res); if (data.ok && Array.isArray(data.values)) setMetricsDistinctValues(data.values); else toast.error(data?.error || "No se pudieron cargar los valores"); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Error al cargar"); } finally { setMetricsDistinctLoading(false); } }}>{metricsDistinctLoading ? "Cargando…" : "Cargar valores"}</Button>
                    </div>
                    {metricsDistinctValues.length > 0 && metricsDistinctColumn && (
                      <>
                        <input type="text" placeholder="Buscar valor…" value={metricsDistinctSearch} onChange={(e) => setMetricsDistinctSearch(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }} />
                        <div className="max-h-40 overflow-y-auto rounded-lg border space-y-0.5 p-2" style={{ borderColor: "var(--platform-border)" }}>
                          {metricsDistinctValues.filter((v) => !metricsDistinctSearch.trim() || String(v).toLowerCase().includes(metricsDistinctSearch.trim().toLowerCase())).map((val) => (<div key={String(val)} className="py-1.5 px-2 rounded text-sm" style={{ color: "var(--platform-fg)" }}>{String(val)}</div>))}
                        </div>
                        <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{metricsDistinctValues.length} valor{metricsDistinctValues.length !== 1 ? "es" : ""}.</p>
                      </>
                    )}
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Transformaciones</Button>
                  </div>
                </section>
              )}

              {/* Wizard C4: Transformaciones (opcional) — concepto: tabla base primero; transformaciones agregan columnas sin modificar la métrica */}
              {wizard === "C" && wizardStep === 4 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Transformaciones (opcional)</h3>
                  <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--platform-accent-dim)", background: "var(--platform-accent-dim)" }}>
                    <p className="text-sm font-medium mb-2" style={{ color: "var(--platform-fg)" }}>Concepto</p>
                    <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: "var(--platform-fg-muted)" }}>
                      <li>Primero el motor genera la <strong style={{ color: "var(--platform-fg)" }}>tabla base del análisis</strong> (lo que se ve en la vista previa sin aplicar transformaciones).</li>
                      <li>Si elegís alguna transformación: se ejecutan <strong style={{ color: "var(--platform-fg)" }}>cálculos adicionales</strong>, se <strong style={{ color: "var(--platform-fg)" }}>agregan nuevas columnas</strong> a esa tabla base.</li>
                      <li>La <strong style={{ color: "var(--platform-fg)" }}>métrica original no se modifica</strong>; las transformaciones son columnas extra (ej. comparación con período anterior).</li>
                    </ul>
                  </div>
                  <p className="text-sm font-medium mb-3" style={{ color: "var(--platform-fg)" }}>Comparaciones disponibles</p>
                  <div className="space-y-4 mb-4">
                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Comparar contra período anterior</Label>
                      <select value={transformCompare === "mom" || transformCompare === "yoy" ? transformCompare : "none"} onChange={(e) => setTransformCompare(e.target.value === "none" ? "none" : e.target.value as "mom" | "yoy")} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                        <option value="none">Ninguno</option>
                        <option value="mom">Mes anterior (MoM)</option>
                        <option value="yoy">Año anterior (YoY)</option>
                      </select>
                      <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>Agrega columnas con el valor del período anterior, diferencia, variación % y acumulado.</p>
                      {(transformCompare === "mom" || transformCompare === "yoy") && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium" style={{ color: "var(--platform-fg)" }}>Columnas a visualizar:</p>
                          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}>
                            <input type="checkbox" checked={transformShowDelta} onChange={(e) => setTransformShowDelta(e.target.checked)} className="rounded" />
                            Delta <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>(diferencia con período anterior)</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}>
                            <input type="checkbox" checked={transformShowDeltaPct} onChange={(e) => setTransformShowDeltaPct(e.target.checked)} className="rounded" />
                            Delta % <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>(variación porcentual)</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}>
                            <input type="checkbox" checked={transformShowAccum} onChange={(e) => setTransformShowAccum(e.target.checked)} className="rounded" />
                            Acumulado <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>(suma acumulada)</span>
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Comparar contra valor fijo</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input type="number" step="any" placeholder="Ej. 1000" value={transformCompare === "fixed" ? transformCompareFixedValue : ""} onChange={(e) => { setTransformCompareFixedValue(e.target.value); if (e.target.value.trim() !== "") setTransformCompare("fixed"); }} className="h-9 rounded-lg text-sm max-w-[140px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                        {(transformCompare === "fixed" && transformCompareFixedValue.trim() !== "") && (
                          <Button type="button" variant="ghost" size="sm" className="text-xs h-8" style={{ color: "var(--platform-fg-muted)" }} onClick={() => { setTransformCompareFixedValue(""); setTransformCompare("none"); }}>Quitar</Button>
                        )}
                      </div>
                      <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>Ingresá un número; se agregan columnas con la diferencia y la variación % respecto a ese valor.</p>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Preview</Button>
                  </div>
                </section>
              )}

              {/* Wizard C5: Vista previa (tabla) */}
              {wizard === "C" && wizardStep === 5 && (() => {
                const hasValidMetrics = effectiveFormMetrics.some((m) => m.field || (m as { expression?: string }).expression || m.formula);
                const transformLabel = transformCompare === "mom" ? "Período anterior (MoM)" : transformCompare === "yoy" ? "Año anterior (YoY)" : transformCompare === "fixed" ? `Valor fijo (${transformCompareFixedValue})` : null;
                const formatCell = (k: string, v: unknown): string => {
                  if (v == null) return "—";
                  const dateDisplay = formatPreviewDateValue(v, k);
                  if (dateDisplay != null) return dateDisplay;
                  if (typeof v !== "number") return String(v);
                  if (k.endsWith("_delta_pct") || k.endsWith("_var_pct_fijo")) {
                    const sign = v > 0 ? "+" : "";
                    return `${sign}${formatNumber(v)}%`;
                  }
                  if (k.endsWith("_delta") || k.endsWith("_vs_fijo")) {
                    const sign = v > 0 ? "+" : "";
                    return `${sign}${formatNumber(v)}`;
                  }
                  return formatNumber(v);
                };
                const deltaColor = (k: string, v: unknown): string | undefined => {
                  if (v == null || typeof v !== "number") return undefined;
                  if (k.endsWith("_delta") || k.endsWith("_delta_pct") || k.endsWith("_vs_fijo") || k.endsWith("_var_pct_fijo")) {
                    if (v > 0) return "#10b981";
                    if (v < 0) return "#ef4444";
                  }
                  return undefined;
                };
                return (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Vista previa de datos</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>
                    Tabla final resultante con la configuración actual.
                    {timeColumn && analysisGranularity ? ` Agrupando por ${analysisGranularity === "month" ? "mes" : analysisGranularity === "week" ? "semana" : analysisGranularity === "day" ? "día" : analysisGranularity === "quarter" ? "trimestre" : analysisGranularity === "semester" ? "semestre" : "año"} (${getSampleDisplayLabel(timeColumn)}).` : ""}
                    {analysisTimeRange === "custom" && analysisDateFrom && analysisDateTo ? ` Rango: ${analysisDateFrom} a ${analysisDateTo}.` : analysisTimeRange && analysisTimeRange !== "0" && Number(analysisTimeRange) > 0 ? ` Últimos ${analysisTimeRange} ${analysisTimeRange === "7" || analysisTimeRange === "30" ? "días" : "meses"} (respecto a los datos).` : timeColumn ? " Sin filtro de fecha: se muestran todos los datos." : ""}
                  </p>
                  {transformLabel && (
                    <div className="rounded-lg border p-3 mb-4 flex items-center gap-2" style={{ borderColor: "var(--platform-accent-dim)", background: "var(--platform-accent-dim)" }}>
                      <span className="text-xs font-medium" style={{ color: "var(--platform-accent)" }}>Transformación activa:</span>
                      <span className="text-xs" style={{ color: "var(--platform-fg)" }}>{transformLabel}</span>
                    </div>
                  )}
                  {!hasValidMetrics && (
                    <div className="rounded-lg border p-3 mb-4" style={{ borderColor: "var(--platform-accent)", background: "var(--platform-accent-dim)" }}>
                      <p className="text-xs" style={{ color: "var(--platform-accent)" }}>No hay métricas configuradas. Volvé al paso Cálculo (Métrica) para crear al menos una fórmula.</p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={previewLoading || !hasValidMetrics} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                      {previewLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Actualizar vista previa
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="rounded-xl text-xs" style={{ color: "var(--platform-fg-muted)" }} onClick={() => fetchData()} disabled={loading}>Recargar datos del ETL</Button>
                  </div>
                  {previewData && previewData.length > 0 && (
                    <div className="overflow-hidden rounded-xl border shadow-sm mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                      <div className="overflow-auto max-h-[360px]">
                        <table className="w-full text-sm" style={{ color: "var(--platform-fg)" }}>
                          <thead className="sticky top-0 z-10" style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                            <tr>{previewDisplayHeaders.map((h, i) => {
                              const k = previewVisibleKeys[i] ?? "";
                              const isTx = k.endsWith("_prev") || k.endsWith("_delta") || k.endsWith("_delta_pct") || k.endsWith("_acumulado") || k.endsWith("_vs_fijo") || k.endsWith("_var_pct_fijo");
                              return (<th key={i} className="text-left px-4 py-2 font-medium whitespace-nowrap text-xs" style={{ color: isTx ? "var(--platform-accent)" : undefined }}>{h}</th>);
                            })}</tr>
                          </thead>
                          <tbody style={{ background: "var(--platform-bg-elevated)" }}>
                            {previewData.map((row, idx) => (
                              <tr key={idx} className="border-b" style={{ borderColor: "var(--platform-border)" }}>
                                {previewVisibleKeys.map((k, i) => { const v = (row as Record<string, unknown>)[k]; const dc = deltaColor(k, v); return (<td key={i} className="px-4 py-2 whitespace-nowrap" style={dc ? { color: dc, fontWeight: 500 } : undefined}>{formatCell(k, v)}</td>); })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs px-4 py-2 border-t" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)", background: "var(--platform-surface)" }}>{previewData.length} filas · {previewVisibleKeys.length} columnas</p>
                    </div>
                  )}
                  {previewData && previewData.length === 0 && !previewLoading && (
                    <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>No hay datos. Tocá «Actualizar vista previa» para cargar.</p>
                  )}
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <div className="flex gap-2">
                      <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>OK — Siguiente: Gráfico</Button>
                    </div>
                  </div>
                </section>
                );
              })()}

              {/* Wizard D0: Tipo visual */}
              {wizard === "D" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Tipo de visual</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Vinculado al mapeo: el tipo condiciona qué ejes y series se sugieren. Solo se ofrecen opciones válidas según tus dimensiones y métricas.</p>
                  <section className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--platform-accent-dim)", background: "var(--platform-accent-dim)" }}>
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--platform-accent)" }} />
                      <p className="text-sm" dangerouslySetInnerHTML={{ __html: recommendationText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                    </div>
                  </section>
                  {(formChartType === "pie" || formChartType === "doughnut") && analysisSelectedMetricIds.length > 1 && (
                    <p className="text-xs mb-3 py-2 px-3 rounded-lg border" style={{ borderColor: "var(--platform-warning, #eab308)", background: "rgba(234,179,8,0.08)", color: "var(--platform-fg)" }}>
                      Pie/Dona solo muestra la primera métrica. Las demás no se usarán en este gráfico.
                    </p>
                  )}
                  {formChartType === "combo" && effectiveFormMetrics.length < 2 && (
                    <p className="text-xs mb-3 py-2 px-3 rounded-lg border" style={{ borderColor: "var(--platform-warning, #eab308)", background: "rgba(234,179,8,0.08)", color: "var(--platform-fg)" }}>
                      Combo requiere al menos 2 métricas (barras + línea). Seleccioná otra métrica en el paso Análisis.
                    </p>
                  )}
                  {analysisSelectedMetricIds.length > 1 && !["pie", "doughnut", "combo"].includes(formChartType) && (
                    <p className="text-xs mb-3 py-2 px-3 rounded-lg border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg-muted)" }}>
                      Este tipo de gráfico puede mostrar varias métricas como series.
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {CHART_TYPES.map(({ value, label, icon: Icon, description }) => {
                      const isSelected = formChartType === value;
                      const isSuggested = suggestedChartType === value && !isSelected;
                      const noMap = value === "map" && !chartTypeRestrictions.hasGeo;
                      const noKpi = value === "kpi" && chartTypeRestrictions.hasDimension;
                      const disabled = noMap || noKpi;
                      const reason = noMap ? "Requiere dimensión con rol Geo" : noKpi ? "KPI no admite dimensiones" : null;
                      return (
                        <button key={value} type="button" onClick={() => !disabled && setFormChartType(value)} disabled={disabled} title={reason ?? undefined} className="relative flex flex-col items-center gap-1 rounded-xl px-3 py-3 text-sm font-medium transition-all border" style={{ background: disabled ? "var(--platform-surface)" : isSelected ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: disabled ? "var(--platform-fg-muted)" : isSelected ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: isSuggested ? "var(--platform-accent)" : isSelected ? "transparent" : "var(--platform-border)", opacity: disabled ? 0.7 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
                          {isSuggested && !disabled && <span className="absolute -top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}>Sugerido</span>}
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-semibold">{label}</span>
                          <span className="text-[10px] leading-tight text-center opacity-70">{disabled ? reason : description}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Mapeo</Button>
                  </div>
                </section>
              )}

              {/* Wizard D1: Mapeo de campos */}
              {wizard === "D" && wizardStep === 1 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Mapeo de campos</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Asigná las columnas de tus datos al gráfico tipo <strong>{CHART_TYPES.find((t) => t.value === formChartType)?.label ?? formChartType}</strong>. Solo aparecen opciones según los datos de la vista previa.</p>

                  {chartAvailableColumns.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                      <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "var(--platform-fg-muted)" }} />
                      <p className="text-sm font-medium mb-1" style={{ color: "var(--platform-fg)" }}>Sin datos para mapear</p>
                      <p className="text-xs mb-4 max-w-sm mx-auto" style={{ color: "var(--platform-fg-muted)" }}>Volvé al paso <strong>Preview</strong> en Análisis (Dimensiones y tiempo → Filtros → Transformaciones → Preview) y tocá «Actualizar vista previa» para cargar los datos.</p>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }} onClick={goPrev}>← Volver a Tipo de gráfico</Button>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg border p-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                        <span className="font-medium" style={{ color: "var(--platform-fg-muted)" }}>Datos disponibles:</span>
                        <span style={{ color: "var(--platform-fg)" }}><strong>{previewData?.length ?? 0}</strong> filas</span>
                        <span style={{ color: "var(--platform-fg)" }}><strong>{chartDimensionColumns.length}</strong> dimensión{chartDimensionColumns.length !== 1 ? "es" : ""} (categorías/tiempo): {chartDimensionColumns.length ? chartDimensionColumns.map((c) => c.label).join(", ") : "—"}</span>
                        <span style={{ color: "var(--platform-fg)" }}><strong>{chartNumericColumns.length}</strong> métrica{chartNumericColumns.length !== 1 ? "s" : ""} (valores): {chartNumericColumns.length ? chartNumericColumns.map((c) => c.label).join(", ") : "—"}</span>
                      </div>

                      <div className="space-y-5">
                        <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                          <Label className="text-sm font-medium mb-1 block" style={{ color: "var(--platform-fg)" }}>1. Eje X — Categorías o tiempo</Label>
                          <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Columna que define las etiquetas (ej. vendedor, fecha, región). En KPI no se usa.</p>
                          {chartDimensionColumns.length === 0 ? (
                            <p className="text-xs py-2" style={{ color: "var(--platform-fg-muted)" }}>No hay dimensiones en los datos. Este gráfico se verá como KPI (un solo valor).</p>
                          ) : (
                            <select value={chartXAxis} onChange={(e) => setChartXAxis(e.target.value)} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                              <option value="">— Sin eje X (KPI)</option>
                              {chartDimensionColumns.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                            </select>
                          )}
                        </div>

                        <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                          <Label className="text-sm font-medium mb-1 block" style={{ color: "var(--platform-fg)" }}>2. Eje Y — Valores a graficar</Label>
                          <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná una o más métricas (columnas numéricas) que se mostrarán en el gráfico.</p>
                          {chartNumericColumns.length === 0 ? (
                            <p className="text-xs py-2" style={{ color: "var(--platform-accent)" }}>No hay métricas en los datos. Revisá el paso Cálculo y definí al menos una métrica para el análisis.</p>
                          ) : (
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                              {chartNumericColumns.map((c) => {
                                const checked = chartYAxes.includes(c.key);
                                return (
                                  <label key={c.key} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg cursor-pointer transition-colors hover:opacity-90" style={{ background: checked ? "var(--platform-accent-dim)" : "transparent", color: "var(--platform-fg)" }}>
                                    <input type="checkbox" checked={checked} onChange={(e) => {
                                      if (e.target.checked) setChartYAxes((prev) => [...prev, c.key]);
                                      else setChartYAxes((prev) => prev.filter((k) => k !== c.key));
                                    }} className="rounded" />
                                    {c.label}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {chartYAxes.length === 0 && chartNumericColumns.length > 0 && <p className="text-xs mt-2" style={{ color: "var(--platform-accent)" }}>Seleccioná al menos una métrica.</p>}
                        </div>

                        {chartDimensionColumns.length >= 2 && (
                          <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                            <Label className="text-sm font-medium mb-1 block" style={{ color: "var(--platform-fg)" }}>3. Serie (opcional) — Agrupar por color</Label>
                            <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Si tenés más de una dimensión, podés usar una como serie para ver varias líneas o barras por categoría.</p>
                            <select value={chartSeriesField} onChange={(e) => setChartSeriesField(e.target.value)} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                              <option value="">— Sin serie</option>
                              {chartDimensionColumns.filter((c) => c.key !== chartXAxis).map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                        <p className="text-xs font-medium uppercase mb-2" style={{ color: "var(--platform-fg-muted)" }}>Resumen del mapeo</p>
                        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--platform-fg)" }}>
                          <span><strong>X:</strong> {chartXAxis ? chartAvailableColumns.find((c) => c.key === chartXAxis)?.label ?? chartXAxis : "— (KPI)"}</span>
                          <span><strong>Y:</strong> {chartYAxes.length > 0 ? chartYAxes.map((k) => chartAvailableColumns.find((c) => c.key === k)?.label ?? k).join(", ") : "—"}</span>
                          {chartSeriesField && <span><strong>Serie:</strong> {chartAvailableColumns.find((c) => c.key === chartSeriesField)?.label ?? chartSeriesField}</span>}
                        </div>
                      </div>

                      <div className="mt-6 flex justify-between">
                        <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                        <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext} disabled={chartNumericColumns.length > 0 && chartYAxes.length === 0}>Siguiente: Formato</Button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* Wizard D2: Formato */}
              {wizard === "D" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Formato, orden y ranking</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Solo afecta la presentación visual. No cambia filas ni valores del análisis.</p>

                  <div className="space-y-5">
                    {/* 6.3.1 Formato numérico (una sola métrica) o Formato por métrica (varias) */}
                    {chartYAxes.length <= 1 ? (
                      <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Formato numérico</Label>
                        <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Tipo</p>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {([["number", "Número"], ["currency", "Moneda"], ["percent", "Porcentaje"]] as [string, string][]).map(([val, lbl]) => (
                            <button key={val} type="button" onClick={() => setChartValueType(val as "number" | "currency" | "percent")} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartValueType === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartValueType === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartValueType === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                          ))}
                        </div>
                        <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Escala</p>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {([["none", "Ninguna"], ["K", "K"], ["M", "M"], ["BI", "B"]] as [string, string][]).map(([val, lbl]) => (
                            <button key={val} type="button" onClick={() => setChartValueScale(val as "none" | "K" | "M" | "BI")} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartValueScale === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartValueScale === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartValueScale === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                          {chartValueType === "currency" && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Símbolo</Label>
                              <Input value={chartCurrencySymbol} onChange={(e) => setChartCurrencySymbol(e.target.value)} className="h-8 w-16 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Decimales</Label>
                            <Input type="number" min={0} max={6} value={chartDecimals} onChange={(e) => setChartDecimals(Math.max(0, Math.min(6, parseInt(e.target.value) || 0)))} className="h-8 w-16 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                          </div>
                          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                            <input type="checkbox" checked={chartThousandSep} onChange={(e) => setChartThousandSep(e.target.checked)} className="rounded" />
                            Separador de miles
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                            <input type="checkbox" checked={showDataLabels} onChange={(e) => setShowDataLabels(e.target.checked)} className="rounded" />
                            Mostrar etiquetas en gráfico
                          </label>
                        </div>
                        <p className="text-xs mt-2" style={{ color: "var(--platform-fg-muted)" }}>Vista previa: {formatNumber(1234567.89)}</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Formato por métrica</Label>
                        <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Asigná tipo y escala a cada métrica del gráfico (ej. Moneda a una y Número a la otra).</p>
                        <div className="space-y-4">
                          {chartYAxes.map((key) => {
                            const label = chartAvailableColumns.find((c) => c.key === key)?.label ?? key;
                            const m = chartMetricFormats[key] ?? {};
                            const valueType = (m.valueType ?? chartValueType) as "number" | "currency" | "percent";
                            const valueScale = (m.valueScale ?? chartValueScale) as "none" | "K" | "M" | "BI";
                            const currencySymbol = m.currencySymbol ?? chartCurrencySymbol;
                            const decimals = m.decimals ?? chartDecimals;
                            const updateM = (upd: Partial<{ valueType: string; valueScale: string; currencySymbol: string; decimals: number; thousandSep: boolean }>) =>
                              setChartMetricFormats((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...upd } }));
                            return (
                              <div key={key} className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                                <p className="text-xs font-medium mb-2" style={{ color: "var(--platform-fg)" }}>{label}</p>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {([["number", "Número"], ["currency", "Moneda"], ["percent", "Porcentaje"]] as [string, string][]).map(([val, lbl]) => (
                                    <button key={val} type="button" onClick={() => updateM({ valueType: val })} className="rounded-lg px-2.5 py-1 text-xs font-medium transition-all border" style={{ background: valueType === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: valueType === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: valueType === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {([["none", "Ninguna"], ["K", "K"], ["M", "M"], ["BI", "B"]] as [string, string][]).map(([val, lbl]) => (
                                    <button key={val} type="button" onClick={() => updateM({ valueScale: val })} className="rounded-lg px-2.5 py-1 text-xs font-medium transition-all border" style={{ background: valueScale === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: valueScale === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: valueScale === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                                  ))}
                                </div>
                                {(valueType === "currency" || valueType === "percent") && (
                                  <div className="flex flex-wrap items-center gap-3 mt-2">
                                    {valueType === "currency" && (
                                      <div className="flex items-center gap-2">
                                        <Label className="text-[11px]" style={{ color: "var(--platform-fg-muted)" }}>Símbolo</Label>
                                        <Input value={currencySymbol} onChange={(e) => updateM({ currencySymbol: e.target.value })} className="h-7 w-14 rounded text-xs !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <Label className="text-[11px]" style={{ color: "var(--platform-fg-muted)" }}>Decimales</Label>
                                      <Input type="number" min={0} max={6} value={decimals} onChange={(e) => updateM({ decimals: Math.max(0, Math.min(6, parseInt(e.target.value) || 0)) })} className="h-7 w-12 rounded text-xs !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <label className="flex items-center gap-2 text-xs cursor-pointer mt-3" style={{ color: "var(--platform-fg)" }}>
                          <input type="checkbox" checked={showDataLabels} onChange={(e) => setShowDataLabels(e.target.checked)} className="rounded" />
                          Mostrar etiquetas en gráfico
                        </label>
                      </div>
                    )}

                    {/* 6.3.2 Orden */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Orden de datos</Label>
                      <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Se aplica en la vista previa y al guardar la métrica.</p>
                      <div className="flex flex-wrap gap-3 mb-2">
                        <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Ordenar por:</span>
                        {(["series", "axis"] as const).map((val) => (
                          <button key={val} type="button" onClick={() => setChartSortBy(val)} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartSortBy === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartSortBy === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartSortBy === val ? "transparent" : "var(--platform-border)" }}>{val === "series" ? "Por serie (valor)" : "Por eje (categoría)"}</button>
                        ))}
                      </div>
                      {chartSortBy === "series" && (
                        <>
                          <div className="flex gap-2">
                            {([["none", "Sin orden"], ["asc", "Ascendente ↑"], ["desc", "Descendente ↓"]] as [string, string][]).map(([val, lbl]) => (
                              <button key={val} type="button" onClick={() => setChartSortDirection(val as "none" | "asc" | "desc")} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartSortDirection === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartSortDirection === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartSortDirection === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                            ))}
                          </div>
                          {effectiveFormMetrics.length > 1 && (
                            <div className="mt-2">
                              <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Métrica para ordenar</Label>
                              <select value={chartSortByMetric} onChange={(e) => setChartSortByMetric(e.target.value)} className="h-8 rounded-lg border px-2 text-xs max-w-xs" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                                <option value="">Primera métrica</option>
                                {effectiveFormMetrics.map((m, i) => {
                                  const key = `metric_${i}`;
                                  const label = m.alias || m.field || `Métrica ${i + 1}`;
                                  return <option key={key} value={key}>{label}</option>;
                                })}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                      {chartSortBy === "axis" && (
                        <div className="flex gap-2">
                          {([["alpha", "Alfabético"], ["date_asc", "Fecha ascendente"], ["date_desc", "Fecha descendente"]] as [string, string][]).map(([val, lbl]) => (
                            <button key={val} type="button" onClick={() => setChartAxisOrder(val as "alpha" | "date_asc" | "date_desc")} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartAxisOrder === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartAxisOrder === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartAxisOrder === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Personalización de Ejes: escala y graduación */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Escala del eje Y</Label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {([["auto", "Automática"], ["dataset", "Según rangos del dataset"], ["custom", "Personalizada"]] as [string, string][]).map(([val, lbl]) => (
                          <button key={val} type="button" onClick={() => setChartScaleMode(val as "auto" | "dataset" | "custom")} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartScaleMode === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartScaleMode === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartScaleMode === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                        ))}
                      </div>
                      {chartScaleMode === "custom" && (
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Mín</Label>
                            <Input type="number" value={chartScaleMin} onChange={(e) => setChartScaleMin(e.target.value)} placeholder="Ej. 0" className="h-8 w-20 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Máx</Label>
                            <Input type="number" value={chartScaleMax} onChange={(e) => setChartScaleMax(e.target.value)} placeholder="Ej. 100" className="h-8 w-20 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                          </div>
                        </div>
                      )}
                      {formChartType === "combo" && chartYAxes.length >= 2 && (
                        <div className="flex items-center gap-3 mt-3">
                          <input type="checkbox" id="chartComboSyncAxes" checked={chartComboSyncAxes} onChange={(e) => setChartComboSyncAxes(e.target.checked)} className="rounded" />
                          <Label htmlFor="chartComboSyncAxes" className="text-sm cursor-pointer" style={{ color: "var(--platform-fg)" }}>Sincronizar ejes</Label>
                          <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Alinear el eje derecho con el izquierdo para comparar visualmente dos métricas con escalas distintas.</p>
                        </div>
                      )}
                      <Label className="text-sm font-medium mb-2 block mt-3" style={{ color: "var(--platform-fg)" }}>Graduación (paso del eje)</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={chartAxisStep} onChange={(e) => setChartAxisStep(e.target.value)} placeholder="Automática (vacío)" className="h-8 w-28 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                        <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Dejar vacío para automático</span>
                      </div>

                      {chartYAxes.length > 1 && (
                        <>
                          <Label className="text-sm font-medium mb-2 block mt-4" style={{ color: "var(--platform-fg)" }}>Escala por métrica</Label>
                          <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Personalizá mín, máx y paso del eje para cada métrica (ej. eje izquierdo y derecho en combo).</p>
                          <div className="space-y-3">
                            {chartYAxes.map((key) => {
                              const label = chartAvailableColumns.find((c) => c.key === key)?.label ?? key;
                              const per = chartScalePerMetric[key] ?? {};
                              const updatePer = (upd: { min?: number; max?: number; step?: number }) =>
                                setChartScalePerMetric((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...upd } }));
                              return (
                                <div key={key} className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                                  <p className="text-xs font-medium mb-2" style={{ color: "var(--platform-fg)" }}>{label}</p>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2">
                                      <Label className="text-[11px]" style={{ color: "var(--platform-fg-muted)" }}>Mín</Label>
                                      <Input type="number" value={per.min ?? ""} onChange={(e) => updatePer({ min: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="—" className="h-7 w-20 rounded text-xs !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Label className="text-[11px]" style={{ color: "var(--platform-fg-muted)" }}>Máx</Label>
                                      <Input type="number" value={per.max ?? ""} onChange={(e) => updatePer({ max: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="—" className="h-7 w-20 rounded text-xs !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Label className="text-[11px]" style={{ color: "var(--platform-fg-muted)" }}>Paso</Label>
                                      <Input type="number" value={per.step ?? ""} onChange={(e) => updatePer({ step: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="—" className="h-7 w-16 rounded text-xs !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Líneas de cuadrícula (grid) */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Líneas de cuadrícula</Label>
                      <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Mostrar u ocultar las líneas de escala en los ejes y opcionalmente cambiar su color.</p>
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                          <input type="checkbox" checked={chartGridXDisplay} onChange={(e) => setChartGridXDisplay(e.target.checked)} className="rounded" />
                          Mostrar en eje X
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                          <input type="checkbox" checked={chartGridYDisplay} onChange={(e) => setChartGridYDisplay(e.target.checked)} className="rounded" />
                          Mostrar en eje Y
                        </label>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Color</Label>
                          <input type="color" value={chartGridColor || "#e2e8f0"} onChange={(e) => setChartGridColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border p-0" style={{ borderColor: "var(--platform-border)" }} title="Color de líneas de cuadrícula" />
                          <Input value={chartGridColor} onChange={(e) => setChartGridColor(e.target.value)} placeholder="#e2e8f0 (vacío = tema)" className="h-8 w-28 rounded-lg text-xs !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                        </div>
                      </div>
                    </div>

                    {/* 6.3.3 Ranking */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <div className="flex items-center gap-3 mb-2">
                        <input type="checkbox" id="chartRankingEnabled" checked={chartRankingEnabled} onChange={(e) => setChartRankingEnabled(e.target.checked)} className="rounded" />
                        <Label htmlFor="chartRankingEnabled" className="text-sm font-medium cursor-pointer" style={{ color: "var(--platform-fg)" }}>Aplicar ranking (Top N)</Label>
                      </div>
                      {chartRankingEnabled && (
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Top</Label>
                            <Input type="number" min={1} max={100} value={chartRankingTop} onChange={(e) => setChartRankingTop(Math.max(1, parseInt(e.target.value) || 5))} className="h-8 w-16 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>por métrica</Label>
                            <select value={chartRankingMetric} onChange={(e) => setChartRankingMetric(e.target.value)} className="h-8 rounded-lg border px-2 text-xs" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                              <option value="">Automático (primera métrica)</option>
                              {chartNumericColumns.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                            </select>
                          </div>
                          <p className="text-xs w-full" style={{ color: "var(--platform-fg-muted)" }}>Ej: Top {chartRankingTop} {formDimensions[0] ? formDimensions[0] : "categorías"} que más {chartYAxes[0] ? (chartAvailableColumns.find((c) => c.key === chartYAxes[0])?.label ?? chartYAxes[0]) : "valor"} tienen.</p>
                        </div>
                      )}
                    </div>

                    {/* Colores: vinculado al tipo de gráfico (porciones en torta/dona, series en bar/line, categorías por barra) */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Colores</Label>
                      {(() => {
                        const isBarOneMetricManyCategories =
                          (formChartType === "bar" || formChartType === "horizontalBar") &&
                          !chartSeriesField &&
                          chartYAxes.length === 1 &&
                          Array.isArray(previewChartConfig?.labels) &&
                          previewChartConfig.labels.length > 0;
                        const colorLabelsDesc =
                          formChartType === "pie" || formChartType === "doughnut"
                            ? "cada porción (categoría del Eje X)."
                            : chartSeriesField
                              ? "cada serie."
                              : isBarOneMetricManyCategories
                                ? "cada categoría del Eje X (cada barra)."
                                : "cada métrica del Eje Y.";
                        const colorLabels: string[] =
                          formChartType === "pie" || formChartType === "doughnut"
                            ? ((previewChartConfig?.labels as string[]) ?? [])
                            : chartSeriesField && previewChartConfig?.datasets?.length
                              ? previewChartConfig.datasets.map((d: { label?: string }) => d.label ?? "")
                              : isBarOneMetricManyCategories && previewChartConfig?.labels?.length
                                ? (previewChartConfig.labels as string[])
                                : chartYAxes.length > 0
                                  ? chartYAxes.map((k) => chartAvailableColumns.find((c) => c.key === k)?.label ?? k)
                                  : effectiveFormMetrics.map((m) => m.alias || m.field || "Métrica");
                        return (
                          <>
                      <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Según el tipo <strong>{CHART_TYPES.find((t) => t.value === formChartType)?.label ?? formChartType}</strong>: {colorLabelsDesc}</p>
                      {(() => {
                        const defaultPaletteColors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];
                        const presetPalettes: { name: string; colors: string[] }[] = [
                          { name: "Predeterminado", colors: ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"] },
                          { name: "Corporativo", colors: ["#1e40af", "#0369a1", "#0891b2", "#059669", "#65a30d", "#ca8a04"] },
                          { name: "Pastel", colors: ["#93c5fd", "#86efac", "#fde68a", "#fca5a5", "#c4b5fd", "#f9a8d4"] },
                          { name: "Cálido", colors: ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a"] },
                          { name: "Frío", colors: ["#1d4ed8", "#2563eb", "#0284c7", "#0891b2", "#0d9488", "#059669"] },
                        ];
                        return (
                          <>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {presetPalettes.map((p) => (
                                <button key={p.name} type="button" onClick={() => {
                                  const newColors: Record<string, string> = {};
                                  colorLabels.forEach((s, i) => { newColors[s] = p.colors[i % p.colors.length]!; });
                                  setChartSeriesColors(newColors);
                                  setChartColorScheme("fixed");
                                }} className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 border transition-all" style={{ borderColor: "var(--platform-border)" }}>
                                  <div className="flex gap-0.5">{p.colors.slice(0, 6).map((c, i) => (<div key={i} className="w-4 h-4 rounded-sm" style={{ background: c }} />))}</div>
                                  <span className="text-[10px]" style={{ color: "var(--platform-fg-muted)" }}>{p.name}</span>
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2 mb-3">
                              {([["auto", "Automático"], ["fixed", "Personalizado"]] as [string, string][]).map(([val, lbl]) => (
                                <button key={val} type="button" onClick={() => setChartColorScheme(val)} className="rounded-lg px-3 py-1.5 text-xs font-medium border transition-all" style={{ background: chartColorScheme === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartColorScheme === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartColorScheme === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                              ))}
                            </div>
                            {chartColorScheme !== "auto" && colorLabels.length > 0 && (
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {colorLabels.map((label, idx) => {
                                  const color = chartSeriesColors[label] || defaultPaletteColors[idx % defaultPaletteColors.length]!;
                                  return (
                                    <div key={label || idx} className="flex items-center gap-3">
                                      <input type="color" value={color} onChange={(e) => setChartSeriesColors((prev) => ({ ...prev, [label]: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0 p-0" style={{ background: "transparent" }} />
                                      <div className="w-6 h-6 rounded-md border shrink-0" style={{ background: color, borderColor: "var(--platform-border)" }} />
                                      <span className="text-sm truncate" style={{ color: "var(--platform-fg)" }}>{label || "(sin nombre)"}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {chartColorScheme !== "auto" && colorLabels.length === 0 && (
                              <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Actualizá la vista previa en el paso anterior para ver las categorías o series y asignar colores.</p>
                            )}
                          </>
                        );
                      })()}
                          </>
                        );
                      })()}
                    </div>

                    {/* Nombres de etiquetas en el gráfico */}
                    {(["bar", "horizontalBar", "line", "area", "pie", "doughnut", "combo", "scatter"] as string[]).includes(formChartType) && (
                      <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Nombres de etiquetas en el gráfico</Label>
                        <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Reemplazar el valor de los datos por el texto a mostrar (eje X, porciones, leyenda).</p>
                        <div className="space-y-2">
                          {Object.entries(chartLabelOverrides).map(([raw, display], idx) => (
                            <div key={`override-${idx}-${raw}`} className="flex gap-2 items-center">
                              <Input
                                value={raw}
                                onChange={(e) => setLabelOverride(raw, e.target.value, display)}
                                placeholder="Valor original (ej. Q1)"
                                className="h-8 text-xs flex-1 rounded-lg"
                                style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}
                              />
                              <span className="text-xs shrink-0" style={{ color: "var(--platform-fg-muted)" }}>→</span>
                              <Input
                                value={display}
                                onChange={(e) => setLabelOverride(raw, raw, e.target.value)}
                                placeholder="Nombre a mostrar"
                                className="h-8 text-xs flex-1 rounded-lg"
                                style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}
                              />
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-500" onClick={() => removeLabelOverride(raw)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button type="button" variant="outline" size="sm" className="mt-2 h-8 text-xs rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={addLabelOverride}>
                          <Plus className="mr-1.5 h-3.5 w-3.5 inline" />
                          Añadir etiqueta
                        </Button>
                      </div>
                    )}

                    {/* 6.3.4 Siempre visible */}
                    {formDimensions.filter(Boolean).length > 0 && (
                      <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Dimensiones siempre visibles</Label>
                        <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Estas dimensiones permanecen visibles aunque se apliquen filtros dinámicos en el dashboard.</p>
                        <div className="space-y-1.5">
                          {formDimensions.filter(Boolean).map((dim) => (
                            <label key={dim} className="flex items-center gap-2 text-sm py-1 px-2 rounded-lg cursor-pointer transition-colors" style={{ background: chartPinnedDimensions.includes(dim) ? "var(--platform-accent-dim)" : "transparent", color: "var(--platform-fg)" }}>
                              <input type="checkbox" checked={chartPinnedDimensions.includes(dim)} onChange={(e) => {
                                if (e.target.checked) setChartPinnedDimensions((prev) => [...prev, dim]);
                                else setChartPinnedDimensions((prev) => prev.filter((d) => d !== dim));
                              }} className="rounded" />
                              {getSampleDisplayLabel(dim)}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Guardar</Button>
                  </div>
                </section>
              )}

              {/* Wizard D3: Vista previa gráfico + Guardar */}
              {wizard === "D" && wizardStep === 3 && (
                <section className="rounded-xl border p-6 space-y-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Guardar</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Previsualización de cómo se verá el gráfico en el dashboard. {analysisSelectedMetricIds.length > 0 ? "Guardá el análisis para usarlo en dashboards." : "Guardá la métrica para usarla en dashboards."}</p>
                  <div className="rounded-xl border overflow-hidden shadow-sm" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                      <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{formName || "Métrica"}</p>
                      <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Vista previa</span>
                    </div>
                    <div className="p-4 min-h-[320px]">
                    {previewLoading ? (
                      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3" style={{ color: "var(--platform-fg-muted)" }}>
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <span className="text-sm">Cargando vista previa…</span>
                      </div>
                    ) : !previewData || previewData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 rounded-lg border border-dashed p-6" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                        <BarChart2 className="h-12 w-12 opacity-50" />
                        <p className="text-sm text-center">No hay datos para previsualizar. Volvé al paso <strong>Preview</strong> en Análisis y tocá «Actualizar vista previa».</p>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={effectiveFormMetrics.length === 0} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                          Actualizar vista previa
                        </Button>
                      </div>
                    ) : (
                      <>
                        {formChartType === "kpi" && previewKpiValue != null && (
                          <div className="flex flex-col items-center justify-center min-h-[260px] gap-1">
                            <span className="text-4xl font-bold tabular-nums" style={{ color: "var(--platform-fg)" }}>{formatNumber(previewKpiValue)}</span>
                            <span className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>{chartYAxes[0] ? (chartAvailableColumns.find((c) => c.key === chartYAxes[0])?.label ?? chartYAxes[0]) : effectiveFormMetrics[0]?.alias || effectiveFormMetrics[0]?.field || ""}</span>
                          </div>
                        )}
                        {formChartType === "table" && (
                          <div className="overflow-auto max-h-[280px] text-sm">
                            <table className="w-full">
                              <thead><tr style={{ borderBottom: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}>{previewVisibleKeys.map((k, i) => (<th key={k} className="text-left py-2 px-3 font-medium">{previewDisplayHeaders[i] ?? k}</th>))}</tr></thead>
                              <tbody style={{ color: "var(--platform-fg)" }}>{previewProcessedRows.slice(0, 50).map((row, idx) => {
                                const raw = row as Record<string, unknown>;
                                return (<tr key={idx} style={{ borderBottom: "1px solid var(--platform-border)" }}>{previewVisibleKeys.map((k, i) => {
                                  const v = raw[k];
                                  const dateDisplay = formatPreviewDateValue(v, k);
                                  const num = typeof v === "number" ? v : (v != null && v !== "" ? Number(v) : NaN);
                                  const display = dateDisplay ?? (!isNaN(num) ? formatNumber(num) : String(v ?? ""));
                                  return (<td key={i} className="py-2 px-3 tabular-nums">{display}</td>);
                                })}</tr>);
                              })}</tbody>
                            </table>
                          </div>
                        )}
                        {previewChartConfig && formChartType !== "kpi" && formChartType !== "table" && formChartType !== "map" && (() => {
                          const yValues = previewChartConfig.datasets?.flatMap((d: { data?: number[] }) => d.data ?? []) ?? [];
                          const dataMin = yValues.length ? Math.min(...yValues) : 0;
                          const dataMax = yValues.length ? Math.max(...yValues) : 100;
                          const yMinGlobal = chartScaleMode === "custom" && chartScaleMin !== "" && !isNaN(Number(chartScaleMin)) ? Number(chartScaleMin) : chartScaleMode === "dataset" ? dataMin : undefined;
                          const yMaxGlobal = chartScaleMode === "custom" && chartScaleMax !== "" && !isNaN(Number(chartScaleMax)) ? Number(chartScaleMax) : chartScaleMode === "dataset" ? dataMax : undefined;
                          const stepSizeGlobal = chartAxisStep !== "" && !isNaN(Number(chartAxisStep)) ? Number(chartAxisStep) : undefined;
                          const scaleForMetric = (key: string) => {
                            const per = key ? chartScalePerMetric[key] : undefined;
                            return {
                              min: per?.min ?? yMinGlobal,
                              max: per?.max ?? yMaxGlobal,
                              step: per?.step ?? stepSizeGlobal,
                            };
                          };
                          const key0 = chartYAxes[0];
                          const s0 = scaleForMetric(key0 ?? "");
                          const axisColor = "#64748b";
                          const gridColor = chartGridColor.trim() || "#e2e8f0";
                          const gridX = { display: chartGridXDisplay, color: gridColor };
                          const gridY = { display: chartGridYDisplay, color: gridColor };
                          const axisScales = {
                            x: {
                              display: true,
                              grid: gridX,
                              ticks: { color: axisColor, maxTicksLimit: 8, font: { size: 11 } },
                              title: { display: false },
                            },
                            y: {
                              display: true,
                              grid: gridY,
                              ticks: { color: axisColor, font: { size: 11 }, ...(s0.step != null ? { stepSize: s0.step } : {}) },
                              ...(s0.min != null ? { min: s0.min } : {}),
                              ...(s0.max != null ? { max: s0.max } : {}),
                              title: { display: false },
                            },
                          };
                          const isComboTwo = formChartType === "combo" && previewChartConfig.datasets?.length >= 2;
                          let comboScales: Record<string, unknown> = axisScales;
                          let comboPreviewData: typeof previewChartConfig = previewChartConfig;
                          if (isComboTwo && previewChartConfig.datasets?.[0]?.data && previewChartConfig.datasets?.[1]?.data) {
                            const d0 = previewChartConfig.datasets[0].data as number[];
                            const d1 = previewChartConfig.datasets[1].data as number[];
                            const min0 = Math.min(...d0);
                            const max0 = Math.max(...d0);
                            const min1 = Math.min(...d1);
                            const max1 = Math.max(...d1);
                            const range0 = max0 - min0 || 1;
                            const range1 = max1 - min1 || 1;
                            const cfg0 = chartYAxes[0] ? (chartMetricFormats[chartYAxes[0]] ?? { valueType: chartValueType, valueScale: chartValueScale, currencySymbol: chartCurrencySymbol, decimals: chartDecimals, thousandSep: chartThousandSep }) : {};
                            const cfg1 = chartYAxes[1] ? (chartMetricFormats[chartYAxes[1]] ?? { valueType: chartValueType, valueScale: chartValueScale, currencySymbol: chartCurrencySymbol, decimals: chartDecimals, thousandSep: chartThousandSep }) : {};
                            if (chartComboSyncAxes) {
                              comboPreviewData = {
                                ...previewChartConfig,
                                datasets: [
                                  { ...previewChartConfig.datasets[0], data: d0.map((v) => (v - min0) / range0) },
                                  { ...previewChartConfig.datasets[1], data: d1.map((v) => (v - min1) / range1) },
                                ],
                              };
                              comboScales = {
                                ...axisScales,
                                y: {
                                  ...axisScales.y,
                                  min: 0,
                                  max: 1,
                                  ticks: {
                                    ...axisScales.y.ticks,
                                    callback: (value: number) => formatWithConfig(value * range0 + min0, cfg0),
                                  },
                                },
                                y1: {
                                  display: true,
                                  position: "right",
                                  grid: { drawOnChartArea: false, display: chartGridYDisplay, color: gridColor },
                                  min: 0,
                                  max: 1,
                                  ticks: { color: axisColor, font: { size: 11 }, callback: (value: number) => formatWithConfig(value * range1 + min1, cfg1) },
                                  title: { display: false },
                                },
                              };
                            } else {
                              const s1 = scaleForMetric(chartYAxes[1] ?? "");
                              comboScales = {
                                ...axisScales,
                                y: {
                                  ...axisScales.y,
                                  ticks: { color: axisColor, font: { size: 11 }, ...(s0.step != null ? { stepSize: s0.step } : {}) },
                                  ...(s0.min != null ? { min: s0.min } : {}),
                                  ...(s0.max != null ? { max: s0.max } : {}),
                                  title: { display: false },
                                },
                                y1: {
                                  display: true,
                                  position: "right",
                                  grid: { drawOnChartArea: false, display: chartGridYDisplay, color: gridColor },
                                  ticks: { color: axisColor, font: { size: 11 }, ...(s1.step != null ? { stepSize: s1.step } : {}) },
                                  ...(s1.min != null ? { min: s1.min } : {}),
                                  ...(s1.max != null ? { max: s1.max } : {}),
                                  title: { display: false },
                                },
                              };
                            }
                          }
                          let legendTextColor = "#334155";
                          if (typeof document !== "undefined") {
                            const v = getComputedStyle(document.documentElement).getPropertyValue("--platform-fg")?.trim() || "";
                            if (v && (v.startsWith("#") || v.startsWith("rgb"))) legendTextColor = v;
                          }
                          const legendOpts = {
                            display: true,
                            position: "top" as const,
                            align: "center" as const,
                            labels: {
                              color: legendTextColor,
                              font: { size: 12 },
                              padding: 16,
                              usePointStyle: true,
                              pointStyle: "circle",
                            },
                          };
                          const formatWithConfig = (n: number, cfg: { valueType?: string; valueScale?: string; currencySymbol?: string; decimals?: number; thousandSep?: boolean }) => {
                            const valueType = cfg.valueType ?? chartValueType;
                            const valueScale = (cfg.valueScale ?? chartValueScale) as "none" | "K" | "M" | "BI";
                            const decimals = cfg.decimals ?? chartDecimals;
                            const useGrouping = cfg.thousandSep !== false && (cfg.thousandSep ?? chartThousandSep);
                            const symbol = cfg.currencySymbol ?? chartCurrencySymbol;
                            let val = n;
                            let suffix = "";
                            if (valueScale === "K" && Math.abs(n) >= 1000) { val = n / 1_000; suffix = "K"; }
                            else if (valueScale === "M" && Math.abs(n) >= 1_000_000) { val = n / 1_000_000; suffix = "M"; }
                            else if (valueScale === "M" && Math.abs(n) >= 1000) { val = n / 1_000; suffix = "K"; }
                            else if (valueScale === "BI" && Math.abs(n) >= 1_000_000_000) { val = n / 1_000_000_000; suffix = "BI"; }
                            else if (valueScale === "BI" && Math.abs(n) >= 1_000_000) { val = n / 1_000_000; suffix = "M"; }
                            else if (valueScale === "BI" && Math.abs(n) >= 1000) { val = n / 1_000; suffix = "K"; }
                            const formatted = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping }).format(val);
                            if (valueType === "percent") return `${formatted}${suffix}%`;
                            if (valueType === "currency") return `${symbol}${formatted}${suffix}`;
                            return `${formatted}${suffix}`;
                          };
                          const dataLabelsPluginOpts = showDataLabels
                            ? {
                                display: true,
                                color: legendTextColor || "#334155",
                                font: { size: 11, weight: "bold" as const },
                                formatter: (value: unknown, ctx: { datasetIndex?: number; chart?: { data?: { datasets?: Array<{ data?: unknown[] }> } } }) => {
                                  const n = Number(value);
                                  if (formChartType === "pie" || formChartType === "doughnut") {
                                    const data = ctx?.chart?.data?.datasets?.[0]?.data;
                                    if (Array.isArray(data)) {
                                      const total = data.reduce((a: number, b: unknown) => a + Number(b), 0);
                                      const pct = total ? (n / total) * 100 : 0;
                                      return `${pct.toFixed(1)}%`;
                                    }
                                  }
                                  if (chartYAxes.length > 1 && ctx?.datasetIndex != null && chartYAxes[ctx.datasetIndex]) {
                                    const key = chartYAxes[ctx.datasetIndex];
                                    const cfg = chartMetricFormats[key] ?? { valueType: chartValueType, valueScale: chartValueScale, currencySymbol: chartCurrencySymbol, decimals: chartDecimals, thousandSep: chartThousandSep };
                                    return formatWithConfig(n, cfg);
                                  }
                                  return formatNumber(n);
                                },
                              }
                            : { display: false };
                          const baseOpts = {
                            responsive: true,
                            maintainAspectRatio: false,
                            layout: { padding: showDataLabels ? 8 : 0 },
                            plugins: { legend: legendOpts, datalabels: dataLabelsPluginOpts },
                          };
                          const areaData = { ...previewChartConfig, datasets: previewChartConfig.datasets.map((ds: Record<string, unknown>) => ({ ...ds, fill: true })) } as unknown as typeof previewChartConfig;
                          const scatterData = previewChartConfig.datasets.length >= 1 ? {
                            datasets: [{
                              label: previewChartConfig.datasets[0].label,
                              data: previewChartConfig.labels.map((_: string, i: number) => ({ x: previewChartConfig.datasets[0]?.data[i] ?? 0, y: previewChartConfig.datasets[1]?.data[i] ?? previewChartConfig.datasets[0]?.data[i] ?? 0 })),
                              backgroundColor: previewChartConfig.datasets[0].backgroundColor,
                              borderColor: previewChartConfig.datasets[0].borderColor,
                            }],
                          } : previewChartConfig;
                          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for Radar chart type
                          const _radarData = { labels: previewChartConfig.labels, datasets: previewChartConfig.datasets.map((ds: Record<string, unknown>) => ({ ...ds, fill: true, backgroundColor: ds.backgroundColor, borderColor: ds.borderColor })) };
                          const ds0 = previewChartConfig.datasets?.[0];
                          const pieDoughnutLegendOpts: Record<string, unknown> = (ds0 && Array.isArray(ds0.backgroundColor) && previewChartConfig.labels?.length) ? {
                            display: true,
                            position: "right",
                            labels: {
                              color: legendTextColor,
                              font: { size: 12, color: legendTextColor },
                              padding: 12,
                              usePointStyle: false,
                              generateLabels: () =>
                                (previewChartConfig.labels as string[]).map((label, i) => {
                                  const bg = (ds0.backgroundColor as string[])[i] ?? ds0.backgroundColor?.[0] ?? "#0ea5e9";
                                  return {
                                    text: String(label || ""),
                                    fillStyle: typeof bg === "string" ? bg : "#0ea5e9",
                                    strokeStyle: "#fff",
                                    lineWidth: 1,
                                    hidden: false,
                                    index: i,
                                    datasetIndex: 0,
                                    fontColor: legendTextColor,
                                  };
                                }),
                            },
                          } : { display: true, position: "right", labels: { color: legendTextColor, font: { size: 12, color: legendTextColor } } };
                          return (
                            <div className="h-[320px] w-full" style={{ color: "var(--platform-fg)" }}>
                              {formChartType === "bar" && <Bar data={previewChartConfig as never} options={{ ...baseOpts, scales: axisScales }} />}
                              {formChartType === "horizontalBar" && <Bar data={previewChartConfig as never} options={{ ...baseOpts, indexAxis: "y" as const, scales: { x: axisScales.x, y: { ...axisScales.y, ticks: { ...axisScales.y.ticks, maxTicksLimit: 12 } } } }} />}
                              {formChartType === "line" && <Line data={previewChartConfig as never} options={{ ...baseOpts, scales: axisScales }} />}
                              {formChartType === "area" && <Line data={areaData as never} options={{ ...baseOpts, scales: axisScales }} />}
                              {formChartType === "pie" && <Pie data={previewChartConfig as never} options={{ ...baseOpts, plugins: { ...baseOpts.plugins, legend: pieDoughnutLegendOpts } } as Record<string, unknown>} />}
                              {formChartType === "doughnut" && <Doughnut data={previewChartConfig as never} options={{ ...baseOpts, plugins: { ...baseOpts.plugins, legend: pieDoughnutLegendOpts } } as Record<string, unknown>} />}
                              {formChartType === "scatter" && <Scatter data={scatterData as { datasets: { label: string; data: { x: number; y: number }[]; backgroundColor: string; borderColor: string }[] }} options={{ ...baseOpts, scales: axisScales }} />}
                              {formChartType === "combo" && <Bar data={comboPreviewData as never} options={{ ...baseOpts, scales: comboScales as typeof axisScales }} />}
                              {!["bar", "horizontalBar", "line", "area", "pie", "doughnut", "scatter", "combo", "kpi", "table", "map"].includes(formChartType) && <Bar data={previewChartConfig as never} options={{ ...baseOpts, scales: axisScales }} />}
                            </div>
                          );
                        })()}
                        {formChartType === "map" && (
                          <div className="flex flex-col items-center justify-center min-h-[280px] rounded-lg border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                            <MapPin className="h-10 w-10 mb-3" style={{ color: "var(--platform-accent)" }} />
                            <p className="text-sm font-medium mb-1" style={{ color: "var(--platform-fg)" }}>Visualización de mapa</p>
                            <p className="text-xs text-center max-w-sm" style={{ color: "var(--platform-fg-muted)" }}>El mapa se renderizará en el dashboard con los datos geográficos de las dimensiones seleccionadas (país, provincia, ciudad, coordenadas).</p>
                          </div>
                        )}
                        {previewData && previewData.length > 0 && (
                          <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                            Vista previa con <strong>{previewData.length}</strong> fila{previewData.length !== 1 ? "s" : ""} de datos · Tipo: {CHART_TYPES.find((t) => t.value === formChartType)?.label ?? formChartType}
                          </p>
                        )}
                      </>
                    )}
                    </div>
                  </div>
                  {/* Colores en vista previa (misma lógica que paso Formato) */}
                  {previewData && previewData.length > 0 && !["kpi", "table", "map"].includes(formChartType) && (() => {
                    const defaultPaletteColors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];
                    const presetPalettes: { name: string; colors: string[] }[] = [
                      { name: "Predeterminado", colors: ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"] },
                      { name: "Corporativo", colors: ["#1e40af", "#0369a1", "#0891b2", "#059669", "#65a30d", "#ca8a04"] },
                      { name: "Pastel", colors: ["#93c5fd", "#86efac", "#fde68a", "#fca5a5", "#c4b5fd", "#f9a8d4"] },
                      { name: "Cálido", colors: ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a"] },
                      { name: "Frío", colors: ["#1d4ed8", "#2563eb", "#0284c7", "#0891b2", "#0d9488", "#059669"] },
                    ];
                    const isBarOneMetricManyCategories =
                      (formChartType === "bar" || formChartType === "horizontalBar") &&
                      !chartSeriesField &&
                      chartYAxes.length === 1 &&
                      Array.isArray(previewChartConfig?.labels) &&
                      previewChartConfig.labels.length > 0;
                    const colorLabelsD3: string[] =
                      formChartType === "pie" || formChartType === "doughnut"
                        ? ((previewChartConfig?.labels as string[]) ?? [])
                        : chartSeriesField && previewChartConfig?.datasets?.length
                          ? previewChartConfig.datasets.map((d: { label?: string }) => d.label ?? "")
                          : isBarOneMetricManyCategories && previewChartConfig?.labels?.length
                            ? (previewChartConfig.labels as string[])
                            : chartYAxes.length > 0
                              ? chartYAxes.map((k) => chartAvailableColumns.find((c) => c.key === k)?.label ?? k)
                              : effectiveFormMetrics.map((m) => m.alias || m.field || "Métrica");
                    return (
                      <div className="mt-4 rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Colores</Label>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {presetPalettes.map((p) => (
                            <button key={p.name} type="button" onClick={() => {
                              const newColors: Record<string, string> = {};
                              colorLabelsD3.forEach((s, i) => { newColors[s] = p.colors[i % p.colors.length]!; });
                              setChartSeriesColors(newColors);
                              setChartColorScheme("fixed");
                            }} className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 border transition-all" style={{ borderColor: "var(--platform-border)" }}>
                              <div className="flex gap-0.5">{p.colors.slice(0, 6).map((c, i) => (<div key={i} className="w-4 h-4 rounded-sm" style={{ background: c }} />))}</div>
                              <span className="text-[10px]" style={{ color: "var(--platform-fg-muted)" }}>{p.name}</span>
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 mb-3">
                          {([["auto", "Automático"], ["fixed", "Personalizado"]] as [string, string][]).map(([val, lbl]) => (
                            <button key={val} type="button" onClick={() => setChartColorScheme(val)} className="rounded-lg px-3 py-1.5 text-xs font-medium border transition-all" style={{ background: chartColorScheme === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartColorScheme === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartColorScheme === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                          ))}
                        </div>
                        {chartColorScheme !== "auto" && colorLabelsD3.length > 0 && (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {colorLabelsD3.map((label, idx) => {
                              const color = chartSeriesColors[label] || defaultPaletteColors[idx % defaultPaletteColors.length]!;
                              return (
                                <div key={label || idx} className="flex items-center gap-3">
                                  <input type="color" value={color} onChange={(e) => setChartSeriesColors((prev) => ({ ...prev, [label]: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0 p-0" style={{ background: "transparent" }} />
                                  <div className="w-6 h-6 rounded-md border shrink-0" style={{ background: color, borderColor: "var(--platform-border)" }} />
                                  <span className="text-sm truncate" style={{ color: "var(--platform-fg)" }}>{label || "(sin nombre)"}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {chartColorScheme !== "auto" && colorLabelsD3.length === 0 && (
                          <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná «Personalizado» cuando haya categorías o series para asignar un color a cada una.</p>
                        )}
                      </div>
                    );
                  })()}
                  {analysisSelectedMetricIds.length > 0 && (
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-accent-dim)", background: "var(--platform-surface)" }}>
                      <Label className="text-sm font-medium block mb-2" style={{ color: "var(--platform-fg)" }}>Guardar como análisis (para dashboards)</Label>
                      <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Guardá esta configuración como análisis para poder añadirla al dashboard desde «Añadir análisis».</p>
                      <div className="flex flex-wrap gap-2 items-end">
                        <Input value={analysisNameToSave} onChange={(e) => setAnalysisNameToSave(e.target.value)} placeholder="Nombre del análisis" className="h-9 rounded-lg max-w-[220px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                        <Button type="button" className="rounded-xl h-9" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveAnalysisToEtl} disabled={savingAnalysis || !analysisNameToSave.trim()}>
                          {savingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {savingAnalysis ? " Guardando…" : " Guardar como análisis"}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>← Anterior</Button>
                    <Button type="button" className="rounded-xl px-6 font-semibold" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetric} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingId ? "Guardar cambios" : analysisSelectedMetricIds.length > 0 ? "Guardar análisis" : "Crear métrica"}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {savedMetrics.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--platform-fg)" }}>
            Calculadas (métricas)
          </h2>
          <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>
            Métricas guardadas; aparecen aquí. Las columnas calculadas del dataset se listan más abajo.
          </p>
          <ul className="space-y-2">
            {savedMetrics.map((s) => {
              const expr = (s.metric as { expression?: string })?.expression?.trim();
              const formula = (s.metric as { formula?: string })?.formula?.trim();
              const displayExpr = expr || formula || (s.metric.field ? `${s.metric.func}(${s.metric.field})` : "—");
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 rounded-xl border p-4"
                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium block" style={{ color: "var(--platform-fg)" }}>{s.name}</span>
                    <span className="text-sm font-mono block mt-1 truncate" style={{ color: "var(--platform-fg-muted)" }} title={displayExpr}>
                      {expr || formula ? displayExpr : `${s.metric.func}(${s.metric.field || "—"})`}
                      {s.metric.func && (expr || formula) ? ` · Agregación: ${s.metric.func}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      style={{ color: "var(--platform-fg-muted)" }}
                      onClick={() => openEdit(s)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => setDeleteTarget({ type: "metric", id: s.id, name: s.name || "Métrica" })}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {derivedColumns.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--platform-fg)" }}>
            Columnas calculadas del dataset
          </h2>
          <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>
            Columnas nuevas guardadas en el dataset; disponibles en Rol BI, Profiling, filtros e «Insertar columna». No son métricas.
          </p>
          <ul className="space-y-2">
            {derivedColumns.map((d) => (
              <li
                key={d.name}
                className="flex items-center justify-between gap-4 rounded-xl border p-4"
                style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium block" style={{ color: "var(--platform-fg)" }}>{d.name}</span>
                  <span className="text-sm font-mono block mt-1 truncate" style={{ color: "var(--platform-fg-muted)" }} title={d.expression}>
                    {d.expression} · Agregación por defecto: {d.defaultAggregation}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-red-500 hover:bg-red-500/10"
                  onClick={() => setDeleteTarget({ type: "derived", name: d.name })}
                  disabled={saving}
                  title="Eliminar columna calculada"
                  aria-label={`Eliminar ${d.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasData && savedMetrics.length === 0 && derivedColumns.length === 0 && !showForm && (
        <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
          Aún no hay métricas en «Calculadas» ni columnas calculadas. Creá una métrica con &quot;Nueva métrica&quot; (se guardará en Calculadas) o, en el paso Cálculo, creá una columna en el dataset.
        </p>
      )}

      {/* Dashboard & Filtros Dinámicos */}
      {savedMetrics.length > 0 && !showForm && (
        <section className="mt-6">
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--platform-fg)" }}>Dashboard</h2>
                <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                  Para añadir gráficos al dashboard, guardá un análisis en el paso Análisis o Gráfico y luego, en el Dashboard, usá «Añadir análisis».
                </p>
              </div>
              {linkedDashboardId && (
                <Link href={`/admin/dashboard/${linkedDashboardId}`} className="text-xs font-medium underline shrink-0" style={{ color: "var(--platform-accent)" }}>
                  Abrir dashboard →
                </Link>
              )}
            </div>

            {/* 8.1 Filtros Dinámicos */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>Filtros dinámicos</h3>
                  <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Filtros interactivos visibles en el dashboard. No afectan el cálculo estructural de métricas.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs" style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }} onClick={() => setDashboardFilters((prev) => [...prev, { id: `df-${Date.now()}`, field: "", filterType: "single", label: "", scope: "all", scopeMetricIds: [], applyToOtherDashboards: false }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Agregar filtro
                </Button>
              </div>

              {dashboardFilters.length === 0 && (
                <p className="text-xs py-3" style={{ color: "var(--platform-fg-muted)" }}>Sin filtros dinámicos. Agregá uno para que los usuarios puedan filtrar interactivamente en el dashboard.</p>
              )}

              <div className="space-y-3">
                {dashboardFilters.map((f, idx) => (
                  <div key={f.id} className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold" style={{ color: "var(--platform-fg-muted)" }}>Filtro {idx + 1}</span>
                      <Button type="button" variant="ghost" size="sm" className="text-xs h-6 text-red-500" onClick={() => setDashboardFilters((prev) => prev.filter((x) => x.id !== f.id))}>Quitar</Button>
                    </div>

                    {/* Paso 1: Campo y tipo */}
                    <div className="grid gap-3 sm:grid-cols-3 mb-3">
                      <div>
                        <Label className="text-xs mb-1 block" style={{ color: "var(--platform-fg-muted)" }}>Campo</Label>
                        <select value={f.field} onChange={(e) => setDashboardFilters((prev) => prev.map((x) => x.id === f.id ? { ...x, field: e.target.value, label: e.target.value ? getSampleDisplayLabel(e.target.value) : "" } : x))} className="w-full h-8 rounded-lg border px-2 text-xs" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                          <option value="">Elegir campo</option>
                          {allColumnsForRoles.map((col) => (<option key={col} value={col}>{getSampleDisplayLabel(col)}</option>))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block" style={{ color: "var(--platform-fg-muted)" }}>Tipo de filtro</Label>
                        <select value={f.filterType} onChange={(e) => setDashboardFilters((prev) => prev.map((x) => x.id === f.id ? { ...x, filterType: e.target.value as "single" | "multi" | "dateRange" | "numericRange" } : x))} className="w-full h-8 rounded-lg border px-2 text-xs" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                          <option value="single">Selección única</option>
                          <option value="multi">Selección múltiple</option>
                          <option value="dateRange">Rango de fechas</option>
                          <option value="numericRange">Rango numérico</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block" style={{ color: "var(--platform-fg-muted)" }}>Etiqueta</Label>
                        <Input value={f.label} onChange={(e) => setDashboardFilters((prev) => prev.map((x) => x.id === f.id ? { ...x, label: e.target.value } : x))} placeholder="Nombre visible" className="h-8 rounded-lg text-xs !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                      </div>
                    </div>

                    {/* Paso 2: Alcance */}
                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                      <Label className="text-xs font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Alcance del filtro</Label>
                      <div className="space-y-1.5 mb-2">
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                          <input type="radio" name={`scope-${f.id}`} checked={f.scope === "all"} onChange={() => setDashboardFilters((prev) => prev.map((x) => x.id === f.id ? { ...x, scope: "all", scopeMetricIds: [] } : x))} />
                          Dashboard completo (todos los gráficos)
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                          <input type="radio" name={`scope-${f.id}`} checked={f.scope === "selected"} onChange={() => setDashboardFilters((prev) => prev.map((x) => x.id === f.id ? { ...x, scope: "selected" } : x))} />
                          Solo gráficos seleccionados
                        </label>
                      </div>
                      {f.scope === "selected" && (
                        <div className="space-y-1 ml-5">
                          {savedMetrics.map((m) => (
                            <label key={m.id} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                              <input type="checkbox" checked={f.scopeMetricIds.includes(m.id)} onChange={(e) => {
                                const ids = e.target.checked ? [...f.scopeMetricIds, m.id] : f.scopeMetricIds.filter((id) => id !== m.id);
                                setDashboardFilters((prev) => prev.map((x) => x.id === f.id ? { ...x, scopeMetricIds: ids } : x));
                              }} className="rounded" />
                              {m.name}
                            </label>
                          ))}
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                        <input type="checkbox" checked={f.applyToOtherDashboards} onChange={(e) => setDashboardFilters((prev) => prev.map((x) => x.id === f.id ? { ...x, applyToOtherDashboards: e.target.checked } : x))} className="rounded" />
                        Aplicar a otros dashboards que compartan la misma base de datos
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {dashboardFilters.length > 0 && (
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs"
                    style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}
                    onClick={() => saveDashboardFiltersOnly()}
                    disabled={dashboardSyncing}
                  >
                    {dashboardSyncing && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Guardar filtros
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Modal de confirmación para eliminar métrica o columna calculada */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && closeDeleteModal()}>
        <DialogContent className="sm:max-w-md rounded-2xl" style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--platform-fg)" }}>
              {deleteTarget?.type === "metric" ? "Eliminar métrica" : "Eliminar columna calculada"}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
              {deleteTarget && (
                <>
                  ¿Eliminar {deleteTarget.type === "metric" ? "la métrica" : "la columna calculada"}{" "}
                  <strong style={{ color: "var(--platform-fg)" }}>
                    {deleteTarget.type === "metric" ? deleteTarget.name : deleteTarget.name}
                  </strong>
                  ? Esta acción no se puede deshacer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={closeDeleteModal}
              disabled={saving}
              className="rounded-xl"
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmDeleteFromModal}
              disabled={saving}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de ayuda: todas las fórmulas de Excel */}
      <Dialog open={formulasHelpOpen} onOpenChange={setFormulasHelpOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col rounded-2xl" style={{ background: "var(--platform-bg-elevated)", borderColor: "var(--platform-border)" }}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>Referencia de fórmulas (estilo Excel)</DialogTitle>
            <DialogDescription className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              Podés usar nombres de columnas en las expresiones (ej. CANTIDAD * PRECIO_UNITARIO). Las funciones se evalúan según el motor de datos. Operadores: + - * / y funciones listadas abajo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-6">
            {EXCEL_FORMULAS_REFERENCIA.map((grupo) => (
              <div key={grupo.categoria}>
                <h4 className="text-sm font-semibold mb-2 sticky top-0 py-1 z-10" style={{ color: "var(--platform-accent)", background: "var(--platform-bg-elevated)" }}>{grupo.categoria}</h4>
                <div className="grid gap-2">
                  {grupo.funciones.map((f) => (
                    <div key={f.nombre} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border py-2 px-3 text-sm" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                      <span className="font-mono font-semibold shrink-0" style={{ color: "var(--platform-fg)" }}>{f.nombre}</span>
                      <span className="font-mono text-xs shrink-0" style={{ color: "var(--platform-fg-muted)" }}>{f.sintaxis}</span>
                      <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{f.descripcion}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
