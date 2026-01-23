"use client";

import { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from "react";

export type PreviewData = {
  rows: any[];
  total?: number;
  pageSize?: number;
  columns?: string[]; // optionally helper for displaying specific cols
  sourceNodeId?: string; // which node generated this
};

export type LogEntry = {
  timestamp: string;
  level: "Info" | "Success" | "Error" | "Warning";
  message: string;
};

interface ETLPreviewContextType {
  previewData: PreviewData | null;
  setPreviewData: (data: PreviewData | null) => void;
  logs: LogEntry[];
  addLog: (level: LogEntry["level"], message: string) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  activeTab: "Log" | "Data";
  setActiveTab: (t: "Log" | "Data") => void;
  page: number;
  setPage: (p: number) => void;
  onLoadPage: ((p: number) => Promise<void>) | null;
  setOnLoadPage: Dispatch<SetStateAction<((p: number) => Promise<void>) | null>>;
}

const ETLPreviewContext = createContext<ETLPreviewContextType | undefined>(undefined);

export function ETLPreviewProvider({ children }: { children: ReactNode }) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"Log" | "Data">("Log");
  const [page, setPage] = useState(1);
  const [onLoadPage, setOnLoadPage] = useState<((p: number) => Promise<void>) | null>(null);

  const addLog = (level: LogEntry["level"], message: string) => {
    const timestamp = new Date().toLocaleTimeString("es-ES", { hour12: false });
    setLogs((prev) => [...prev, { timestamp, level, message }]);
  };

  return (
    <ETLPreviewContext.Provider
      value={{
        previewData,
        setPreviewData,
        logs,
        addLog,
        isLoading,
        setIsLoading,
        activeTab,
        setActiveTab,
        page,
        setPage,
        onLoadPage,
        setOnLoadPage
      }}
    >
      {children}
    </ETLPreviewContext.Provider>
  );
}

export function useETLPreview() {
  const context = useContext(ETLPreviewContext);
  if (!context) {
    throw new Error("useETLPreview must be used within an ETLPreviewProvider");
  }
  return context;
}
