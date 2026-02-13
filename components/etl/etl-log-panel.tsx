"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useETLPreview, LogEntry } from "@/components/etl/ETLPreviewContext";

/* No local interface for LogEntry, use context one */

export default function ETLLogPanel() {
  const { logs, activeTab, setActiveTab, previewData, isLoading, page, setPage, onLoadPage } = useETLPreview();
  const [isMaximizeDataOpen, setIsMaximizeDataOpen] = useState(false);

  const getLevelStyles = (level: LogEntry["level"]) => {
    switch (level) {
      case "Info":
        return "text-[var(--platform-accent)] border-[var(--platform-accent-dim)]";
      case "Success":
        return "text-[var(--platform-success)] border-[var(--platform-success-dim)]";
      case "Error":
        return "text-[var(--platform-danger)] border-red-500/20";
      case "Warning":
        return "text-[var(--platform-warning)] border-amber-500/20";
      default:
        return "text-[var(--platform-accent)] border-[var(--platform-accent-dim)]";
    }
  };

  const renderDataTable = (isExpanded = false) => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--platform-fg-muted)" }}>
          Cargando datos…
        </div>
      );
    }
    if (!previewData || !previewData.rows || previewData.rows.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
           <div className="font-medium text-sm" style={{ color: "var(--platform-fg-muted)" }}>
             Vista de datos no disponible
           </div>
        </div>
      );
    }
    const headers = Object.keys(previewData.rows[0]);
    return (
      <div className="w-full h-full overflow-auto">
        <table className="min-w-full text-sm text-left" style={{ color: "var(--platform-fg-muted)" }}>
          <thead className="text-xs uppercase sticky top-0" style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg)" }}>
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-2 border-b" style={{ borderColor: "var(--platform-border)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.rows.map((row, idx) => (
              <tr key={idx} className="border-b hover:opacity-90" style={{ borderColor: "var(--platform-border)", background: idx % 2 === 0 ? "transparent" : "var(--platform-surface)" }}>
                {headers.map((h) => (
                  <td key={h} className="px-4 py-2 max-w-xs truncate" style={{ color: "var(--platform-fg)" }}>
                    {typeof row[h] === "object"
                      ? JSON.stringify(row[h])
                      : String(row[h])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  
  const renderPaginationFooter = () => {
    if (!previewData) return null;
    return (
        <div className="w-full flex items-center justify-between text-xs px-1 mt-2 border-t pt-2" style={{ color: "var(--platform-fg-muted)", borderColor: "var(--platform-border)" }}>
           <div>
             {typeof previewData.total === 'number' 
               ? `Total: ${previewData.total} registros` 
               : typeof previewData.total === 'undefined' && previewData.rows.length > 0 
                  ? `${previewData.rows.length} registros (actual)`
                  : ''}
           </div>
           {onLoadPage && (
             <div className="flex items-center gap-2">
               <button 
                 disabled={page <= 1 || isLoading}
                 onClick={() => {
                   const prev = Math.max(1, page - 1);
                   setPage(prev);
                   onLoadPage(prev);
                 }}
                 className="disabled:opacity-50 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
                 style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg)" }}
               >
                 Anterior
               </button>
               <span className="font-medium" style={{ color: "var(--platform-fg)" }}>Pág {page}</span>
               <button 
                disabled={isLoading || (typeof previewData.total === 'number' && page * (previewData.pageSize || 20) >= previewData.total)}
                 onClick={() => {
                   const next = page + 1;
                   setPage(next);
                   onLoadPage(next);
                 }}
                 className="disabled:opacity-50 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
                 style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg)" }}
               >
                 Siguiente
               </button>
             </div>
           )}
        </div>
    );
  };

  return (
    <>
    <div
      className="flex flex-col p-4 gap-4 w-full h-full rounded-xl border"
      style={{ background: "var(--platform-bg-elevated)", borderColor: "var(--platform-border)" }}
    >
      {/* Header: tabs + actions */}
      <div className="flex flex-row justify-between items-center w-full shrink-0">
        <div className="flex items-center p-1 gap-1 rounded-xl" style={{ background: "var(--platform-surface)" }}>
          <button
            onClick={() => setActiveTab("Log")}
            className="flex justify-center items-center px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            style={
              activeTab === "Log"
                ? { background: "var(--platform-accent)", color: "var(--platform-bg)" }
                : { color: "var(--platform-fg-muted)" }
            }
          >
            Log
          </button>
          <button
            onClick={() => setActiveTab("Data")}
            className="flex justify-center items-center px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            style={
              activeTab === "Data"
                ? { background: "var(--platform-accent)", color: "var(--platform-bg)" }
                : { color: "var(--platform-fg-muted)" }
            }
          >
            Datos
          </button>
        </div>

        <div className="flex justify-end items-center gap-2">
          {activeTab === "Data" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMaximizeDataOpen(true)}
              className="h-8 w-8 rounded-lg"
              style={{ color: "var(--platform-fg-muted)" }}
              title="Expandir vista de datos"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" style={{ color: "var(--platform-fg-muted)" }}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" style={{ color: "var(--platform-fg-muted)" }}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {activeTab === "Log" ? (
          <div className="w-full h-full overflow-auto space-y-0">
            {logs.length === 0 ? (
               <div className="text-center mt-8 text-sm" style={{ color: "var(--platform-fg-muted)" }}>Sin registros</div>
            ) : (
             logs.map((log, index) => (
              <div key={index} className="flex items-center min-h-[36px] w-full gap-4 py-1">
                <div className="w-24 shrink-0 text-xs text-center font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                  {log.timestamp}
                </div>
                <div className="shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${getLevelStyles(log.level)}`}>
                    {log.level}
                  </span>
                </div>
                <div className="flex-1 text-sm truncate" style={{ color: "var(--platform-fg)" }}>
                  {log.message}
                </div>
              </div>
            ))
           )}
          </div>
        ) : (
          renderDataTable()
        )}
      </div>

      {activeTab === "Data" && renderPaginationFooter()}
    </div>
    
    <Dialog open={isMaximizeDataOpen} onOpenChange={setIsMaximizeDataOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[1200px] w-full h-[80vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Vista Ampliada de Datos</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 border rounded-md p-2 overflow-hidden">
             {renderDataTable(true)}
          </div>
          <div className="mt-2">
             {renderPaginationFooter()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
