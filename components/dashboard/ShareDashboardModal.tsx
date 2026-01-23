"use client";

import React, { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Search, Check, Trash2, ShieldCheck, Shield, ChevronsUpDown, Copy, RefreshCw } from "lucide-react";
import Image from "next/image";
import {
  getDashboardPermissionsAction,
  getDashboardCandidatesAction,
  addDashboardPermissionAction,
  removeDashboardPermissionAction,
  DashboardPermissionItem,
} from "@/app/(main)/dashboard/actions";
import { 
    grantPermissionToEmail, 
    searchUsers 
} from "@/app/admin/(main)/clients/actions";
import {
    updateDashboardVisibilityAction,
    regenerateDashboardTokenAction,
    getDashboardPublicSettingsAction
} from "@/app/(main)/dashboard/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "../ui/switch";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ShareDashboardModalProps {
  dashboardId: string;
  clientId?: string;
  ownerId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardTitle?: string;
}

type Candidate = {
  client_member_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  job_title?: string;
};

export default function ShareDashboardModal({
  dashboardId,
  clientId,
  ownerId = "",
  open,
  onOpenChange,
  dashboardTitle,
}: ShareDashboardModalProps) {
  // State
  const [permissions, setPermissions] = useState<DashboardPermissionItem[]>([]);
  const [clientMembers, setClientMembers] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [selectedMemberUserId, setSelectedMemberUserId] = useState<string | null>(null);
  const [selectedPermission, setSelectedPermission] = useState<"VIEW" | "UPDATE">("VIEW");
  const [searchTerm, setSearchTerm] = useState("");

  const [activeTab, setActiveTab] = useState("existing");

  // External Invite State
  const [inviteEmail, setInviteEmail] = useState("");
  const [externalSearchQuery, setExternalSearchQuery] = useState("");
  const debouncedExternalSearch = useDebounce(externalSearchQuery, 500);
  const [foundUsers, setFoundUsers] = useState<{id: string, email: string, full_name: string | null}[]>([]);
  const [searchingExternal, setSearchingExternal] = useState(false);

  // Public Access State
  const [isPublic, setIsPublic] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' && publicToken 
      ? `${window.location.origin}/public/dashboard/${publicToken}`
      : "";

  // 1. Load Permissions & Candidates when modal opens
  useEffect(() => {
    if (open) {
      loadData();
    } else {
      resetState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dashboardId]);

  // Search external users
  useEffect(() => {
    if (debouncedExternalSearch.length > 2) {
        setSearchingExternal(true);
        searchUsers(debouncedExternalSearch).then(res => {
            setSearchingExternal(false);
            if (res.ok && res.data) {
                const validUsers = res.data
                    .filter(u => u.email !== null)
                    .map(u => ({
                        ...u,
                        email: u.email as string
                    }));
                setFoundUsers(validUsers);
            } else {
                setFoundUsers([]);
            }
        });
    } else {
        setFoundUsers([]);
    }
  }, [debouncedExternalSearch]);

  const resetState = () => {
      setPermissions([]);
      setClientMembers([]);
      setSearchTerm("");
      setErrorMsg(null);
      setSelectedMemberUserId(null);
      setInviteEmail("");
      setExternalSearchQuery("");
      setFoundUsers([]);
      setActiveTab("existing");
  };

  const loadData = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const perms = await fetchPermissions();
      const excludeIds = perms.map(p => p.client_member_id);
      await fetchCandidates(excludeIds);

    } catch (err: any) {
      console.error("Error loading data:", err);
      setErrorMsg("Error cargando datos: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPermissions = async (): Promise<DashboardPermissionItem[]> => {
    const { ok, data, error } = await getDashboardPermissionsAction(dashboardId);
    if (!ok || error) {
      throw new Error(error || "Error al obtener permisos");
    }
    setPermissions(data || []);
    return data || [];
  };

  const fetchCandidates = async (excludeClientMemberIds: string[]) => {
    const { ok, data, error } = await getDashboardCandidatesAction(dashboardId, ownerId);
    if (!ok) {
        console.error("Error fetching candidates:", error);
    }
    
    // Filter out existing
    const all = data || [];
    const filtered = all.filter(c => !excludeClientMemberIds.includes(c.client_member_id));
    setClientMembers(filtered);
  };
  
  const loadPublicSettings = async () => {
      const { ok, data } = await getDashboardPublicSettingsAction(dashboardId);
      if (ok && data) {
          setIsPublic(data.visibility === 'public');
          setPublicToken(data.share_token);
      }
  };

  useEffect(() => {
      if (open && activeTab === 'public') {
          loadPublicSettings();
      }
  }, [open, activeTab]);

  const handleVisibilityToggle = async (checked: boolean) => {
      setIsLoadingPublic(true);
      const newVisibility = checked ? 'public' : 'private';
      const { ok, error } = await updateDashboardVisibilityAction(dashboardId, newVisibility);
      
      if (ok) {
          setIsPublic(checked);
          if (!publicToken && checked) {
              // If enabling public and no token exists (rare), regenerate
             await regenerateToken(); 
          }
          toast.success(`Dashboard ahora es ${checked ? "Público" : "Privado"}`);
      } else {
          toast.error("Error al actualizar visibilidad: " + error);
      }
      setIsLoadingPublic(false);
  };

  const regenerateToken = async () => {
      if (!confirm("Esto invalidará el enlace anterior. ¿Continuar?")) return;
      setIsLoadingPublic(true);
      const { ok, token, error } = await regenerateDashboardTokenAction(dashboardId);
      if (ok && token) {
          setPublicToken(token);
          toast.success("Enlace regenerado");
      } else {
          toast.error("Error: " + error);
      }
      setIsLoadingPublic(false);
  };

  const copyPublicLink = () => {
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopied(false), 2000);
  };

  const handleGrant = async () => {
    setIsLoading(true);

    try {
        if (activeTab === "existing") {
             if (!selectedMemberUserId) return;
             const { ok, error } = await addDashboardPermissionAction(dashboardId, selectedMemberUserId, selectedPermission);
             if (!ok) throw new Error(error || "Error al agregar permiso");
        } else {
            // Check for clientId
            if (!clientId) throw new Error("No se pudo identificar el cliente para invitar externamente.");
            if (!inviteEmail) throw new Error("Selecciona un usuario externo.");
            
            const res = await grantPermissionToEmail(clientId, inviteEmail, dashboardId, selectedPermission);
            if (!res.ok) throw new Error(res.error || "Error al invitar usuario externo");
        }

        toast.success("Permiso otorgado correctamente");
        await loadData();
        setSelectedMemberUserId(null);
        setInviteEmail("");
        setExternalSearchQuery("");
    } catch (err: any) {
         console.error("Error granting permission:", err);
         toast.error(err.message || "Ocurrió un error inesperado al agregar el permiso.");
         // alert(err.message); // fallback if toast not available in this context? used toast in other components
    } finally {
        setIsLoading(false);
    }
  };

  // 3. Remove Permission Handler
  const handleRemovePermission = async (permId: string) => {
    if (!confirm("¿Estás seguro de quitar este permiso?")) return;

    try {
      const { ok, error } = await removeDashboardPermissionAction(permId);
      if (!ok) {
        toast.error(`Error al remover permiso: ${error}`);
        return;
      }
      
      const perms = await fetchPermissions();
      const excludeIds = perms.map(p => p.client_member_id);
      await fetchCandidates(excludeIds);
      toast.success("Permiso removido");

    } catch (err: any) {
      console.error("Error removing permission:", err);
      toast.error("Error al remover permiso");
    }
  };

  // Filtering candidates for dropdown
  const filteredCandidates = clientMembers.filter((m) =>
    m.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.job_title && m.job_title.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-all duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[95%] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-white p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-6">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold text-gray-900">
                Compartir Dashboard {dashboardTitle && <span className="text-gray-500 font-normal">· {dashboardTitle}</span>}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-gray-500">
                Administra quién tiene acceso a este dashboard.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-8 lg:flex-row">
            {/* LEFT COLUMN: Add Member Form */}
            <div className="flex flex-1 flex-col gap-6">
              
              <Tabs defaultValue="existing" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="existing">Miembro existente</TabsTrigger>
                    <TabsTrigger value="external">Usuario externo</TabsTrigger>
                    <TabsTrigger value="public">Público</TabsTrigger>
                </TabsList>

                <TabsContent value="existing" className="mt-0 space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                            <Search className="h-3.5 w-3.5" />
                        </div>
                        Buscar miembro
                        </h3>

                        {/* Combobox-like List */}
                        <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder="Buscar por nombre o email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* List of selectables */}
                        <div className="custom-scrollbar max-h-[200px] space-y-2 overflow-y-auto pr-1">
                            {filteredCandidates.length === 0 ? (
                            <div className="py-8 text-center text-sm text-gray-500">
                                {searchTerm ? "No se encontraron miembros" : "Todos los miembros ya tienen acceso"}
                            </div>
                            ) : (
                            filteredCandidates.map((member) => {
                                const isSelected = selectedMemberUserId === member.user_id;
                                return (
                                <div
                                    key={member.client_member_id}
                                    onClick={() => setSelectedMemberUserId(member.user_id)}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                                    isSelected
                                        ? "border-blue-500 bg-blue-50 shadow-sm"
                                        : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                                    }`}
                                >
                                    <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-100 bg-gray-50">
                                    <span className="text-sm font-medium text-gray-600">
                                        {member.full_name?.[0]?.toUpperCase() || "?"}
                                    </span>
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                    <p className={`truncate text-sm font-medium ${isSelected ? "text-blue-700" : "text-gray-900"}`}>
                                        {member.full_name}
                                    </p>
                                    <p className="truncate text-xs text-gray-500">
                                        {member.job_title ? `${member.job_title} • ` : ""} {member.email}
                                    </p>
                                    </div>

                                    {isSelected && <Check className="h-5 w-5 text-blue-600" />}
                                </div>
                                );
                            })
                            )}
                        </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="external" className="mt-0 space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                            Invitar Usuario Externo
                        </h3>
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    placeholder="Buscar usuario global por email..."
                                    value={externalSearchQuery}
                                    onChange={(e) => setExternalSearchQuery(e.target.value)}
                                />
                            </div>

                             <div className="custom-scrollbar max-h-[200px] space-y-2 overflow-y-auto pr-1">
                                {searchingExternal && <div className="py-4 text-center text-sm">Buscando...</div>}
                                {!searchingExternal && foundUsers.length === 0 && externalSearchQuery.length > 2 && (
                                    <div className="py-4 text-center text-sm text-gray-500">No se encontraron usuarios.</div>
                                )}
                                
                                {foundUsers.map((user) => (
                                    <div
                                        key={user.id}
                                        onClick={() => setInviteEmail(user.email)}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
                                            inviteEmail === user.email 
                                                ? "border-blue-500 bg-blue-50 shadow-sm"
                                                : "border-gray-200 bg-white hover:border-gray-300"
                                        )}
                                    >
                                         <div className="flex-1 min-w-0">
                                            <p className="truncate text-sm font-medium text-gray-900">{user.full_name || "Sin nombre"}</p>
                                            <p className="truncate text-xs text-gray-500">{user.email}</p>
                                         </div>
                                         {inviteEmail === user.email && <Check className="h-5 w-5 text-blue-600" />}
                                    </div>
                                ))}
                             </div>
                        </div>
                    </div>
                </TabsContent>


              
              {/* Permission Selector & Button */}
              {activeTab !== 'public' && (
              <div className="flex flex-col gap-4 rounded-xl border border-gray-200 p-5">
                 <div className="grid grid-cols-2 gap-4">
                    {/* VIEW Permission */}
                    <div 
                      onClick={() => setSelectedPermission("VIEW")}
                      className={`cursor-pointer rounded-lg border p-3 transition-all ${
                        selectedPermission === "VIEW" 
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" 
                        : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                         <Shield className={`h-4 w-4 ${selectedPermission === "VIEW" ? "text-blue-600" : "text-gray-500"}`} />
                         <span className={`text-sm font-medium ${selectedPermission === "VIEW" ? "text-blue-700" : "text-gray-900"}`}>
                           Ver
                         </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Solo puede ver el dashboard e interactuar con filtros.
                      </p>
                    </div>

                    {/* UPDATE Permission */}
                    <div 
                      onClick={() => setSelectedPermission("UPDATE")}
                      className={`cursor-pointer rounded-lg border p-3 transition-all ${
                        selectedPermission === "UPDATE" 
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" 
                        : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                         <ShieldCheck className={`h-4 w-4 ${selectedPermission === "UPDATE" ? "text-blue-600" : "text-gray-500"}`} />
                         <span className={`text-sm font-medium ${selectedPermission === "UPDATE" ? "text-blue-700" : "text-gray-900"}`}>
                           Editar
                         </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Puede modificar el diseño, consultas y configuración.
                      </p>
                    </div>
                 </div>

                 <button
                  onClick={handleGrant}
                  disabled={
                      isLoading || 
                      (activeTab === "existing" && !selectedMemberUserId) ||
                      (activeTab === "external" && !inviteEmail)
                  }
                  className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {isLoading ? "Procesando..." : "Otorgar Permiso"}
                 </button>
              </div>
              )}
            {/* Public Access Tab Content */}
                <TabsContent value="public" className="mt-0 space-y-4">
                     <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                         <div className="flex items-center justify-between mb-4">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                </div>
                                Acceso Público
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isPublic ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                                    {isPublic ? "Público" : "Privado"}
                                </span>
                                <Switch
                                    checked={isPublic}
                                    onCheckedChange={handleVisibilityToggle}
                                    disabled={isLoadingPublic}
                                />
                            </div>
                         </div>
                         
                         {isPublic && (
                             <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                 <div className="space-y-1.5">
                                     <label className="text-xs font-medium text-gray-500">Enlace Público</label>
                                     <div className="flex gap-2">
                                         <div className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 truncate font-mono">
                                             {publicUrl}
                                         </div>
                                         <Button
                                             variant="outline"
                                             size="icon"
                                             onClick={copyPublicLink}
                                             className="shrink-0"
                                         >
                                             {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                         </Button>
                                     </div>
                                 </div>

                                 <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                                     Cualquier persona con este enlace podrá ver el dashboard. No podrán editarlo.
                                 </div>

                                 <div className="pt-2 border-t border-gray-200">
                                     <Button 
                                         variant="ghost" 
                                         size="sm" 
                                         onClick={regenerateToken}
                                         disabled={isLoadingPublic}
                                         className="text-red-600 hover:text-red-700 hover:bg-red-50 w-full justify-start h-auto py-2 px-2"
                                     >
                                         <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isLoadingPublic ? "animate-spin" : ""}`} />
                                         Regenerar enlace (invalida el anterior)
                                     </Button>
                                 </div>
                             </div>
                         )}
                         
                         {!isPublic && (
                             <p className="text-xs text-gray-500">
                                 Activa el acceso público para compartir este dashboard mediante un enlace único, sin necesidad de que los usuarios inicien sesión.
                             </p>
                         )}
                     </div>
                </TabsContent>

              </Tabs>
            
                 <div className="flex flex-col gap-4">
                  {/* Additional UI if needed */}
                 </div>
            </div>

            {/* RIGHT COLUMN: Current Permissions List */}
            <div className="lg:w-[420px] lg:border-l lg:border-gray-100 lg:pl-8">
               <h3 className="mb-4 text-sm font-semibold text-gray-900">
                 Personas con acceso ({permissions.length})
               </h3>

               <div className="custom-scrollbar max-h-[500px] space-y-4 overflow-y-auto pr-1">
                 {permissions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
                      <p className="text-sm text-gray-500">Nadie tiene acceso extra aparte del dueño.</p>
                    </div>
                 ) : (
                   permissions.map((p) => (
                     <div key={p.id} className="group flex items-start justify-between gap-3 rounded-lg p-2 hover:bg-gray-50">
                        <div className="flex items-start gap-3">
                           <div className="relative h-9 w-9 overflow-hidden rounded-full border border-gray-200">
                             <Image 
                               src={p.image_url || "/Image.svg"} 
                               alt={p.full_name}
                               fill
                               className="object-cover"
                             />
                           </div>
                           <div>
                             <p className="text-sm font-medium text-gray-900">{p.full_name}</p>
                             <div className="flex items-center gap-2">
                               <p className="text-xs text-gray-500">{p.email}</p>
                               <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                               <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                 p.permission_type === "UPDATE" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                               }`}>
                                 {p.permission_type === "UPDATE" ? "Editor" : "Lector"}
                               </span>
                             </div>
                           </div>
                        </div>

                        <button 
                          onClick={() => handleRemovePermission(p.id)}
                          disabled={isLoading}
                          className="rounded p-1.5 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                          title="Remover acceso"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                     </div>
                   ))
                 )}
               </div>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {errorMsg}
            </div>
          )}

        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
