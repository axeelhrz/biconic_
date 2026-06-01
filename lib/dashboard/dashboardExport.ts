import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";

export type DashboardExportWidget = {
  title: string;
  rows?: Record<string, unknown>[];
};

export type ExportReportMeta = {
  dashboardTitle: string;
  pageName?: string;
  exportedAt: Date;
  filterSummary?: string;
};

export type ExportWidgetTarget = {
  id: string;
  title: string;
  element: HTMLElement;
};

const EXPORT_PREPARE_DELAY_MS = 350;
const CAPTURE_SCALE = () => Math.min(3, (window.devicePixelRatio || 1) * 2);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]\\*?:/]/g, "_").trim() || "Hoja";
  return cleaned.slice(0, 31);
}

function resolveBackgroundColor(element: HTMLElement): string | null {
  let node: HTMLElement | null = element;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
    node = node.parentElement;
  }
  return null;
}

/** Espera fuentes y un breve delay para mapas/tiles antes de capturar. */
export async function prepareForExport(): Promise<void> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }
  await delay(EXPORT_PREPARE_DELAY_MS);
}

/** Captura un elemento del DOM como data URL PNG. */
export async function captureElementAsPng(element: HTMLElement): Promise<string | null> {
  try {
    const bg = resolveBackgroundColor(element);
    const canvas = await html2canvas(element, {
      scale: CAPTURE_SCALE(),
      useCORS: true,
      backgroundColor: bg ?? undefined,
      logging: false,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function captureWidgetTargets(
  targets: ExportWidgetTarget[]
): Promise<{ target: ExportWidgetTarget; png: string }[]> {
  const out: { target: ExportWidgetTarget; png: string }[] = [];
  for (const target of targets) {
    const png = await captureElementAsPng(target.element);
    if (png) out.push({ target, png });
  }
  return out;
}

function addPdfCoverPage(pdf: jsPDF, meta: ExportReportMeta): void {
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 48;
  let y = 72;
  pdf.setFontSize(22);
  pdf.text(meta.dashboardTitle, margin, y);
  y += 36;
  pdf.setFontSize(12);
  pdf.text(`Exportado: ${meta.exportedAt.toLocaleString()}`, margin, y);
  y += 22;
  if (meta.pageName) {
    pdf.text(`Página: ${meta.pageName}`, margin, y);
    y += 22;
  }
  if (meta.filterSummary?.trim()) {
    pdf.text("Filtros aplicados:", margin, y);
    y += 18;
    const lines = pdf.splitTextToSize(meta.filterSummary, pageW - margin * 2);
    pdf.setFontSize(10);
    for (const line of lines) {
      if (y > pdf.internal.pageSize.getHeight() - margin) break;
      pdf.text(line, margin, y);
      y += 14;
    }
  }
}

function fitImageInRect(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number
): { w: number; h: number; x: number; y: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { w, h, x: (boxW - w) / 2, y: (boxH - h) / 2 };
}

/** PDF: portada + una página horizontal A4 por widget (captura fiel). */
export async function exportDashboardPdfPerWidget(
  targets: ExportWidgetTarget[],
  meta: ExportReportMeta,
  fileBase: string
): Promise<void> {
  const captures = await captureWidgetTargets(targets);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  addPdfCoverPage(pdf, meta);

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const titleH = 28;
  const contentTop = margin + titleH;
  const boxW = pageW - margin * 2;
  const boxH = pageH - contentTop - margin;

  for (const { target, png } of captures) {
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.text(target.title, margin, margin + 16);

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = png;
    });

    const { w, h, x, y } = fitImageInRect(img.width, img.height, boxW, boxH);
    pdf.addImage(png, "PNG", margin + x, contentTop + y, w, h);
  }

  const name = fileBase.endsWith(".pdf") ? fileBase : `${fileBase}.pdf`;
  pdf.save(name);
}

function addPptCoverSlide(slide: PptxGenJS.Slide, meta: ExportReportMeta): void {
  slide.addText(meta.dashboardTitle, { fontSize: 24, bold: true, x: 0.5, y: 0.5, w: 9, h: 0.7 });
  slide.addText(`Exportado: ${meta.exportedAt.toLocaleString()}`, { fontSize: 12, x: 0.5, y: 1.35, w: 9, h: 0.35 });
  let y = 1.85;
  if (meta.pageName) {
    slide.addText(`Página: ${meta.pageName}`, { fontSize: 12, x: 0.5, y, w: 9, h: 0.35 });
    y += 0.45;
  }
  if (meta.filterSummary?.trim()) {
    slide.addText("Filtros aplicados:", { fontSize: 11, bold: true, x: 0.5, y, w: 9, h: 0.3 });
    y += 0.4;
    slide.addText(meta.filterSummary, { fontSize: 10, x: 0.5, y, w: 9, h: 3.5, valign: "top" });
  }
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

/** PPT: portada + una diapositiva por widget con imagen del gráfico. */
export async function exportDashboardPptPerWidget(
  targets: ExportWidgetTarget[],
  meta: ExportReportMeta,
  fileBase: string
): Promise<void> {
  const captures = await captureWidgetTargets(targets);
  const pptx = new PptxGenJS();
  const cover = pptx.addSlide();
  addPptCoverSlide(cover, meta);

  const imgBox = { x: 0.5, y: 1.05, w: 9, h: 4.85 };

  for (const { target, png } of captures) {
    const slide = pptx.addSlide();
    slide.addText(target.title, { fontSize: 18, bold: true, x: 0.5, y: 0.35, w: 9, h: 0.55 });
    try {
      const { width, height } = await loadImageDimensions(png);
      const aspect = width / height;
      let w = imgBox.w;
      let h = w / aspect;
      if (h > imgBox.h) {
        h = imgBox.h;
        w = h * aspect;
      }
      const x = imgBox.x + (imgBox.w - w) / 2;
      const y = imgBox.y + (imgBox.h - h) / 2;
      slide.addImage({ data: png, x, y, w, h });
    } catch {
      slide.addText("(No se pudo capturar la visualización)", {
        fontSize: 11,
        x: imgBox.x,
        y: imgBox.y + 2,
        w: imgBox.w,
        h: 0.4,
        color: "666666",
      });
    }
  }

  const name = fileBase.endsWith(".pptx") ? fileBase : `${fileBase}.pptx`;
  await pptx.writeFile({ fileName: name });
}

/** Exporta filas de cada widget con datos a un libro Excel (una hoja por tarjeta). */
export async function exportDashboardExcel(fileBase: string, widgets: DashboardExportWidget[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const withData = widgets.filter((w) => Array.isArray(w.rows) && w.rows.length > 0);
  if (withData.length === 0) return;
  for (const w of withData) {
    const rows = w.rows!;
    const keys = Object.keys(rows[0] ?? {});
    if (keys.length === 0) continue;
    const sheet = wb.addWorksheet(sanitizeSheetName(w.title));
    sheet.addRow(keys);
    for (const row of rows) {
      sheet.addRow(keys.map((k) => row[k]));
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  const name = fileBase.endsWith(".xlsx") ? fileBase : `${fileBase}.xlsx`;
  saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
}

/** @deprecated Usar exportDashboardPdfPerWidget */
export async function exportDashboardPdfFromElement(element: HTMLElement, fileBase: string): Promise<void> {
  const canvas = await html2canvas(element, { scale: Math.min(2, (window.devicePixelRatio || 1) * 1.5), useCORS: true });
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const scale = Math.min(pageW / canvas.width, pageH / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(img, "PNG", x, y, w, h);
  const name = fileBase.endsWith(".pdf") ? fileBase : `${fileBase}.pdf`;
  pdf.save(name);
}

/** @deprecated Usar exportDashboardPptPerWidget */
export async function exportDashboardSummaryPpt(fileBase: string, widgets: DashboardExportWidget[]): Promise<void> {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();
  slide.addText("Exportación del dashboard", { fontSize: 22, bold: true, x: 0.5, y: 0.4, w: 9, h: 0.6 });
  let y = 1.1;
  for (const w of widgets) {
    const n = Array.isArray(w.rows) ? w.rows.length : 0;
    slide.addText(`${w.title}: ${n} fila${n === 1 ? "" : "s"}`, { fontSize: 14, x: 0.6, y, w: 8.8, h: 0.35 });
    y += 0.38;
    if (y > 5.2) break;
  }
  const name = fileBase.endsWith(".pptx") ? fileBase : `${fileBase}.pptx`;
  await pptx.writeFile({ fileName: name });
}

export function collectExportWidgetTargets(
  widgets: { id: string; title: string }[],
  root: HTMLElement
): ExportWidgetTarget[] {
  return widgets
    .map((w) => {
      const el = root.querySelector(`[data-export-widget="${CSS.escape(w.id)}"]`);
      return el instanceof HTMLElement ? { id: w.id, title: w.title, element: el } : null;
    })
    .filter((t): t is ExportWidgetTarget => t !== null);
}

export function formatFilterValueForExport(value: unknown): string {
  if (value === "" || value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function buildFilterSummaryFromGlobals(
  globalFilters: { id: string; field: string; label?: string }[],
  filterValues: Record<string, unknown>
): string | undefined {
  const parts: string[] = [];
  for (const gf of globalFilters) {
    const raw =
      filterValues[gf.id] !== undefined
        ? filterValues[gf.id]
        : (gf as { value?: unknown }).value;
    const text = formatFilterValueForExport(raw);
    if (!text) continue;
    const label = (gf as { label?: string }).label || gf.field;
    parts.push(`${label}: ${text}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
