import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import { 
    addClientPermission, 
    getClientDashboards, 
    getClientMembersSimple,
    grantPermissionToEmail,
    searchUsers
} from "@/app/admin/(main)/clients/actions";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

export default function AddClientPermissionModal({ clientId, onPermissionAdded }: { clientId: string, onPermissionAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [members, setMembers] = useState<{id: string, name: string, email: string}[]>([]);
  const [dashboards, setDashboards] = useState<{id: string, title: string}[]>([]);
  
  const [selectedMember, setSelectedMember] = useState("");
  const [selectedDashboard, setSelectedDashboard] = useState("");
  const [permissionType, setPermissionType] = useState("VIEW");

  const [openMember, setOpenMember] = useState(false);
  const [openDashboard, setOpenDashboard] = useState(false);

  // External Invite State
  const [openExternal, setOpenExternal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [externalSearchQuery, setExternalSearchQuery] = useState("");
  const debouncedExternalSearch = useDebounce(externalSearchQuery, 500);
  const [foundUsers, setFoundUsers] = useState<{id: string, email: string, full_name: string | null}[]>([]);
  const [searchingExternal, setSearchingExternal] = useState(false);

  const [activeTab, setActiveTab] = useState("existing");

  useEffect(() => {
      if (open) {
          setLoading(true);
          Promise.all([
              getClientMembersSimple(clientId),
              getClientDashboards(clientId)
          ]).then(([mRes, dRes]) => {
              if (mRes.ok && mRes.data) setMembers(mRes.data);
              if (dRes.ok && dRes.data) {
                  setDashboards(dRes.data.map((d: any) => ({
                      id: d.id,
                      title: d.title ?? "Sin título"
                  })));
              }
              setLoading(false);
          });
      }
  }, [open, clientId]);

  useEffect(() => {
    if (debouncedExternalSearch.length > 2) {
        setSearchingExternal(true);
        searchUsers(debouncedExternalSearch).then(res => {
            setSearchingExternal(false);
            if (res.ok && res.data) {
                const validUsers = res.data.filter((u): u is { id: string; email: string; full_name: string | null } => u.email !== null);
                setFoundUsers(validUsers);
            } else {
                setFoundUsers([]);
            }
        });
    } else {
        setFoundUsers([]);
    }
  }, [debouncedExternalSearch]);

  const handleAdd = async () => {
    if (!selectedDashboard) {
        toast.error("Selecciona un dashboard");
        return;
    }

    setLoading(true);
    
    if (activeTab === "existing") {
        if (!selectedMember) {
            toast.error("Selecciona un miembro");
            setLoading(false);
            return;
        }
        const res = await addClientPermission(selectedMember, selectedDashboard, permissionType as 'VIEW' | 'UPDATE');
        handleResponse(res);
    } else {
        // External
        if (!inviteEmail) {
             toast.error("Selecciona un usuario externo");
             setLoading(false);
             return;
        }
        // If user didn't verify, we try anyway
        const res = await grantPermissionToEmail(clientId, inviteEmail, selectedDashboard, permissionType as 'VIEW' | 'UPDATE');
        handleResponse(res);
    }
  };

  const handleResponse = (res: { ok: boolean, error?: string, message?: string }) => {
      setLoading(false);
      if (res.ok) {
        toast.success(res.message ?? "Permiso añadido");
        setOpen(false);
        resetState();
        onPermissionAdded?.();
    } else {
        toast.error(res.error ?? "Error al añadir permiso");
    }
  };

  const resetState = () => {
    setSelectedMember("");
    setSelectedDashboard("");
    setInviteEmail("");
    setFoundUsers([]);
    setExternalSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full bg-[#0F5F4C] text-white hover:bg-[#0b4638]">
          <Plus className="mr-2 h-4 w-4" /> Añadir permiso
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Otorgar permiso</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="existing" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">Miembro existente</TabsTrigger>
                <TabsTrigger value="external">Usuario externo</TabsTrigger>
            </TabsList>

            <div className="grid gap-4 py-4">
                <TabsContent value="existing" className="mt-0 space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="member">Usuario del Cliente</Label>
                        <Popover open={openMember} onOpenChange={setOpenMember}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={openMember}
                              className="w-full justify-between"
                              disabled={loading}
                            >
                              {selectedMember
                                ? members.find((m) => m.id === selectedMember)?.name || "Seleccionado"
                                : "Seleccionar usuario..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar usuario..." />
                              <CommandList>
                                <CommandEmpty>No se encontraron usuarios.</CommandEmpty>
                                <CommandGroup>
                                  {members.map((member) => (
                                    <CommandItem
                                      key={member.id}
                                      value={member.name}
                                      keywords={[member.email]}
                                      onSelect={() => {
                                        setSelectedMember(member.id)
                                        setOpenMember(false)
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedMember === member.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div className="flex flex-col">
                                          <span>{member.name}</span>
                                          <span className="text-xs text-muted-foreground">{member.email}</span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                    </div>
                </TabsContent>

                <TabsContent value="external" className="mt-0 space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="external-user">Buscar Usuario (Email o Nombre)</Label>
                        <Popover open={openExternal} onOpenChange={setOpenExternal}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openExternal}
                                    className="w-full justify-between"
                                    disabled={loading}
                                >
                                    {inviteEmail || "Buscar usuario global..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                <Command shouldFilter={false}>
                                    <CommandInput 
                                        placeholder="Escribe para buscar..." 
                                        value={externalSearchQuery}
                                        onValueChange={setExternalSearchQuery}
                                    />
                                    <CommandList>
                                        {searchingExternal && <div className="py-6 text-center text-sm">Buscando...</div>}
                                        {!searchingExternal && foundUsers.length === 0 && (
                                            <CommandEmpty>No se encontraron usuarios.</CommandEmpty>
                                        )}
                                        <CommandGroup>
                                            {foundUsers.map((user) => (
                                                <CommandItem
                                                    key={user.id}
                                                    value={user.email}
                                                    onSelect={(currentValue) => {
                                                        setInviteEmail(user.email);
                                                        setOpenExternal(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            inviteEmail === user.email ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span>{user.full_name || "Sin nombre"}</span>
                                                        <span className="text-xs text-muted-foreground">{user.email}</span>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </TabsContent>

                <div className="grid gap-2">
                    <Label htmlFor="dashboard">Dashboard</Label>
                    <Popover open={openDashboard} onOpenChange={setOpenDashboard}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openDashboard}
                          className="w-full justify-between"
                          disabled={loading}
                        >
                          {selectedDashboard
                            ? dashboards.find((d) => d.id === selectedDashboard)?.title
                            : "Seleccionar dashboard..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar dashboard..." />
                          <CommandList>
                            <CommandEmpty>No se encontraron dashboards.</CommandEmpty>
                            <CommandGroup>
                              {dashboards.map((dashboard) => (
                                <CommandItem
                                  key={dashboard.id}
                                  value={dashboard.title}
                                  onSelect={() => {
                                    setSelectedDashboard(dashboard.id)
                                    setOpenDashboard(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedDashboard === dashboard.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {dashboard.title}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="perm">Tipo de permiso</Label>
                    <select
                        id="perm"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={permissionType}
                        onChange={(e) => setPermissionType(e.target.value)}
                    >
                        <option value="VIEW">Ver (VIEW)</option>
                        <option value="UPDATE">Editar (UPDATE)</option>
                    </select>
                </div>
            </div>
        </Tabs>
        
        <DialogFooter>
          <Button onClick={handleAdd} disabled={
              loading || 
              !selectedDashboard || 
              (activeTab === "existing" && !selectedMember) || 
              (activeTab === "external" && !inviteEmail)
          }>
              {loading ? "Añadiendo..." : "Añadir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
