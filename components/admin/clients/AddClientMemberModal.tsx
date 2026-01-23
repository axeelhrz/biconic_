"use client";

import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Check, Loader2, UserPlus } from "lucide-react";
import { addClientMember, searchUsers, createAndAddMember } from "@/app/admin/(main)/clients/actions";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/ui/PasswordInput";

// Local debounce hook if not available
function useLocalDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function AddClientMemberModal({ clientId, onUserAdded }: { clientId: string, onUserAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useLocalDebounce(searchTerm, 300);
  const [results, setResults] = useState<{id: string, email: string, full_name: string}[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{id: string, email: string, full_name: string} | null>(null);

  // Mode: 'search' | 'create'
  const [mode, setMode] = useState<'search' | 'create'>('search');

  // Create Form State
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const [role, setRole] = useState("viewer");

  // Search Effect
  useEffect(() => {
      if (mode === 'search' && debouncedSearch.trim().length > 1) {
          setSearching(true);
          searchUsers(debouncedSearch).then(res => {
              if (res.ok && res.data) {
                  // Filter out unwanted results? 
                  setResults(res.data.map((u: any) => ({
                      id: u.id,
                      email: u.email ?? "",
                      full_name: u.full_name ?? ""
                  })));
              }
              setSearching(false);
          });
      } else {
          setResults([]);
      }
  }, [debouncedSearch, mode]);

  const handleAddExisting = async () => {
    if (!selectedUser) return;
    const res = await addClientMember(clientId, selectedUser.id, role);
    if (res.ok) {
        toast.success("Usuario añadido");
        resetAndClose();
    } else {
        toast.error(res.error ?? "prohibido");
    }
  };

  const handleCreateNew = async () => {
      if (!newName || !newEmail || !newPassword) {
          toast.error("Complete todos los campos");
          return;
      }
      setCreating(true);
      const res = await createAndAddMember({
          clientId,
          role,
          fullName: newName,
          email: newEmail,
          password: newPassword
      });
      setCreating(false);
      
      if (res.ok) {
          toast.success("Usuario creado y añadido");
          resetAndClose();
      } else {
          toast.error(res.error ?? "Error al crear usuario");
      }
  };

  const resetAndClose = () => {
      setOpen(false);
      setSearchTerm("");
      setSelectedUser(null);
      setMode('search');
      setResults([]);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      onUserAdded?.(); // Call parent reload
  };
  
  // Custom Password Input import check needed. 
  // Assuming simple input for now or attempting imports.

  return (
    <Dialog open={open} onOpenChange={(v) => { if(!v) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button className="rounded-full bg-[#0F5F4C] text-white hover:bg-[#0b4638]">
          <Plus className="mr-2 h-4 w-4" /> Añadir usuario
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{mode === 'search' ? "Añadir usuario al cliente" : "Crear nuevo usuario"}</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
            
            {/* Common Role Selection */}
            <div className="grid gap-2">
                <Label htmlFor="role">Rol en el cliente</Label>
                <select
                    id="role"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                </select>
            </div>

            {mode === 'search' ? (
                <div className="flex flex-col gap-4">
                    <div className="grid gap-2">
                        <Label>Buscar usuario</Label>
                        <Input 
                            placeholder="Nombre o correo..." 
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setSelectedUser(null); // Clear selection on type
                            }}
                            autoFocus
                        />
                    </div>
                    
                    <div className="max-h-[200px] overflow-y-auto rounded-md border bg-gray-50">
                        {searching && <div className="p-3 text-center text-sm text-gray-500"><Loader2 className="mx-auto h-4 w-4 animate-spin"/> Buscando...</div>}
                        {!searching && searchTerm.length > 1 && results.length === 0 && (
                            <div className="p-3 text-center text-sm text-gray-500">No se encontraron usuarios.</div>
                        )}
                        {!searching && results.map(u => (
                            <button
                                key={u.id}
                                className={cn(
                                    "flex w-full flex-col items-start px-4 py-2 text-sm hover:bg-gray-100",
                                    selectedUser?.id === u.id && "bg-[#E7FFE4] hover:bg-[#E7FFE4]"
                                )}
                                onClick={() => setSelectedUser(u)}
                            >
                                <span className="font-semibold">{u.full_name || "Sin nombre"}</span>
                                <span className="text-gray-500">{u.email}</span>
                            </button>
                        ))}
                    </div>

                   <div className="flex items-center justify-between pt-2">
                       <Button variant="ghost" className="text-sm text-[#0F5F4C]" onClick={() => setMode('create')}>
                           <UserPlus className="mr-2 h-4 w-4" /> Crear nuevo usuario
                       </Button>
                       <Button onClick={handleAddExisting} disabled={!selectedUser} className="bg-[#0F5F4C] hover:bg-[#0b4638]">
                           Añadir seleccionado
                       </Button>
                   </div>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    <div className="grid gap-2">
                        <Label>Nombre completo</Label>
                        <Input placeholder="Ej. Juan Perez" value={newName} onChange={e => setNewName(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                        <Label>Correo electrónico</Label>
                        <Input placeholder="juan@ejemplo.com" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                        <Label>Contraseña</Label>
                        <PasswordInput placeholder="********" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    </div>
                    
                    <div className="flex items-center justify-between pt-4">
                       <Button variant="ghost" onClick={() => setMode('search')}>
                           Cancelar
                       </Button>
                       <Button onClick={handleCreateNew} disabled={creating} className="bg-[#0F5F4C] hover:bg-[#0b4638]">
                           {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                           Crear y Añadir
                       </Button>
                   </div>
                </div>
            )}
        
        </div>
      </DialogContent>
    </Dialog>
  );
}
