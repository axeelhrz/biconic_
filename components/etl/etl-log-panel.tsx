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
        return "text-[#1447E6] border-[#C4DDFF]";
      case "Success":
        return "text-[#008236] border-[#B9F8CF]";
      case "Error":
        return "text-[#EF293B] border-[#FFB9C4]";
      case "Warning":
        return "text-[#F7B631] border-[#FEF1D7]";
      default:
        return "text-[#1447E6] border-[#C4DDFF]";
    }
  };

  const renderDataTable = (isExpanded = false) => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          Cargando datos...
        </div>
      );
    }
    if (!previewData || !previewData.rows || previewData.rows.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
           <div className="text-[#98A1AE] font-medium text-base">
             Vista de datos no disponible
           </div>
        </div>
      );
    }
    const headers = Object.keys(previewData.rows[0]);
    return (
      <div className="w-full h-full overflow-auto">
        <table className="min-w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-2 border-b">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.rows.map((row, idx) => (
              <tr key={idx} className="bg-white border-b hover:bg-gray-50">
                {headers.map((h) => (
                  <td key={h} className="px-4 py-2 max-w-xs truncate">
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
        <div className="w-full flex items-center justify-between text-xs text-gray-600 px-1 mt-2 border-t pt-2">
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
                 className="disabled:opacity-50 hover:bg-gray-100 rounded px-2 py-1"
               >
                 Anterior
               </button>
               <span className="font-medium">Pág {page}</span>
               <button 
                disabled={isLoading || (typeof previewData.total === 'number' && page * (previewData.pageSize || 20) >= previewData.total)}
                 onClick={() => {
                   const next = page + 1;
                   setPage(next);
                   onLoadPage(next);
                 }}
                 className="disabled:opacity-50 hover:bg-gray-100 rounded px-2 py-1"
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
    <div className="flex flex-col items-start p-5 gap-[25px] w-[775px] h-[265px] bg-white border border-[#ECECEC] rounded-[25px]">
      {/* Header */}
      <div className="flex flex-row justify-between items-center w-full h-10">
        {/* Tab switcher */}
        <div className="flex items-center p-[5px] gap-1 w-[162px] h-10 bg-[#B1E9F1] rounded-[25px] mx-auto">
          <button
            onClick={() => setActiveTab("Log")}
            className={`flex justify-center items-center px-3 py-2 h-[27px] rounded-[25px] font-medium text-sm ${
              activeTab === "Log"
                ? "bg-white text-black w-[68px]"
                : "text-black w-auto"
            }`}
          >
            Log
          </button>
          <button
            onClick={() => setActiveTab("Data")}
            className={`flex justify-center items-center px-3 py-2 h-[27px] rounded-[25px] font-medium text-sm ${
              activeTab === "Data"
                ? "bg-white text-black w-[68px]"
                : "text-black w-auto"
            }`}
          >
            Data
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end items-center gap-[10px]">
          {activeTab === "Data" && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsMaximizeDataOpen(true)}
              className="w-8 h-8 rounded-full border-gray-300 hover:bg-gray-100 hover:text-black"
              title="Expandir vista de datos"
            >
              <Maximize2 className="w-4 h-4 text-gray-600" />
            </Button>
          )}
          <Button
             variant="outline"
             size="icon"
             className="w-8 h-8 rounded-full border-gray-300 hover:bg-gray-100 hover:text-black"
          >
            <Download className="w-4 h-4 text-gray-600" />
          </Button>
          <Button
             variant="outline"
             size="icon"
             className="w-8 h-8 rounded-full border-gray-300 hover:bg-gray-100 hover:text-black"
          >
            <X className="w-4 h-4 text-gray-600" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="w-full h-[152px] relative overflow-hidden">
        {activeTab === "Log" ? (
          <div className="w-full h-full overflow-auto space-y-0">
            {logs.length === 0 ? (
               <div className="text-gray-400 text-center mt-10">Sin registros</div>
            ) : (
             logs.map((log, index) => (
              <div key={index} className="flex items-center h-[38px] w-full">
                {/* Timestamp */}
                <div className="w-[131.82px] text-[#98A1AE] font-medium text-base text-center shrink-0">
                  {log.timestamp}
                </div>
                
                {/* Level badge */}
                <div className="w-[131.82px] flex justify-center shrink-0">
                  <div className={`flex justify-center items-center px-3 py-1 h-[29px] border rounded-[25px] ${getLevelStyles(log.level)}`}>
                    <span className="font-medium text-[15px]">{log.level}</span>
                  </div>
                </div>
                
                {/* Message */}
                <div className="flex-1 text-[#364153] font-medium text-base ml-4 truncate">
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
      
      {/* Footer Pagination (Data Only) */}
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
