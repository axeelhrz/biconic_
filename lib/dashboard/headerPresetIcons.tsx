"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart2,
  Building2,
  CalendarDays,
  DollarSign,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  LineChart,
  Map,
  Percent,
  PieChart,
  ShoppingCart,
  Table2,
  Target,
  TrendingUp,
  Truck,
  Type,
  Users,
} from "lucide-react";

/** Iconos sugeridos para tarjetas del dashboard (clave estable en el layout JSON). */
export const HEADER_PRESET_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "BarChart2", label: "Barras", Icon: BarChart2 },
  { key: "LineChart", label: "Líneas", Icon: LineChart },
  { key: "PieChart", label: "Circular", Icon: PieChart },
  { key: "Table2", label: "Tabla", Icon: Table2 },
  { key: "LayoutDashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "TrendingUp", label: "Tendencia", Icon: TrendingUp },
  { key: "Activity", label: "Actividad", Icon: Activity },
  { key: "Gauge", label: "Indicador", Icon: Gauge },
  { key: "Percent", label: "Porcentaje", Icon: Percent },
  { key: "DollarSign", label: "Moneda", Icon: DollarSign },
  { key: "Users", label: "Personas", Icon: Users },
  { key: "Building2", label: "Empresa", Icon: Building2 },
  { key: "ShoppingCart", label: "Ventas", Icon: ShoppingCart },
  { key: "Truck", label: "Logística", Icon: Truck },
  { key: "CalendarDays", label: "Calendario", Icon: CalendarDays },
  { key: "Map", label: "Mapa", Icon: Map },
  { key: "Target", label: "Meta", Icon: Target },
  { key: "Type", label: "Texto", Icon: Type },
  { key: "ImageIcon", label: "Imagen", Icon: ImageIcon },
];

const PRESET_MAP = Object.fromEntries(HEADER_PRESET_ICONS.map((e) => [e.key, e.Icon])) as Record<string, LucideIcon>;

export function DashboardPresetHeaderIcon({
  iconKey,
  className,
}: {
  iconKey?: string | null;
  className?: string;
}) {
  if (!iconKey) return null;
  const Icon = PRESET_MAP[iconKey];
  if (!Icon) return null;
  return <Icon className={className ?? "h-5 w-5 shrink-0"} aria-hidden />;
}
