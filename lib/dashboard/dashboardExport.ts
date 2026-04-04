import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";

export type DashboardExportWidget = {
  title: string;
  rows?: Record<string, unknown>[];
};

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]\\*?:/]/g, "_").trim() || "Hoja";
  return cleaned.slice(0, 31);
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

/** Captura un nodo del DOM como PDF horizontal A4. */
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

/** Resumen en PowerPoint: título y lista de widgets con cantidad de filas. */
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
