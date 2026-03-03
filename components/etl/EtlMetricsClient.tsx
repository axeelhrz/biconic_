"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, LayoutDashboard, Pencil, Trash2, Loader2, RefreshCw, BarChart2, LineChart, PieChart, Donut, Hash, Table2, Sparkles, AreaChart, ScatterChart, MapPin, TrendingUp, HelpCircle } from "lucide-react";
import { Bar, Line, Pie, Doughnut, Scatter, Radar } from "react-chartjs-2";
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
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AdminFieldSelector from "@/components/admin/dashboard/AdminFieldSelector";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";
import type { SavedMetricForm, AggregationMetricEdit, AggregationFilterEdit } from "@/components/admin/dashboard/AddMetricConfigForm";

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

const AGG_FUNCS = [
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

const FORMULA_QUICKS = [
  { label: "A ÷ B", expr: "metric_0 / NULLIF(metric_1, 0)" },
  { label: "% A/B", expr: "100.0 * metric_0 / NULLIF(metric_1, 0)" },
  { label: "Margen", expr: "(metric_0 - metric_1) / NULLIF(metric_0, 0)" },
  { label: "A - B", expr: "metric_0 - metric_1" },
  { label: "A + B", expr: "metric_0 + metric_1" },
  { label: "A × B", expr: "metric_0 * metric_1" },
];

/** Nombres de funciones tipo Excel para autocompletado y ayuda en fórmula personalizada. */
const EXCEL_FUNCTIONS = [
  "SUM", "AVERAGE", "COUNT", "COUNTA", "MIN", "MAX", "IF", "IFERROR", "NULLIF",
  "ABS", "ROUND", "ROUNDUP", "ROUNDDOWN", "TRUNC", "MOD", "POWER", "SQRT",
  "AND", "OR", "NOT", "TRUE", "FALSE",
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
  "IF", "IFERROR", "IFNA", "NULLIF", "COALESCE", "CASE", "WHEN", "THEN", "ELSE", "END",
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
};

export default function EtlMetricsClient({ etlId, etlTitle, etlClientId, connections: connectionsProp = [] }: EtlMetricsClientProps) {
  const router = useRouter();
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
  const [formMetric, setFormMetric] = useState<AggregationMetricEdit>({
    id: `m-${Date.now()}`,
    field: "",
    func: "SUM",
    alias: "",
  });
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [wizard, setWizard] = useState<"A" | "B" | "C" | "D">("A");
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
  const [calcType, setCalcType] = useState<"simple" | "count" | "ratio" | "formula">("formula");
  const [metricAdditivity, setMetricAdditivity] = useState<"additive" | "semi" | "non">("additive");
  const [analysisTimeRange, setAnalysisTimeRange] = useState("12");
  const [analysisDateFrom, setAnalysisDateFrom] = useState("");
  const [analysisDateTo, setAnalysisDateTo] = useState("");
  const [analysisGranularity, setAnalysisGranularity] = useState("month");
  const [transformCompare, setTransformCompare] = useState<"none" | "mom" | "yoy" | "fixed">("none");
  const [transformCompareFixedValue, setTransformCompareFixedValue] = useState("");
  const [transformShowDelta, setTransformShowDelta] = useState(true);
  const [transformShowDeltaPct, setTransformShowDeltaPct] = useState(true);
  const [transformShowAccum, setTransformShowAccum] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [chartColorScheme, setChartColorScheme] = useState("auto");
  const [chartNumberFormat, setChartNumberFormat] = useState<"number" | "currency" | "K" | "M" | "BI" | "percent">("number");
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
  const [chartPinnedDimensions, setChartPinnedDimensions] = useState<string[]>([]);
  const [chartSeriesColors, setChartSeriesColors] = useState<Record<string, string>>({});
  const [interCrossFilter, setInterCrossFilter] = useState(true);
  const [interCrossFilterFields, setInterCrossFilterFields] = useState<string[]>([]);
  const [interDrilldown, setInterDrilldown] = useState(false);
  const [interDrilldownHierarchy, setInterDrilldownHierarchy] = useState<string[]>([]);
  const [interDrillThrough, setInterDrillThrough] = useState(false);
  const [interDrillThroughTarget, setInterDrillThroughTarget] = useState("");
  const [interTooltipFields, setInterTooltipFields] = useState<string[]>(["value", "delta_pct"]);
  const [interHighlight, setInterHighlight] = useState(true);

  // Dashboard vinculado al ETL
  const [linkedDashboardId, setLinkedDashboardId] = useState<string | null>(null);
  const [linkedDashboardName, setLinkedDashboardName] = useState("Dashboard principal");
  const [dashboardSyncing, setDashboardSyncing] = useState(false);
  const [availableDashboards, setAvailableDashboards] = useState<{ id: string; title: string }[]>([]);
  const [dashboardListLoading, setDashboardListLoading] = useState(false);

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
  const [datasetRelations, setDatasetRelations] = useState<DatasetRelation[]>([]);
  const [relationFormConnectionId, setRelationFormConnectionId] = useState("");
  const [relationFormTableKey, setRelationFormTableKey] = useState("");
  const [relationFormThisColumn, setRelationFormThisColumn] = useState("");
  const [relationFormOtherColumn, setRelationFormOtherColumn] = useState("");
  const [relationFormJoinType, setRelationFormJoinType] = useState<"INNER" | "LEFT">("LEFT");
  const [connectionTables, setConnectionTables] = useState<{ schema: string; name: string; columns: { name: string }[] }[]>([]);
  const [connectionTablesLoading, setConnectionTablesLoading] = useState(false);
  const [otherTableColumnsLoaded, setOtherTableColumnsLoaded] = useState<string[]>([]);
  const [otherTableColumnsLoading, setOtherTableColumnsLoading] = useState(false);
  const formulaInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [formulaSuggestions, setFormulaSuggestions] = useState<string[]>([]);
  const [formulaSuggestionIndex, setFormulaSuggestionIndex] = useState(0);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [formulasHelpOpen, setFormulasHelpOpen] = useState(false);
  /** Columnas calculadas (ej. factura = CANTIDAD * PRECIO_UNITARIO); se guardan en dataset y aparecen como medidas. */
  const [derivedColumns, setDerivedColumns] = useState<DerivedColumn[]>([]);

  const WIZARD_STEPS: Record<"A" | "B" | "C" | "D", string[]> = {
    A: ["Profiling", "Grain", "Tiempo", "Roles BI", "Relaciones", "Publicar"],
    B: ["Identidad", "Cálculo", "Propiedades", "Filtros base", "Preview"],
    C: ["Métricas", "Dimensiones y Tiempo", "Filtros", "Transformaciones", "Preview"],
    D: ["Tipo visual", "Mapeo", "Formato y colores", "Guardar"],
  };

  const currentStepLabel = WIZARD_STEPS[wizard][wizardStep];
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
    else if (wizard === "B") { setWizard("A"); setWizardStep(WIZARD_STEPS.A.length - 1); }
    else if (wizard === "C") { setWizard("B"); setWizardStep(WIZARD_STEPS.B.length - 1); }
    else if (wizard === "D") { setWizard("C"); setWizardStep(WIZARD_STEPS.C.length - 1); }
  };

  const fetchData = useCallback(async (opts?: { silent?: boolean; sampleRows?: number }) => {
    if (!opts?.silent) setLoading(true);
    try {
      // Pedir muestra siempre para que Profiling tenga filas/columnas (tablas en etl_output se leen con sampleRows)
      const sampleRows = opts?.sampleRows ?? 500;
      const url = `/api/etl/${etlId}/metrics-data?sampleRows=${Math.min(500, Math.max(0, sampleRows))}`;
      const res = await fetch(url);
      const json: MetricsDataResponse = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.data ? "Error al cargar datos" : (json as { error?: string }).error ?? "Error");
        return;
      }
      setData(json.data);
      setEtlData(buildEtlDataFromMetricsResponse(json.data));
      if (Array.isArray(json.data?.rawRows)) setRawTableData(json.data.rawRows);
    } catch (e) {
      toast.error("Error al cargar métricas");
    } finally {
      setLoading(false);
    }
  }, [etlId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    const d = data as any;
    if (d?.linkedDashboardId) { setLinkedDashboardId(d.linkedDashboardId); dashboardHydratedRef.current = true; }
    if (Array.isArray(d?.dashboardFilters) && d.dashboardFilters.length > 0) setDashboardFilters(d.dashboardFilters);
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
      if (cfg.columnRoles && typeof cfg.columnRoles === "object") setColumnRoles(cfg.columnRoles as Record<string, { role: ColumnRole; aggregation: string; label: string; visible: boolean; geoType?: GeoType }>);
      if (Array.isArray(cfg.datasetRelations)) setDatasetRelations(cfg.datasetRelations as DatasetRelation[]);
    }
    if (Array.isArray((cfg as { derivedColumns?: DerivedColumn[] }).derivedColumns)) setDerivedColumns((cfg as { derivedColumns: DerivedColumn[] }).derivedColumns);
  }, [data?.datasetConfig]);

  const connectionOptions = connectionsProp.map((c) => ({ value: String(c.id), label: `${c.title || c.id} (${c.type || ""})` }));

  useEffect(() => {
    if (!relationFormConnectionId) {
      setConnectionTables([]);
      setRelationFormTableKey("");
      return;
    }
    setConnectionTablesLoading(true);
    setRelationFormTableKey("");
    fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: relationFormConnectionId, discoverTables: true }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.metadata?.tables && Array.isArray(json.metadata.tables)) {
          setConnectionTables(json.metadata.tables);
        } else {
          setConnectionTables([]);
        }
      })
      .catch(() => setConnectionTables([]))
      .finally(() => setConnectionTablesLoading(false));
  }, [relationFormConnectionId]);

  const loadTableColumns = useCallback((connId: string, tableKey: string): Promise<string[]> => {
    if (!tableKey) return Promise.resolve([]);
    return fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: connId, tableName: tableKey }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.metadata?.tables?.[0]?.columns) {
          return json.metadata.tables[0].columns.map((c: { name: string }) => c.name);
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

  // Cargar lista de dashboards del ETL para poder elegir destino
  useEffect(() => {
    if (!etlId || savedMetrics.length === 0) return;
    setDashboardListLoading(true);
    fetch(`/api/dashboard?etl_id=${encodeURIComponent(etlId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok && Array.isArray(json.dashboards)) setAvailableDashboards(json.dashboards);
      })
      .finally(() => setDashboardListLoading(false));
  }, [etlId, savedMetrics.length]);

  const hasData = data?.hasData ?? false;
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
    const allowedChars = /^[a-zA-Z0-9_*+\-/().,\s'"%;^]+$/;
    if (!allowedChars.test(expr)) return "La fórmula contiene caracteres no permitidos. Usá columnas, números, operadores ( * - + / ^ ) y comillas para texto.";
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
    if (chartNumberFormat === "K") { val = n / 1_000; suffix = "K"; }
    else if (chartNumberFormat === "M") { val = n / 1_000_000; suffix = "M"; }
    else if (chartNumberFormat === "BI") { val = n / 1_000_000_000; suffix = "BI"; }
    else if (chartNumberFormat === "percent") { suffix = "%"; }
    const formatted = new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: chartDecimals,
      useGrouping: chartThousandSep,
    }).format(val);
    if (chartNumberFormat === "currency") return `${chartCurrencySymbol}${formatted}`;
    return `${formatted}${suffix}`;
  }, [chartNumberFormat, chartDecimals, chartThousandSep, chartCurrencySymbol]);

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
    const cfg = saved.aggregationConfig;
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
      setChartNumberFormat(
        (["number", "currency", "K", "M", "BI", "percent"] as const).includes(cfg.chartNumberFormat as any)
          ? (cfg.chartNumberFormat as "number" | "currency" | "K" | "M" | "BI" | "percent")
          : "number"
      );
      setChartCurrencySymbol(cfg.chartCurrencySymbol ?? "$");
      setChartThousandSep(cfg.chartThousandSep !== false);
      setChartDecimals(cfg.chartDecimals ?? 2);
      setChartSortDirection(
        (["none", "asc", "desc"] as const).includes(cfg.chartSortDirection as any)
          ? (cfg.chartSortDirection as "none" | "asc" | "desc")
          : "none"
      );
      setChartSortBy((["series", "axis"] as const).includes(cfg.chartSortBy as any) ? (cfg.chartSortBy as "series" | "axis") : "series");
      setChartAxisOrder((["alpha", "date_asc", "date_desc"] as const).includes(cfg.chartAxisOrder as any) ? (cfg.chartAxisOrder as "alpha" | "date_asc" | "date_desc") : "alpha");
      setChartScaleMode((["auto", "dataset", "custom"] as const).includes(cfg.chartScaleMode as any) ? (cfg.chartScaleMode as "auto" | "dataset" | "custom") : "auto");
      setChartScaleMin(typeof cfg.chartScaleMin === "string" || typeof cfg.chartScaleMin === "number" ? String(cfg.chartScaleMin) : "");
      setChartScaleMax(typeof cfg.chartScaleMax === "string" || typeof cfg.chartScaleMax === "number" ? String(cfg.chartScaleMax) : "");
      setChartAxisStep(typeof cfg.chartAxisStep === "string" || typeof cfg.chartAxisStep === "number" ? String(cfg.chartAxisStep) : "");
      setChartRankingEnabled(!!cfg.chartRankingEnabled);
      setChartRankingTop(cfg.chartRankingTop ?? 5);
      setChartRankingMetric(cfg.chartRankingMetric ?? "");
      setChartPinnedDimensions(Array.isArray(cfg.chartPinnedDimensions) ? cfg.chartPinnedDimensions : []);
      setChartColorScheme(cfg.chartColorScheme ?? "auto");
      setChartSeriesColors(cfg.chartSeriesColors && typeof cfg.chartSeriesColors === "object" ? cfg.chartSeriesColors : {});
      setShowDataLabels(!!cfg.showDataLabels);
      setInterCrossFilter(cfg.interCrossFilter !== false);
      setInterCrossFilterFields(Array.isArray(cfg.interCrossFilterFields) ? cfg.interCrossFilterFields : []);
      setInterDrilldown(!!cfg.interDrilldown);
      setInterDrilldownHierarchy(Array.isArray(cfg.interDrilldownHierarchy) ? cfg.interDrilldownHierarchy : []);
      setInterDrillThrough(!!cfg.interDrillThrough);
      setInterDrillThroughTarget(cfg.interDrillThroughTarget ?? "");
      setInterTooltipFields(Array.isArray(cfg.interTooltipFields) ? cfg.interTooltipFields : ["value", "delta_pct"]);
      setInterHighlight(cfg.interHighlight !== false);
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
      setChartNumberFormat("number");
      setChartCurrencySymbol("$");
      setChartThousandSep(true);
      setChartDecimals(2);
      setChartSortDirection("none");
      setChartRankingEnabled(false);
      setChartRankingTop(5);
      setChartRankingMetric("");
      setChartPinnedDimensions([]);
      setChartColorScheme("auto");
      setChartSeriesColors({});
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

  const fetchPreview = useCallback(async () => {
    if (formMetrics.length === 0) return;
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const metricsRes = await fetch(`/api/etl/${etlId}/metrics-data`);
      const metricsJson = await metricsRes.json();
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
          const metricsApiRes = await fetch(`/api/etl/${etlId}/metrics`);
          const metricsApiJson = await metricsApiRes.json();
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
      const metricsPayload = formMetrics.map((m) => {
        let rawExpr = ((m as { expression?: string }).expression ?? "").trim();
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
        limit: formLimit ?? 100,
      };
      if (derivedToSend.length > 0) {
        body.derivedColumns = derivedToSend.map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" }));
      }
      const includePeriodInResult = formDimensions.some((d) => d && String(d).trim() === timeColumn);
      if (wizard === "C" && timeColumn) {
        if (analysisTimeRange === "custom" && analysisDateFrom && analysisDateTo) {
          body.dateRangeFilter = { field: timeColumn, from: analysisDateFrom, to: analysisDateTo };
        } else {
          const rangeNum = Number(analysisTimeRange);
          if (rangeNum > 0) {
            body.dateRangeFilter = { field: timeColumn, last: rangeNum, unit: rangeNum <= 30 ? "days" : "months" };
          }
        }
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
      const json = await res.json();
      if (!res.ok) {
        const msg = (json?.error ?? "Error al cargar previsualización") as string;
        toast.error(msg);
        return;
      }
      setPreviewData(Array.isArray(json) ? json : []);
    } catch (e) {
      toast.error("Error al cargar vista previa");
    } finally {
      setPreviewLoading(false);
    }
  }, [etlId, tableNameForPreview, formDimensions, formMetrics, formFilters, formOrderBy, formLimit, fetchData, derivedColumnsByName, derivedColumns, wizard, timeColumn, analysisGranularity, analysisTimeRange, analysisDateFrom, analysisDateTo, transformCompare, transformCompareFixedValue, savedMetrics]);

  const fetchPreviewRef = useRef(fetchPreview);
  fetchPreviewRef.current = fetchPreview;

  // Refrescar previsualización solo una vez al entrar al paso de vista previa (wizard C, paso 5). No incluir fetchPreview en deps para evitar bucle infinito.
  const prevWizardStepRef = useRef<{ wizard: string; wizardStep: number; showForm: boolean }>({ wizard: "", wizardStep: -1, showForm: false });
  useEffect(() => {
    const now = wizard === "C" && wizardStep === 4 && showForm;
    const prev = prevWizardStepRef.current;
    const wasAlreadyHere = prev.wizard === "C" && prev.wizardStep === 4 && prev.showForm;
    prevWizardStepRef.current = { wizard, wizardStep, showForm };
    if (now && !wasAlreadyHere) {
      fetchPreviewRef.current();
    }
  }, [wizard, wizardStep, showForm]);

  const { recommendationText, suggestedChartType } = useMemo(() => {
    const hasDim = formDimensions.filter(Boolean).length > 0;
    const dimCount = formDimensions.filter(Boolean).length;
    const metricCount = formMetrics.length;
    const isTimeSeries = !!timeColumn && !!analysisGranularity;
    const hasTransformCompare = transformCompare === "mom" || transformCompare === "yoy";
    const previewRows = previewData?.length ?? 0;
    const geoKeywords = /lat|lng|lon|geo|country|pais|ciudad|city|region|provincia|estado|state|zip|postal|coord/i;
    const hasGeoDim = formDimensions.some((d) => geoKeywords.test(d));

    if (!hasDim && metricCount === 0) return { recommendationText: "Elegí al menos una métrica; las dimensiones son opcionales (sin dimensión = KPI único).", suggestedChartType: "bar" };
    if (!hasDim && metricCount >= 1) return { recommendationText: "Un solo valor numérico sin dimensiones: recomendamos **KPI** para destacar el número.", suggestedChartType: "kpi" };
    if (hasGeoDim) return { recommendationText: "Dimensión geográfica detectada: recomendamos **Mapa** para visualizar distribución espacial.", suggestedChartType: "map" };
    if (isTimeSeries && hasTransformCompare && metricCount >= 1) return { recommendationText: "Serie temporal con comparación: recomendamos **Combo** (barras para valor actual, línea para período anterior).", suggestedChartType: "combo" };
    if (isTimeSeries && metricCount === 1) return { recommendationText: "Serie temporal con una métrica: recomendamos **Líneas** para ver la tendencia, o **Área** para resaltar volumen.", suggestedChartType: "line" };
    if (isTimeSeries && metricCount > 1) return { recommendationText: "Serie temporal con varias métricas: recomendamos **Combo** (barras + línea) para comparar escalas.", suggestedChartType: "combo" };
    if (hasDim && metricCount >= 2) return { recommendationText: "Varias métricas: recomendamos **Combo** (barras + línea) o **Tabla** para comparar.", suggestedChartType: "combo" };
    if (dimCount >= 1 && previewRows > 12) return { recommendationText: "Muchas categorías (" + previewRows + " filas): recomendamos **Barras horizontales** o **Tabla** para mejor lectura.", suggestedChartType: "horizontalBar" };
    if (dimCount >= 1 && previewRows <= 6 && metricCount === 1) return { recommendationText: "Pocas categorías: recomendamos **Circular** o **Dona** para distribución, o **Barras** para comparar.", suggestedChartType: "pie" };
    if (hasDim && metricCount === 1) return { recommendationText: "Una dimensión y un valor: recomendamos **Barras** para comparar categorías.", suggestedChartType: "bar" };
    return { recommendationText: "Seleccioná el tipo de gráfico que mejor represente tu análisis.", suggestedChartType: "bar" };
  }, [formDimensions, formMetrics, timeColumn, analysisGranularity, transformCompare, previewData]);

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

  const previewChartConfig = useMemo(() => {
    if (!previewData || previewData.length === 0) return null;
    const first = previewData[0] as Record<string, unknown>;
    const keys = Object.keys(first);

    const xKey = chartXAxis && keys.includes(chartXAxis) ? chartXAxis : (() => {
      const firstDim = formDimensions[0];
      if (firstDim && keys.includes(firstDim)) return firstDim;
      const metricKeys = keys.filter((k) => /^metric_\d+$/.test(k));
      return metricKeys.length === keys.length ? undefined : keys[0];
    })();

    let yKeys = chartYAxes.filter((k) => keys.includes(k));
    if (yKeys.length === 0) {
      yKeys = formMetrics.map((m) => m.alias || m.field || "").filter(Boolean).filter((k) => keys.includes(k));
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
        const m = formMetrics[idx];
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
      const sortKey = yKeys[0]!;
      rows.sort((a, b) => {
        const va = Number((a as Record<string, unknown>)[sortKey] ?? 0);
        const vb = Number((b as Record<string, unknown>)[sortKey] ?? 0);
        return chartSortDirection === "asc" ? va - vb : vb - va;
      });
    }

    if (chartRankingEnabled && chartRankingTop > 0) {
      const rKey = chartRankingMetric && keys.includes(chartRankingMetric) ? chartRankingMetric : yKeys[0]!;
      rows.sort((a, b) => Number((b as Record<string, unknown>)[rKey] ?? 0) - Number((a as Record<string, unknown>)[rKey] ?? 0));
      rows = rows.slice(0, chartRankingTop);
    }

    if (chartSeriesField && keys.includes(chartSeriesField) && xKey) {
      const seriesValues = [...new Set(rows.map((r) => String((r as Record<string, unknown>)[chartSeriesField] ?? "")))];
      const xValues = [...new Set(rows.map((r) => String((r as Record<string, unknown>)[xKey] ?? "")))];
      const yField = yKeys[0]!;
      const datasets = seriesValues.map((sv, idx) => {
        const color = getColor(sv, idx);
        return {
          label: sv,
          data: xValues.map((xv) => {
            const row = rows.find((r) => String((r as Record<string, unknown>)[xKey] ?? "") === xv && String((r as Record<string, unknown>)[chartSeriesField] ?? "") === sv);
            return row ? Number((row as Record<string, unknown>)[yField] ?? 0) : 0;
          }),
          backgroundColor: color + "99",
          borderColor: color,
          borderWidth: 1,
        };
      });
      return { labels: xValues, datasets };
    }

    const labels = xKey != null ? rows.map((r) => String((r as Record<string, unknown>)[xKey] ?? "")) : rows.map((_, i) => (i === 0 ? "Total" : ""));
    const datasets = yKeys.map((alias, idx) => {
      const label = colLabel(alias);
      const color = getColor(label, idx);
      return {
        label,
        data: rows.map((r) => Number((r as Record<string, unknown>)[alias] ?? 0)),
        backgroundColor: color + "99",
        borderColor: color,
        borderWidth: 1,
      };
    });

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
  }, [previewData, formDimensions, formMetrics, chartXAxis, chartYAxes, chartSeriesField, chartSortDirection, chartSortBy, chartAxisOrder, chartRankingEnabled, chartRankingTop, chartRankingMetric, chartSeriesColors, formChartType]);

  const previewKpiValue = useMemo(() => {
    if (!previewData || previewData.length === 0 || !previewChartConfig) return undefined;
    const firstNum = previewChartConfig.datasets[0]?.data?.[0];
    return firstNum != null ? firstNum : undefined;
  }, [previewData, previewChartConfig]);

  /** Resultado principal del cálculo (paso Cálculo): valor de la última métrica = fórmula o métrica principal. La API devuelve metric_0, metric_1, ... */
  const previewCalculationResult = useMemo(() => {
    if (!previewData || previewData.length === 0 || formMetrics.length === 0) return undefined;
    const row = previewData[0] as Record<string, unknown>;
    const lastKey = `metric_${formMetrics.length - 1}`;
    const val = row[lastKey];
    if (val != null && typeof val === "number" && !Number.isNaN(val)) return val;
    for (let i = formMetrics.length - 1; i >= 0; i--) {
      const v = row[`metric_${i}`];
      if (v != null && typeof v === "number" && !Number.isNaN(v)) return v;
    }
    return undefined;
  }, [previewData, formMetrics.length]);

  const previewVisibleKeys = useMemo(() => {
    if (!previewData?.[0]) return [];
    const allKeys = Object.keys(previewData[0] as Record<string, unknown>);
    if (transformCompare !== "mom" && transformCompare !== "yoy") return allKeys;
    return allKeys.filter((k) => {
      if (k.endsWith("_delta_pct") && !transformShowDeltaPct) return false;
      if (k.endsWith("_delta") && !k.endsWith("_delta_pct") && !transformShowDelta) return false;
      if (k.endsWith("_acumulado") && !transformShowAccum) return false;
      return true;
    });
  }, [previewData, transformCompare, transformShowDelta, transformShowDeltaPct, transformShowAccum]);

  const chartAvailableColumns = useMemo(() => {
    if (!previewData?.[0]) return [];
    return previewVisibleKeys.map((k, i) => {
      const match = k.match(/^metric_(\d+)$/);
      let label = k;
      if (match) {
        const idx = parseInt(match[1]!, 10);
        const m = formMetrics[idx];
        label = m ? (m.alias || m.field || k) : k;
      }
      return { key: k, label };
    });
  }, [previewVisibleKeys, previewData, formMetrics]);

  const chartDimensionColumns = useMemo(() => chartAvailableColumns.filter((c) => {
    if (/^metric_\d+/.test(c.key)) return false;
    if (c.key.endsWith("_prev") || c.key.endsWith("_delta") || c.key.endsWith("_delta_pct") || c.key.endsWith("_acumulado") || c.key.endsWith("_vs_fijo") || c.key.endsWith("_var_pct_fijo")) return false;
    return true;
  }), [chartAvailableColumns]);

  const chartNumericColumns = useMemo(() => chartAvailableColumns.filter((c) => {
    if (/^metric_\d+/.test(c.key)) return true;
    const metricAliases = formMetrics.map((m) => m.alias || m.field || "").filter(Boolean);
    if (metricAliases.includes(c.key)) return true;
    if (c.key.endsWith("_prev") || c.key.endsWith("_delta") || c.key.endsWith("_delta_pct") || c.key.endsWith("_acumulado") || c.key.endsWith("_vs_fijo") || c.key.endsWith("_var_pct_fijo")) return true;
    return false;
  }), [chartAvailableColumns, formMetrics]);

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
    if (!previewData?.[0] || formMetrics.length === 0) return previewVisibleKeys;
    return previewVisibleKeys.map((k) => {
      const match = k.match(/^metric_(\d+)$/);
      if (match) {
        const i = parseInt(match[1]!, 10);
        const m = formMetrics[i];
        return m ? (m.alias || m.field || k) : k;
      }
      return k;
    });
  }, [previewData, previewVisibleKeys, formMetrics]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setWizard("A");
    setWizardStep(0);
  };

  const syncMetricsToDashboard = useCallback(async (metrics: SavedMetricForm[]) => {
    if (!etlId || metrics.length === 0) return;
    setDashboardSyncing(true);
    try {
      let dbId = linkedDashboardId;

      // 1. Crear dashboard si no existe
      if (!dbId) {
        const createRes = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: linkedDashboardName || "Dashboard principal",
            etl_id: etlId,
            ...(etlClientId ? { client_id: etlClientId } : {}),
          }),
        });
        const createJson = await createRes.json();
        if (!createRes.ok || !createJson.ok) {
          toast.error("Error al crear el dashboard");
          return;
        }
        dbId = createJson.id as string;
        setLinkedDashboardId(dbId);
      }

      // 2. Convertir métricas a StudioWidget (formato real del AdminDashboardStudio)
      const widgets = metrics.map((m, idx) => {
        const cfg = (m.aggregationConfig ?? {}) as Record<string, any>;
        const chartType = cfg.chartType ?? (m as { chartType?: string }).chartType ?? "bar";
        const dims = Array.isArray(cfg.dimensions) ? cfg.dimensions : [cfg.dimension, cfg.dimension2].filter(Boolean);
        const metricsArr = Array.isArray(cfg.metrics) ? cfg.metrics : [m.metric];

        return {
          id: `w-${m.id}`,
          type: chartType,
          title: m.name,
          x: 0,
          y: 0,
          w: 400,
          h: 280,
          gridOrder: idx,
          gridSpan: chartType === "kpi" ? 1 : 2,
          pageId: "page-1",
          metricId: m.id,
          aggregationConfig: {
            enabled: true,
            dimension: dims[0] || undefined,
            dimension2: dims[1] || undefined,
            metrics: metricsArr.map((met: any) => {
              const base = {
                id: met.id || `m-${idx}`,
                field: met.field || "",
                func: met.func || "SUM",
                alias: met.alias || "",
                condition: met.condition || undefined,
                formula: met.formula || undefined,
              };
              if (met.expression && String(met.expression).trim()) (base as any).expression = String(met.expression).trim();
              return base;
            }),
            filters: Array.isArray(cfg.filters) ? cfg.filters : undefined,
            orderBy: cfg.orderBy || undefined,
            limit: cfg.limit ?? 100,
            cumulative: cfg.cumulative || undefined,
            comparePeriod: cfg.comparePeriod || undefined,
            dateDimension: cfg.dateDimension || undefined,
            chartSeriesColors: cfg.chartSeriesColors && typeof cfg.chartSeriesColors === "object" && Object.keys(cfg.chartSeriesColors).length > 0 ? cfg.chartSeriesColors : undefined,
          },
          excludeGlobalFilters: false,
          color: cfg.chartSeriesColors ? Object.values(cfg.chartSeriesColors)[0] as string : undefined,
          labelDisplayMode: undefined,
          kpiSecondaryLabel: undefined,
          dataSourceId: null,
        };
      });

      // 3. Convertir DynamicFilters a GlobalFilter (formato real del dashboard)
      const globalFiltersToSave = dashboardFilters
        .filter((f) => f.field)
        .map((f) => ({
          id: f.id,
          field: f.field,
          operator: f.filterType === "single" ? "=" : f.filterType === "multi" ? "IN" : "BETWEEN",
          value: "",
          filterType: f.filterType,
          label: f.label,
          scope: f.scope,
          scopeMetricIds: f.scopeMetricIds,
          applyToOtherDashboards: f.applyToOtherDashboards,
        }));

      // 4. Construir layout compatible con AdminDashboardStudio
      const dcArr = derivedColumns.length > 0 ? { derivedColumns } : undefined;
      const layoutPayload = {
        widgets,
        theme: {},
        pages: [{ id: "page-1", name: "Página 1" }],
        activePageId: "page-1",
        savedMetrics: metrics,
        ...(dcArr && { datasetConfig: dcArr }),
      };

      // 5. Guardar via API
      const res = await fetch(`/api/dashboard/${dbId}/layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: layoutPayload,
          global_filters_config: globalFiltersToSave,
          title: linkedDashboardName || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al sincronizar dashboard");
        return;
      }

      // 6. Persistir el dashboardId en el ETL
      await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: metrics, dashboardId: dbId, dashboardFilters }),
      });

      toast.success(linkedDashboardId ? "Dashboard sincronizado" : "Dashboard creado y sincronizado");
    } catch (e) {
      console.error("Error syncing dashboard", e);
      toast.error("Error al sincronizar dashboard");
    } finally {
      setDashboardSyncing(false);
    }
  }, [etlId, etlClientId, linkedDashboardId, linkedDashboardName, dashboardFilters, derivedColumns, formChartType]);

  const saveMetric = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error("Nombre requerido");
      return;
    }
    const firstMetric = formMetrics[0];
    if (!firstMetric) {
      toast.error("Agregá al menos una métrica");
      return;
    }
    const metricToSave = { ...firstMetric, id: firstMetric.id || `m-${Date.now()}` };
    const aggregationConfig = {
      dimension: formDimensions[0] || undefined,
      dimension2: formDimensions[1] || undefined,
      dimensions: formDimensions.length > 0 ? formDimensions : undefined,
      metrics: formMetrics.map((m) => ({ ...m, id: m.id || `m-${Date.now()}` })),
      filters: formFilters.length ? formFilters.map((f) => ({ ...f, operator: Array.isArray(f.value) ? "IN" : f.operator })) : undefined,
      orderBy: formOrderBy ?? undefined,
      limit: formLimit ?? 100,
      chartType: formChartType || undefined,
      chartXAxis: chartXAxis || undefined,
      chartYAxes: chartYAxes.length > 0 ? chartYAxes : undefined,
      chartSeriesField: chartSeriesField || undefined,
      chartNumberFormat: chartNumberFormat !== "number" ? chartNumberFormat : undefined,
      chartCurrencySymbol: chartNumberFormat === "currency" ? chartCurrencySymbol : undefined,
      chartThousandSep: chartThousandSep === false ? false : undefined,
      chartDecimals: chartDecimals !== 2 ? chartDecimals : undefined,
      chartSortDirection: chartSortDirection !== "none" ? chartSortDirection : undefined,
      chartSortBy: chartSortBy !== "series" ? chartSortBy : undefined,
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
    const datasetConfigToSave = createDerivedColumn
      ? { ...(data?.datasetConfig && typeof data.datasetConfig === "object" ? (data.datasetConfig as Record<string, unknown>) : {}), derivedColumns: nextDerivedColumns }
      : undefined;

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
          ...(datasetConfigToSave != null && { datasetConfig: datasetConfigToSave }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al guardar");
        return;
      }
      toast.success(editingId ? "Métrica actualizada" : "Métrica creada");
      if (createDerivedColumn) toast.success(`Se creó la columna «${alias}» en el dataset; la podés usar en «Insertar columna» en otras métricas.`, { duration: 6000 });
      setData((prev) => (prev ? { ...prev, savedMetrics: next, datasetConfig: datasetConfigToSave ?? prev.datasetConfig } : null));
      if (createDerivedColumn) setDerivedColumns(nextDerivedColumns);
      syncMetricsToDashboard(next);
      closeForm();
    } catch (e) {
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
      const datasetConfigToSave = { ...(data?.datasetConfig && typeof data.datasetConfig === "object" ? (data.datasetConfig as Record<string, unknown>) : {}), derivedColumns: nextDerived };
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: savedMetrics, datasetConfig: datasetConfigToSave }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al crear la columna");
        return;
      }
      setDerivedColumns(nextDerived);
      setData((prev) => (prev ? { ...prev, datasetConfig: datasetConfigToSave } : null));
      setColumnRoles((prev) => ({ ...prev, [colName]: { role: "measure", aggregation: "sum", label: colName, visible: true } }));
      toast.success(`Columna «${colName}» creada. Aparece en Rol BI, Profiling e «Insertar columna».`);
    } catch {
      toast.error("Error al crear la columna");
    } finally {
      setCreatingColumn(false);
    }
  };

  /** Guardar la métrica actual desde el paso Cálculo (mismo flujo que "Crear columna" pero para métrica). */
  const saveMetricFromCalculationStep = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error("Escribí un nombre para la métrica.");
      return;
    }
    const firstMetric = formMetrics[0];
    if (!firstMetric) return;
    const expr = (firstMetric as { expression?: string })?.expression?.trim();
    if (!expr) {
      toast.error("Escribí una fórmula para la métrica.");
      return;
    }
    if (formulaSyntaxError) {
      toast.error(formulaSyntaxError);
      return;
    }
    const metricToSave = { ...firstMetric, id: firstMetric.id || `m-${Date.now()}` };
    const aggregationConfig = {
      dimension: formDimensions[0] || undefined,
      dimension2: formDimensions[1] || undefined,
      dimensions: formDimensions.length > 0 ? formDimensions : undefined,
      metrics: formMetrics.map((m) => ({ ...m, id: m.id || `m-${Date.now()}` })),
      filters: formFilters.length ? formFilters.map((f) => ({ ...f, operator: Array.isArray(f.value) ? "IN" : f.operator })) : undefined,
      orderBy: formOrderBy ?? undefined,
      limit: formLimit ?? 100,
      chartType: formChartType || undefined,
      chartXAxis: chartXAxis || undefined,
      chartYAxes: chartYAxes.length > 0 ? chartYAxes : undefined,
      chartSeriesField: chartSeriesField || undefined,
      chartNumberFormat: chartNumberFormat !== "number" ? chartNumberFormat : undefined,
      chartCurrencySymbol: chartNumberFormat === "currency" ? chartCurrencySymbol : undefined,
      chartThousandSep: chartThousandSep === false ? false : undefined,
      chartDecimals: chartDecimals !== 2 ? chartDecimals : undefined,
      chartSortDirection: chartSortDirection !== "none" ? chartSortDirection : undefined,
      chartSortBy: chartSortBy !== "series" ? chartSortBy : undefined,
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
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al guardar la métrica");
        return;
      }
      setData((prev) => (prev ? { ...prev, savedMetrics: next } : null));
      syncMetricsToDashboard(next);
      toast.success(`Métrica «${name}» guardada en Calculadas (métricas).`);
      closeForm();
    } catch {
      toast.error("Error al guardar la métrica");
    } finally {
      setSaving(false);
    }
  };

  const deleteMetric = async (id: string) => {
    if (!confirm("¿Eliminar esta métrica?")) return;
    const next = savedMetrics.filter((s) => s.id !== id);
    setSaving(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al eliminar");
        return;
      }
      toast.success("Métrica eliminada");
      setData((prev) => (prev ? { ...prev, savedMetrics: next } : null));
    } catch (e) {
      toast.error("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const deleteDerivedColumn = async (name: string) => {
    if (!confirm(`¿Eliminar la columna calculada «${name}»?`)) return;
    const nextDerived = derivedColumns.filter((d) => d.name !== name);
    const datasetConfigToSave = {
      ...(data?.datasetConfig && typeof data.datasetConfig === "object" ? (data.datasetConfig as Record<string, unknown>) : {}),
      derivedColumns: nextDerived.map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" })),
    };
    setSaving(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: savedMetrics, datasetConfig: datasetConfigToSave }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al eliminar la columna calculada");
        return;
      }
      setDerivedColumns(nextDerived);
      setData((prev) => (prev ? { ...prev, datasetConfig: datasetConfigToSave } : null));
      toast.success("Columna calculada eliminada");
    } catch {
      toast.error("Error al eliminar la columna calculada");
    } finally {
      setSaving(false);
    }
  };

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
        const json = await res.json();
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
          <Link
            href={`/admin/etl/${etlId}`}
            className="flex items-center gap-2 text-sm font-medium rounded-lg transition-colors"
            style={{ color: "var(--platform-fg-muted)" }}
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al ETL
          </Link>
          <h1 className="text-xl font-semibold" style={{ color: "var(--platform-fg)" }}>
            Métricas reutilizables – {etlTitle}
          </h1>
        </div>
        <div className="flex items-center gap-2">
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
          {hasData && (
            <Button
              type="button"
              className="rounded-xl"
              style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
              onClick={openNew}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva métrica
            </Button>
          )}
        </div>
      </header>

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
          {/* Tabs: Dataset, Métrica, Análisis, Gráfico */}
          <div className="flex border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
            {(["A", "B", "C", "D"] as const).map((w) => (
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

          <div className="flex flex-col min-w-0 flex-1">
            {/* Top bar: step title + actions */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              <div>
                <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{wizard === "A" ? "Dataset" : wizard === "B" ? "Métrica" : wizard === "C" ? "Análisis" : "Gráfico"} — {WIZARD_STEPS[wizard][wizardStep]}</p>
                <h2 className="text-base font-semibold" style={{ color: "var(--platform-fg)" }}>{WIZARD_STEPS[wizard][wizardStep]}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={closeForm}>Cancelar</Button>
                {canPrev && <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>← Anterior</Button>}
                {(wizard === "D" && wizardStep === WIZARD_STEPS.D.length - 1) ? (
                  <Button type="button" size="sm" className="rounded-lg" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetric} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Guardar cambios" : "Crear métrica"}</Button>
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
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => fetchData({ silent: true, sampleRows: 500 })} disabled={loading}>
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
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-500 hover:bg-red-500/10" onClick={() => deleteDerivedColumn(d.name)} disabled={saving} title="Eliminar columna calculada" aria-label={`Eliminar ${d.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
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
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Métrica</Button>
                  </div>
                </section>
              )}

              {/* Wizard B0: Identidad */}
              {wizard === "B" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Identidad — Nombre de la métrica</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Nombre único para reutilizar en dashboards. Si guardás como métrica, este nombre aparecerá en «Calculadas (métricas)». El cálculo se define en pasos siguientes.</p>
                  <div className="space-y-4 mb-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Nombre *</Label>
                      <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej. Ventas totales" className="rounded-xl max-w-md" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                      <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>Obligatorio al guardar. Se mostrará en la lista «Calculadas (métricas)».</p>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-medium uppercase mb-1" style={{ color: "var(--platform-fg-muted)" }}>Dataset base</p>
                      <p className="font-medium text-sm" style={{ color: "var(--platform-fg)" }}>{etlTitle}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>{data?.schema}.{data?.tableName} · {data?.rowCount ?? 0} filas</p>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Cálculo</Button>
                  </div>
                </section>
              )}

              {/* Wizard B1: Cálculo (unificado: tipo + simple / conteo / ratio / fórmula personalizada) */}
              {wizard === "B" && wizardStep === 1 && (
                <section className="rounded-xl border p-6 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Cálculo de la métrica</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Escribí la fórmula con nombres de columnas (estilo Excel). Podés usar números, literales entre comillas e IF(condición, valor_si_verdadero, valor_si_falso). Diferenciá entre cálculo por fila y cálculo agregado.</p>

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
                        </div>
                        {formulaSyntaxError && (
                          <p className="text-sm mt-2 rounded-lg py-2 px-3 border" role="alert" style={{ color: "var(--platform-fg)", borderColor: "var(--platform-error, #dc2626)", background: "var(--platform-error-muted, rgba(220,38,38,0.08))" }}>
                            {formulaSyntaxError}
                          </p>
                        )}
                        {/* Determinación automática según la fórmula: agregada → métrica (Calculadas); por fila → columna (dataset) */}
                        {isAggregate ? (
                          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--platform-accent)", background: "var(--platform-accent-dim, rgba(59,130,246,0.06))" }}>
                            <Label className="text-sm font-medium block" style={{ color: "var(--platform-fg)" }}>Se guardará como métrica (automático)</Label>
                            <p className="text-xs mb-1" style={{ color: "var(--platform-fg-muted)" }}>La fórmula usa agregación (SUM, AVG, etc.), por eso se guarda en «Calculadas (métricas)», no como columna. Indicá el nombre y guardá.</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <div>
                                <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Nombre de la métrica *</Label>
                                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej. Ventas totales, Cantidad vendida" className="h-9 text-sm rounded-lg w-full max-w-[220px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                              </div>
                              <div className="flex items-end">
                                <Button type="button" className="rounded-xl h-9" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetricFromCalculationStep} disabled={saving || !exprValue.trim() || !formName.trim() || !!formulaSyntaxError}>
                                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                  {saving ? " Guardando…" : " Guardar como métrica"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                            <Label className="text-sm font-medium block" style={{ color: "var(--platform-fg)" }}>Se guardará como columna en el dataset (automático)</Label>
                            <p className="text-xs mb-1" style={{ color: "var(--platform-fg-muted)" }}>La fórmula no usa agregación, por eso se crea como columna en el dataset (no modifica la cantidad de filas). Nombre: solo letras, números y _.</p>
                            {grainSafetyErrorForColumn && (
                              <p className="text-xs py-1.5 px-2 rounded border" role="alert" style={{ color: "var(--platform-error, #dc2626)", borderColor: "var(--platform-error, #dc2626)", background: "var(--platform-error-muted, rgba(220,38,38,0.08))" }}>{grainSafetyErrorForColumn}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <div>
                                <Input value={exprMetric?.alias ?? ""} onChange={(e) => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, alias: e.target.value } : m))} placeholder="Ej. factura, total_linea" className="h-9 text-sm rounded-lg w-full max-w-[200px] !bg-[var(--platform-bg)]" style={{ borderColor: aliasSyntaxError ? "var(--platform-error, #dc2626)" : "var(--platform-border)", color: "var(--platform-fg)" }} />
                                {aliasSyntaxError && <p className="text-xs mt-1" style={{ color: "var(--platform-error, #dc2626)" }}>{aliasSyntaxError}</p>}
                              </div>
                              <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={createColumnFromFormula} disabled={creatingColumn || !exprValue.trim() || !(exprMetric?.alias ?? "").trim() || !!formulaSyntaxError || !!aliasSyntaxError || !!grainSafetyErrorForColumn}>
                                {creatingColumn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {creatingColumn ? " Creando…" : " Crear columna en el dataset"}
                              </Button>
                            </div>
                          </div>
                        )}
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
                                  let display: string;
                                  if (k === "periodo" && typeof v === "string") {
                                    const d = new Date(v);
                                    display = !isNaN(d.getTime()) ? d.toLocaleDateString("es-AR", { year: "numeric", month: "short" }) : v;
                                  } else {
                                    display = typeof v === "number" ? formatNumber(v) : String(v ?? "");
                                  }
                                  return (<td key={i} className="py-1.5 px-2">{display}</td>);
                                })}</tr>);
                              })}</tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                      );
                    })()}
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext} disabled={!!formulaSyntaxError}>
                      Siguiente: Propiedades
                    </Button>
                  </div>
                </section>
              )}

              {/* Wizard B4: Propiedades matemáticas */}
              {wizard === "B" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Propiedades matemáticas</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Declara el comportamiento de la métrica. Previene agregaciones incorrectas en tablas y totales.</p>
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
              )}

              {/* Wizard B5: Filtros base */}
              {wizard === "B" && wizardStep === 3 && (
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
                              <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} disabled={filterFieldLoading === f.field} onClick={async () => { setFilterFieldLoading(f.field); try { const res = await fetch(`/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(f.field)}`); const data = await res.json(); if (res.ok && Array.isArray(data.values)) setFilterFieldValues((prev) => ({ ...prev, [f.field]: data.values })); } finally { setFilterFieldLoading(null); } }}>
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
                            const data = await res.json();
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

              {/* Wizard B6: Preview métrica */}
              {wizard === "B" && wizardStep === 4 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Preview de la métrica</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Validá que el KPI se comporta como esperás antes de continuar al análisis.</p>
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
                        <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>Total {formName || "métrica"}</p>
                      </div>
                      <div className="rounded-xl border p-4 col-span-2 overflow-auto max-h-[180px]" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <table className="w-full text-xs" style={{ color: "var(--platform-fg)" }}>
                          <thead><tr style={{ borderBottom: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}>{previewData[0] && Object.keys(previewData[0]).map((k) => (<th key={k} className="text-left py-1 px-2">{k}</th>))}</tr></thead>
                          <tbody>{previewData.slice(0, 5).map((row, idx) => (<tr key={idx} style={{ borderBottom: "1px solid var(--platform-border)" }}>{Object.values(row).map((v, i) => (<td key={i} className="py-1 px-2">{String(v ?? "")}</td>))}</tr>))}</tbody>
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

              {/* Wizard C0: Métricas (resumen) */}
              {wizard === "C" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Métricas del análisis</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Métricas que se usarán en este análisis. Definidas en el paso Métrica.</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {formMetrics.map((m) => (
                      <span key={m.id} className="px-3 py-1.5 rounded-full text-sm" style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)", border: "1px solid var(--platform-accent)" }}>{m.alias || m.field || "—"} ({m.func})</span>
                    ))}
                  </div>
                  <p className="text-xs mb-4" style={{ color: "var(--platform-fg-muted)" }}>Nombre del análisis: {formName || "—"}</p>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Tiempo</Button>
                  </div>
                </section>
              )}

              {/* Wizard C1: Dimensiones y Tiempo (unificado: si se selecciona una dimensión tipo Fecha, se despliega Tiempo abajo) */}
              {wizard === "C" && wizardStep === 1 && (
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
                                    { value: "day", label: "Día" },
                                    { value: "week", label: "Semana" },
                                    { value: "month", label: "Mes" },
                                    { value: "year", label: "Año" },
                                  ]}
                                  placeholder="Granularidad…"
                                  className="w-full"
                                  buttonClassName="h-9 text-sm"
                                  disablePortal
                                />
                              </div>
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
              {wizard === "C" && wizardStep === 2 && (
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
                              <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} disabled={filterFieldLoading === f.field} onClick={async () => { setFilterFieldLoading(f.field); try { const res = await fetch(`/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(f.field)}`); const data = await res.json(); if (res.ok && Array.isArray(data.values)) setFilterFieldValues((prev) => ({ ...prev, [f.field]: data.values })); } finally { setFilterFieldLoading(null); } }}>
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
                      <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} disabled={!metricsDistinctColumn || metricsDistinctLoading} onClick={async () => { if (!metricsDistinctColumn) return; setMetricsDistinctLoading(true); setMetricsDistinctValues([]); try { const res = await fetch(`/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(metricsDistinctColumn)}`); const data = await res.json(); if (data.ok && Array.isArray(data.values)) setMetricsDistinctValues(data.values); else toast.error(data?.error || "No se pudieron cargar los valores"); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Error al cargar"); } finally { setMetricsDistinctLoading(false); } }}>{metricsDistinctLoading ? "Cargando…" : "Cargar valores"}</Button>
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
              {wizard === "C" && wizardStep === 3 && (
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
              {wizard === "C" && wizardStep === 4 && (() => {
                const hasValidMetrics = formMetrics.some((m) => m.field || (m as { expression?: string }).expression || m.formula);
                const transformLabel = transformCompare === "mom" ? "Período anterior (MoM)" : transformCompare === "yoy" ? "Año anterior (YoY)" : transformCompare === "fixed" ? `Valor fijo (${transformCompareFixedValue})` : null;
                const formatCell = (k: string, v: unknown): string => {
                  if (v == null) return "—";
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
                    {timeColumn && analysisGranularity ? ` Agrupando por ${analysisGranularity === "month" ? "mes" : analysisGranularity === "week" ? "semana" : analysisGranularity === "day" ? "día" : "año"} (${getSampleDisplayLabel(timeColumn)}).` : ""}
                    {analysisTimeRange === "custom" && analysisDateFrom && analysisDateTo ? ` Rango: ${analysisDateFrom} a ${analysisDateTo}.` : analysisTimeRange && Number(analysisTimeRange) > 0 ? ` Últimos ${analysisTimeRange} ${Number(analysisTimeRange) <= 30 ? "días" : "meses"} (respecto a los datos).` : ""}
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
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Según el tipo <strong>{CHART_TYPES.find((t) => t.value === formChartType)?.label ?? formChartType}</strong>: se sugieren Eje X, Eje Y y Serie. Podés ajustarlos manualmente.</p>

                  {chartAvailableColumns.length === 0 && (
                    <div className="rounded-lg border p-3 mb-4" style={{ borderColor: "var(--platform-accent)", background: "var(--platform-accent-dim)" }}>
                      <p className="text-xs" style={{ color: "var(--platform-accent)" }}>No hay datos de preview. Volvé al paso Preview y actualizá la vista previa primero.</p>
                    </div>
                  )}

                  <div className="space-y-5">
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Eje X (categorías / tiempo)</Label>
                      <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>La columna que define las etiquetas del eje horizontal.</p>
                      <select value={chartXAxis} onChange={(e) => setChartXAxis(e.target.value)} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                        <option value="">— Sin eje X (KPI)</option>
                        {chartDimensionColumns.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                      </select>
                    </div>

                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Eje Y (valores / métricas)</Label>
                      <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná una o varias columnas numéricas para graficar.</p>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {chartNumericColumns.map((c) => {
                          const checked = chartYAxes.includes(c.key);
                          return (
                            <label key={c.key} className="flex items-center gap-2 text-sm py-1 px-2 rounded-lg cursor-pointer transition-colors" style={{ background: checked ? "var(--platform-accent-dim)" : "transparent", color: "var(--platform-fg)" }}>
                              <input type="checkbox" checked={checked} onChange={(e) => {
                                if (e.target.checked) setChartYAxes((prev) => [...prev, c.key]);
                                else setChartYAxes((prev) => prev.filter((k) => k !== c.key));
                              }} className="rounded" />
                              {c.label}
                            </label>
                          );
                        })}
                      </div>
                      {chartYAxes.length === 0 && <p className="text-xs mt-2" style={{ color: "var(--platform-accent)" }}>Seleccioná al menos una métrica.</p>}
                    </div>

                    {chartDimensionColumns.length >= 2 && (
                      <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Serie (agrupación por color)</Label>
                        <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Si tenés más de una dimensión, podés usar una como serie: cada valor único genera una línea/barra distinta.</p>
                        <select value={chartSeriesField} onChange={(e) => setChartSeriesField(e.target.value)} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                          <option value="">— Sin serie</option>
                          {chartDimensionColumns.filter((c) => c.key !== chartXAxis).map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                    <p className="text-xs font-medium uppercase mb-1" style={{ color: "var(--platform-fg-muted)" }}>Resumen del mapeo</p>
                    <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--platform-fg)" }}>
                      <span><strong>X:</strong> {chartXAxis ? chartAvailableColumns.find((c) => c.key === chartXAxis)?.label ?? chartXAxis : "— (KPI)"}</span>
                      <span><strong>Y:</strong> {chartYAxes.length > 0 ? chartYAxes.map((k) => chartAvailableColumns.find((c) => c.key === k)?.label ?? k).join(", ") : "—"}</span>
                      {chartSeriesField && <span><strong>Serie:</strong> {chartAvailableColumns.find((c) => c.key === chartSeriesField)?.label ?? chartSeriesField}</span>}
                    </div>
                  </div>

                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Formato</Button>
                  </div>
                </section>
              )}

              {/* Wizard D2: Formato */}
              {wizard === "D" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Formato, orden y ranking</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Solo afecta la presentación visual. No cambia filas ni valores del análisis.</p>

                  <div className="space-y-5">
                    {/* 6.3.1 Formato numérico: Tipo (Número / Moneda / %) y Escala (K, M, B) */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Formato numérico</Label>
                      <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Tipo</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {([["number", "Número"], ["currency", "Moneda"], ["percent", "Porcentaje"]] as [string, string][]).map(([val, lbl]) => (
                          <button key={val} type="button" onClick={() => setChartNumberFormat(val as any)} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartNumberFormat === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartNumberFormat === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartNumberFormat === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                        ))}
                      </div>
                      <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Escala</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {([["K", "K"], ["M", "M"], ["BI", "B"]] as [string, string][]).map(([val, lbl]) => (
                          <button key={val} type="button" onClick={() => setChartNumberFormat(val as any)} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartNumberFormat === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartNumberFormat === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartNumberFormat === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        {chartNumberFormat === "currency" && (
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
                        <div className="flex gap-2">
                          {([["none", "Sin orden"], ["asc", "Ascendente ↑"], ["desc", "Descendente ↓"]] as [string, string][]).map(([val, lbl]) => (
                            <button key={val} type="button" onClick={() => setChartSortDirection(val as any)} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartSortDirection === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartSortDirection === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartSortDirection === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                          ))}
                        </div>
                      )}
                      {chartSortBy === "axis" && (
                        <div className="flex gap-2">
                          {([["alpha", "Alfabético"], ["date_asc", "Fecha ascendente"], ["date_desc", "Fecha descendente"]] as [string, string][]).map(([val, lbl]) => (
                            <button key={val} type="button" onClick={() => setChartAxisOrder(val as any)} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartAxisOrder === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartAxisOrder === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartAxisOrder === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Personalización de Ejes: escala y graduación */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Escala del eje Y</Label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {([["auto", "Automática"], ["dataset", "Según rangos del dataset"], ["custom", "Personalizada"]] as [string, string][]).map(([val, lbl]) => (
                          <button key={val} type="button" onClick={() => setChartScaleMode(val as any)} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all border" style={{ background: chartScaleMode === val ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: chartScaleMode === val ? "var(--platform-bg)" : "var(--platform-fg-muted)", borderColor: chartScaleMode === val ? "transparent" : "var(--platform-border)" }}>{lbl}</button>
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
                      <Label className="text-sm font-medium mb-2 block mt-3" style={{ color: "var(--platform-fg)" }}>Graduación (paso del eje)</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={chartAxisStep} onChange={(e) => setChartAxisStep(e.target.value)} placeholder="Automática (vacío)" className="h-8 w-28 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                        <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Dejar vacío para automático</span>
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

                    {/* Colores: vinculado al tipo de gráfico (porciones en torta/dona, series en bar/line) */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg)" }}>Colores</Label>
                      <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Según el tipo <strong>{CHART_TYPES.find((t) => t.value === formChartType)?.label ?? formChartType}</strong>: {formChartType === "pie" || formChartType === "doughnut" ? "cada porción (categoría del Eje X)." : chartSeriesField ? "cada serie." : "cada métrica del Eje Y."}</p>
                      {(() => {
                        const defaultPaletteColors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];
                        const presetPalettes: { name: string; colors: string[] }[] = [
                          { name: "Predeterminado", colors: ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"] },
                          { name: "Corporativo", colors: ["#1e40af", "#0369a1", "#0891b2", "#059669", "#65a30d", "#ca8a04"] },
                          { name: "Pastel", colors: ["#93c5fd", "#86efac", "#fde68a", "#fca5a5", "#c4b5fd", "#f9a8d4"] },
                          { name: "Cálido", colors: ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a"] },
                          { name: "Frío", colors: ["#1d4ed8", "#2563eb", "#0284c7", "#0891b2", "#0d9488", "#059669"] },
                        ];
                        const colorLabels: string[] = formChartType === "pie" || formChartType === "doughnut"
                          ? ((previewChartConfig?.labels as string[]) ?? [])
                          : chartSeriesField && previewChartConfig?.datasets?.length
                            ? previewChartConfig.datasets.map((d: { label?: string }) => d.label ?? "")
                            : chartYAxes.length > 0
                              ? chartYAxes.map((k) => chartAvailableColumns.find((c) => c.key === k)?.label ?? k)
                              : formMetrics.map((m) => m.alias || m.field || "Métrica");
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
                    </div>

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
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Previsualización exacta de cómo se verá el gráfico en el dashboard. Guardá la métrica para usarla en dashboards.</p>
                  <div className="rounded-xl border p-4 shadow-sm min-h-[260px]" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-sm font-medium mb-3" style={{ color: "var(--platform-fg-muted)" }}>Así se verá en el dashboard</p>
                    {previewLoading ? (
                      <div className="flex flex-col items-center justify-center min-h-[240px] gap-3" style={{ color: "var(--platform-fg-muted)" }}>
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <span className="text-sm">Cargando vista previa…</span>
                      </div>
                    ) : !previewData || previewData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center min-h-[240px] gap-3 rounded-lg border border-dashed p-6" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                        <BarChart2 className="h-12 w-12 opacity-50" />
                        <p className="text-sm text-center">Tocá «Actualizar vista previa» para cargar datos y ver el gráfico.</p>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={formMetrics.length === 0} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                          Actualizar vista previa
                        </Button>
                      </div>
                    ) : (
                      <>
                        {formChartType === "kpi" && previewKpiValue != null && (
                          <div className="flex items-center justify-center min-h-[100px]">
                            <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--platform-fg)" }}>{formatNumber(previewKpiValue)}</span>
                          </div>
                        )}
                        {formChartType === "table" && (
                          <div className="overflow-auto max-h-[200px] text-sm">
                            <table className="w-full">
                              <thead><tr style={{ borderBottom: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}>{previewData[0] && Object.keys(previewData[0]).map((k) => (<th key={k} className="text-left py-2 px-3 font-medium">{k}</th>))}</tr></thead>
                              <tbody style={{ color: "var(--platform-fg)" }}>{previewData.slice(0, 5).map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid var(--platform-border)" }}>{Object.values(row).map((v, i) => (<td key={i} className="py-2 px-3">{String(v ?? "")}</td>))}</tr>
                              ))}</tbody>
                            </table>
                          </div>
                        )}
                        {previewChartConfig && formChartType !== "kpi" && formChartType !== "table" && formChartType !== "map" && (() => {
                          const yValues = previewChartConfig.datasets?.flatMap((d: { data?: number[] }) => d.data ?? []) ?? [];
                          const dataMin = yValues.length ? Math.min(...yValues) : 0;
                          const dataMax = yValues.length ? Math.max(...yValues) : 100;
                          const yMin = chartScaleMode === "custom" && chartScaleMin !== "" && !isNaN(Number(chartScaleMin)) ? Number(chartScaleMin) : chartScaleMode === "dataset" ? dataMin : undefined;
                          const yMax = chartScaleMode === "custom" && chartScaleMax !== "" && !isNaN(Number(chartScaleMax)) ? Number(chartScaleMax) : chartScaleMode === "dataset" ? dataMax : undefined;
                          const stepSize = chartAxisStep !== "" && !isNaN(Number(chartAxisStep)) ? Number(chartAxisStep) : undefined;
                          const axisScales = {
                            x: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)", maxTicksLimit: 8 } },
                            y: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)", ...(stepSize != null ? { stepSize } : {}) }, ...(yMin != null ? { min: yMin } : {}), ...(yMax != null ? { max: yMax } : {}) },
                          };
                          let legendTextColor = "rgba(255,255,255,0.9)";
                          if (typeof document !== "undefined") {
                            const v = getComputedStyle(document.documentElement).getPropertyValue("--platform-fg")?.trim() || "";
                            if (v && (v.startsWith("#") || v.startsWith("rgb"))) legendTextColor = v;
                          }
                          const dataLabelsPluginOpts = showDataLabels
                            ? {
                                display: true,
                                color: legendTextColor,
                                font: { size: 11, weight: "bold" as const },
                                formatter: (value: unknown, ctx: { chart?: { data?: { datasets?: Array<{ data?: unknown[] }> } } }) => {
                                  const n = Number(value);
                                  if (formChartType === "pie" || formChartType === "doughnut") {
                                    const data = ctx?.chart?.data?.datasets?.[0]?.data;
                                    if (Array.isArray(data)) {
                                      const total = data.reduce((a: number, b: unknown) => a + Number(b), 0);
                                      const pct = total ? (n / total) * 100 : 0;
                                      return `${pct.toFixed(1)}%`;
                                    }
                                  }
                                  return formatNumber(n);
                                },
                              }
                            : { display: false };
                          const baseOpts = {
                            responsive: true,
                            maintainAspectRatio: false,
                            layout: { padding: showDataLabels ? 8 : 0 },
                            plugins: { legend: { display: true }, datalabels: dataLabelsPluginOpts },
                          };
                          const areaData = { ...previewChartConfig, datasets: previewChartConfig.datasets.map((ds: any) => ({ ...ds, fill: true })) };
                          const scatterData = previewChartConfig.datasets.length >= 1 ? {
                            datasets: [{
                              label: previewChartConfig.datasets[0].label,
                              data: previewChartConfig.labels.map((_: string, i: number) => ({ x: previewChartConfig.datasets[0]?.data[i] ?? 0, y: previewChartConfig.datasets[1]?.data[i] ?? previewChartConfig.datasets[0]?.data[i] ?? 0 })),
                              backgroundColor: previewChartConfig.datasets[0].backgroundColor,
                              borderColor: previewChartConfig.datasets[0].borderColor,
                            }],
                          } : previewChartConfig;
                          const radarData = { labels: previewChartConfig.labels, datasets: previewChartConfig.datasets.map((ds: any) => ({ ...ds, fill: true, backgroundColor: ds.backgroundColor, borderColor: ds.borderColor })) };
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
                            <div className="h-[240px] w-full" style={{ color: "var(--platform-fg)" }}>
                              {formChartType === "bar" && <Bar data={previewChartConfig} options={{ ...baseOpts, scales: axisScales }} />}
                              {formChartType === "horizontalBar" && <Bar data={previewChartConfig} options={{ ...baseOpts, indexAxis: "y" as const, scales: { x: axisScales.x, y: { ...axisScales.y, ticks: { ...axisScales.y.ticks, maxTicksLimit: 12 } } } }} />}
                              {formChartType === "line" && <Line data={previewChartConfig} options={{ ...baseOpts, scales: axisScales }} />}
                              {formChartType === "area" && <Line data={areaData} options={{ ...baseOpts, scales: axisScales }} />}
                              {formChartType === "pie" && <Pie data={previewChartConfig} options={{ ...baseOpts, plugins: { ...baseOpts.plugins, legend: pieDoughnutLegendOpts } } as any} />}
                              {formChartType === "doughnut" && <Doughnut data={previewChartConfig} options={{ ...baseOpts, plugins: { ...baseOpts.plugins, legend: pieDoughnutLegendOpts } } as any} />}
                              {formChartType === "scatter" && <Scatter data={scatterData as { datasets: { label: string; data: { x: number; y: number }[]; backgroundColor: string; borderColor: string }[] }} options={{ ...baseOpts, scales: axisScales }} />}
                              {formChartType === "combo" && <Bar data={previewChartConfig} options={{ ...baseOpts, scales: axisScales }} />}
                              {!["bar", "horizontalBar", "line", "area", "pie", "doughnut", "scatter", "combo", "kpi", "table", "map"].includes(formChartType) && <Bar data={previewChartConfig} options={{ ...baseOpts, scales: axisScales }} />}
                            </div>
                          );
                        })()}
                        {formChartType === "map" && (
                          <div className="flex flex-col items-center justify-center min-h-[200px] rounded-lg border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                            <MapPin className="h-10 w-10 mb-3" style={{ color: "var(--platform-accent)" }} />
                            <p className="text-sm font-medium mb-1" style={{ color: "var(--platform-fg)" }}>Visualización de mapa</p>
                            <p className="text-xs text-center max-w-sm" style={{ color: "var(--platform-fg-muted)" }}>El mapa se renderizará en el dashboard con los datos geográficos de las dimensiones seleccionadas (país, provincia, ciudad, coordenadas).</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>← Anterior</Button>
                    <Button type="button" className="rounded-xl px-6 font-semibold" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetric} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingId ? "Guardar cambios" : "Crear métrica"}
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
                      onClick={() => deleteMetric(s.id)}
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
                  onClick={() => deleteDerivedColumn(d.name)}
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
          Aún no hay métricas en «Calculadas» ni columnas calculadas. Creá una métrica con "Nueva métrica" (se guardará en Calculadas) o, en el paso Cálculo, creá una columna en el dataset.
        </p>
      )}

      {/* Dashboard & Filtros Dinámicos */}
      {savedMetrics.length > 0 && !showForm && (
        <section className="mt-6">
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--platform-fg)" }}>Dashboard</h2>
                <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Las métricas creadas se insertan automáticamente como widgets en el dashboard vinculado.</p>
              </div>
              {linkedDashboardId && (
                <Link href={`/admin/dashboard/${linkedDashboardId}`} className="text-xs font-medium underline" style={{ color: "var(--platform-accent)" }}>
                  Abrir dashboard →
                </Link>
              )}
            </div>

            <div className="rounded-lg border p-3 mb-4 flex flex-wrap items-center gap-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
              <div className="flex items-center gap-2 min-w-[200px]">
                <Label className="text-xs shrink-0" style={{ color: "var(--platform-fg-muted)" }}>Dashboard de destino</Label>
                <select
                  value={linkedDashboardId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setLinkedDashboardId(null);
                      setLinkedDashboardName("Dashboard principal");
                    } else {
                      const d = availableDashboards.find((x) => x.id === v);
                      setLinkedDashboardId(v);
                      setLinkedDashboardName(d?.title ?? linkedDashboardName);
                    }
                  }}
                  className="h-8 rounded-lg border px-2 text-sm min-w-[180px]"
                  style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}
                  disabled={dashboardListLoading}
                >
                  <option value="">Crear nuevo...</option>
                  {availableDashboards.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
                {dashboardListLoading && <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: "var(--platform-accent)" }} />}
              </div>
              {!linkedDashboardId && (
                <div className="flex items-center gap-2 min-w-[180px]">
                  <Label className="text-xs shrink-0" style={{ color: "var(--platform-fg-muted)" }}>Nombre del nuevo</Label>
                  <Input value={linkedDashboardName} onChange={(e) => setLinkedDashboardName(e.target.value)} placeholder="Dashboard principal" className="h-8 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{savedMetrics.length} métrica{savedMetrics.length !== 1 ? "s" : ""} como widgets</span>
                {dashboardSyncing && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--platform-accent)" }} />}
              </div>
              <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs" style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }} onClick={() => syncMetricsToDashboard(savedMetrics)} disabled={dashboardSyncing}>
                {linkedDashboardId ? "Sincronizar" : "Crear dashboard"}
              </Button>
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
                        <select value={f.filterType} onChange={(e) => setDashboardFilters((prev) => prev.map((x) => x.id === f.id ? { ...x, filterType: e.target.value as any } : x))} className="w-full h-8 rounded-lg border px-2 text-xs" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
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
                  <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs" style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }} onClick={() => syncMetricsToDashboard(savedMetrics)} disabled={dashboardSyncing}>
                    {dashboardSyncing && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Guardar filtros en dashboard
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

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
