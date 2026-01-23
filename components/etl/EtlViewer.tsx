"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EtlViewerProps {
  etlId: string;
}

export default function EtlViewer({ etlId }: EtlViewerProps) {
  const [loading, setLoading] = useState(true);
  const [etl, setEtl] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [tableName, setTableName] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const supabase = createClient();

        // 1. Fetch ETL details
        const { data: etlData, error: etlError } = await supabase
          .from("etl")
          .select("title, name")
          .eq("id", etlId)
          .single();

        if (etlError) throw etlError;
        setEtl(etlData);

        // 2. Fetch latest successful run
        const { data: run, error: runError } = await supabase
          .from("etl_runs_log")
          .select("destination_schema, destination_table_name, completed_at")
          .eq("etl_id", etlId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (runError) {
            console.error(runError);
        }

        if (run && run.destination_table_name) {
          const fullTableName = `${run.destination_schema || "etl_output"}.${
            run.destination_table_name
          }`;
          setTableName(fullTableName);

          // 3. Fetch data from the output table via API (to avoid direct SQL injection risks if we were constructing generic queries client side, 
          // although we could use rpc or just fetch from the table if RLS allows. 
          // Dashboard uses /api/dashboard/aggregate. We can reuse that or make a simple fetch.)
          // Let's use the same Aggregate API for consistency and safety, or a new simple one.
          // Since we just want raw table data:
          
          const res = await fetch("/api/dashboard/aggregate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableName: fullTableName,
              metrics: [], // No metrics means fetch all columns usually? Wait, api logic might differ.
              // Let's check api/dashboard/aggregate or build a simpler fetcher. 
              // Actually, simpler: just select * from the table using supabase client? 
              // Only works if the public user has access to that table. 
              // Usually ETL output tables might not have unrestricted RLS.
              // Let's use the API route to be safe with existing patterns.
              // Reviewing dashboard viewer logic: it uses /api/dashboard/aggregate with dimensions/metrics.
              // For raw data, we might need to know columns.
              
              // Let's try to fetch columns first or just LIMIT 100 *
              // If we use supabase client on dynamic table name, we can't easily do .from(string).
              // Actually we can: .from(fullTableName) works in JS/TS client? No, schema is separate.
              // .schema(schema).from(table) works.
            }),
          });
          
          // Let's try direct supabase client access if RLS permits (viewer should interpret output tables)
          // If the user has VIEW permission on ETL, maybe they don't have DB permission on the table explicitly?
          // We might need a server action or API.
          
          // To be safe/quick, let's use a server action or just re-use the working fetch pattern from DashboardViewer.
          // DashboardViewer uses /api/dashboard/aggregate. 
          
          // Let's try fetching distinct values for columns? No.
          
          // Let's implement a quick API call to get raw data.
          // Or reuse the existing endpoint:
          // If we send metrics: [], dimensions: undefined... 
          // Looking at DashboardViewer again... it loads raw data if metrics empty? 
          // "Loading raw data (not implemented fully here)" comment was there.
          
          // Better approach: Use a new specific simple API or Server Action for this Viewer.
          // Let's create a server action inside this component file? No, client component.
          // Let's fetch from a simple API /api/etl/preview that we will create? 
          // Or just use the generic /api/dashboard/aggregate with a "SELECT *" intent.
          
          // Let's try to query via server action.
        } 
      } catch (e: any) {
        console.error(e);
        toast.error("Error cargando datos del ETL");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [etlId]);
  
  // Wait, I cannot define server action inside a client component easily without separate file.
  // I will just use the fetch logic inside useEffect but call a new server action that I will put in app/(main)/etl/actions.ts
  // NO wait, I can just use the existing `getEtlPreviewData` if it exists? 
  // Probably doesn't.
  
  return (
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between">
           <div>
             <h1 className="text-2xl font-bold tracking-tight">{etl?.title || etl?.name || "ETL Viewer"}</h1>
             <p className="text-muted-foreground text-sm">
                {tableName ? `Tabla de salida: ${tableName}` : "Sin datos generados aún"}
             </p>
           </div>
           
           <div className="flex gap-2">
               <Link href="/etl">
                   <Button variant="outline">Volver</Button>
               </Link>
           </div>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Vista Previa de Datos</CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="animate-spin h-8 w-8 text-emerald-600" />
                    </div>
                ) : !tableName ? (
                    <div className="text-center p-8 text-muted-foreground">
                        Este ETL no se ha ejecutado exitosamente o no ha generado una tabla de salida.
                    </div>
                ) : (
                   <DataTableWrapper tableName={tableName} />
                )}
            </CardContent>
        </Card>
      </div>
  )
}

function DataTableWrapper({ tableName }: { tableName: string }) {
    const [rows, setRows] = useState<any[]>([]);
    const [cols, setCols] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRaw = async () => {
             // We need a way to fetch data. 
             // Let's use a server action.
             // Since I can't write it here, i will assume it exists: `getEtlTableDataAction`
             // and then I will implement it in actions.ts
             // For now, I'll mock the call or use a direct fetch if I implement the API.
             // Let's use a POST to /api/etl/preview (I will create this route or action)
             
             try {
                 const res = await fetch("/api/etl/preview-data", {
                     method: 'POST',
                     body: JSON.stringify({ tableName }),
                 })
                 if(!res.ok) throw new Error("Error fetching");
                 const data = await res.json();
                 setRows(data.rows);
                 setCols(data.columns);
             } catch(e) {
                 console.error(e);
             } finally {
                 setLoading(false);
             }
        }
        fetchRaw();
    }, [tableName]);

    if(loading) return <div className="p-4 text-center">Cargando datos...</div>
    if(rows.length === 0) return <div className="p-4 text-center text-muted-foreground">La tabla está vacía</div>

    return (
        <div className="rounded-md border overflow-auto max-h-[600px]">
            <Table>
                <TableHeader>
                    <TableRow>
                        {cols.map(c => <TableHead key={c}>{c}</TableHead>)}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row, i) => (
                        <TableRow key={i}>
                            {cols.map(c => (
                                <TableCell key={`${i}-${c}`} className="whitespace-nowrap">
                                    {String(row[c] ?? "")}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <div className="p-2 text-xs text-muted-foreground text-center border-t">
                Mostrando primeros {rows.length} registros
            </div>
        </div>
    )
}
