"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { History, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getDashboardHistory, restoreVersion, saveDashboardVersion } from "@/app/admin/(main)/dashboard/actions";

export function SaveVersionButton({ dashboardId, onSaved }: { dashboardId: string, onSaved?: () => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await saveDashboardVersion(dashboardId, name);
            if (!res.ok) throw new Error(res.error);
            toast.success("Versión guardada correctamente");
            setOpen(false);
            setName("");
            onSaved?.();
        } catch (e: any) {
            toast.error(e.message || "Error al guardar versión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Save className="w-4 h-4" />
                    <span className="hidden sm:inline">Guardar Versión</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Guardar Versión</DialogTitle>
                    <DialogDescription>
                        Crea un punto de restauración con el diseño actual.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="version-name">Nombre de la versión (Opcional)</Label>
                        <Input 
                            id="version-name"
                            placeholder="Ej: Versión estable v1" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? "Guardando..." : "Guardar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function HistoryDialog({ dashboardId, onRestore }: { dashboardId: string, onRestore?: () => void }) {
    const [open, setOpen] = useState(false);
    const [versions, setVersions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await getDashboardHistory(dashboardId);
            if (res.ok) {
                setVersions(res.versions || []);
            } else {
                toast.error(res.error);
            }
        } catch (e) {
            console.error(e);
            toast.error("Error al cargar historial");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) load();
    }, [open]);

    const handleRestore = async (versionId: string) => {
        if (!confirm("¿Estás seguro de restaurar esta versión? Se perderán los cambios no guardados en la versión actual.")) return;
        
        try {
            const res = await restoreVersion(versionId);
            if (!res.ok) throw new Error(res.error);
            toast.success("Versión restaurada");
            setOpen(false);
            onRestore?.();
        } catch (e: any) {
            toast.error(e.message || "Error al restaurar");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <History className="w-4 h-4" />
                    <span className="hidden sm:inline">Historial</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Historial de Versiones</DialogTitle>
                    <DialogDescription>
                        Selecciona una versión para restaurar el diseño anterior.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto py-2 pr-2">
                    {loading && <div className="text-center py-4 text-sm text-gray-500">Cargando historial...</div>}
                    {!loading && versions.length === 0 && (
                        <div className="text-center py-8 text-sm text-gray-500 border-2 border-dashed rounded-lg">
                            No hay versiones guardadas.
                        </div>
                    )}
                    <div className="space-y-3">
                        {versions.map((v) => (
                            <div key={v.id} className="border rounded-lg p-3 flex items-center justify-between bg-card text-card-foreground shadow-sm hover:shadow transition-shadow">
                                <div className="space-y-1">
                                    <div className="font-semibold text-sm">{v.version_name || "Sin nombre"}</div>
                                    <div className="text-xs text-muted-foreground flex flex-col sm:flex-row gap-1 sm:gap-3">
                                        <span>{new Date(v.created_at).toLocaleString()}</span>
                                        {v.created_by && <span className="hidden sm:inline">• {v.created_by}</span>}
                                    </div>
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => handleRestore(v.id)}>
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    Restaurar
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
