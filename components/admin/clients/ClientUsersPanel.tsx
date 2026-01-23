"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getClientUsers, toggleClientMemberStatus, type ClientMemberUser } from "@/app/admin/(main)/clients/actions";
import { cn } from "@/lib/utils";

import AddClientMemberModal from "./AddClientMemberModal";

export default function ClientUsersPanel({ clientId }: { clientId: string }) {
  const [users, setUsers] = useState<ClientMemberUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, [clientId]);

  async function loadUsers() {
    setLoading(true);
    const res = await getClientUsers(clientId);
    if (res.ok && res.data) {
      setUsers(res.data);
    } else {
      toast.error(res.error ?? "Error cargando usuarios");
    }
    setLoading(false);
  }

  async function handleToggleStatus(user: ClientMemberUser) {
    const newStatus = !user.isActive;
    // Optimistic update
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: newStatus } : u));
    
    const res = await toggleClientMemberStatus(user.id, newStatus);
    if (!res.ok) {
        // Revert
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: user.isActive } : u));
        toast.error(res.error ?? "Error actualizando estado");
    } else {
        toast.success(`Usuario ${newStatus ? 'activado' : 'desactivado'}`);
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex justify-end">
         <AddClientMemberModal clientId={clientId} onUserAdded={loadUsers} />
      </div>
      <div className="rounded-[14px] border border-[#D9DCE3] bg-white">
        <HeaderRow />
        {loading ? (
           <div className="p-8 text-center text-sm text-gray-500">Cargando usuarios...</div>
        ) : users.length === 0 ? (
           <div className="p-8 text-center text-sm text-gray-500">No hay usuarios en este cliente.</div>
        ) : (
            users.map(user => (
                <UserRow key={user.id} user={user} onToggle={() => handleToggleStatus(user)} />
            ))
        )}
      </div>
    </div>
  );
}

function HeaderRow() {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#D9DCE3] px-6 py-3 text-[12px] font-semibold text-[#54565B]">
      <div className="w-[250px]">Usuario</div>
      <div className="w-[250px]">Correo</div>
      <div className="w-[150px]">Rol</div>
      <div className="w-[100px]">Estado</div>
      <div className="w-[120px]">Acciones</div>
    </div>
  );
}

function UserRow({ user, onToggle }: { user: ClientMemberUser; onToggle: () => void }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-[#D9DCE3] px-6 py-4 text-sm transition-colors", !user.isActive && "bg-gray-50/50")}>
      <div className="flex w-[250px] items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gray-200" />
        <span className={cn("font-medium", !user.isActive && "text-gray-500")}>{user.fullName}</span>
      </div>
      <div className="w-[250px] text-gray-600">{user.email}</div>
      <div className="w-[150px]">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 capitalize">
            {user.role}
        </span>
      </div>
      <div className="w-[100px]">
         <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            user.isActive
              ? "bg-[#E7FFE4] text-[#1D7C4D]"
              : "bg-gray-100 text-gray-500"
          )}
        >
          {user.isActive ? "Activo" : "Inactivo"}
        </span>
      </div>
      <div className="w-[120px]">
        <button
            onClick={onToggle}
            className={cn(
                "text-xs font-medium underline transition-colors",
                user.isActive ? "text-red-600 hover:text-red-700" : "text-[#0F5F4C] hover:text-[#0b4638]"
            )}
        >
            {user.isActive ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  );
}
