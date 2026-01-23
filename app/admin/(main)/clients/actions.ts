"use server";

import type { Database } from "@/lib/supabase/database.types";
import { revalidatePath } from "next/cache";

export type ClientMemberUser = {
  id: string; // client_member id
  userId: string;
  fullName: string;
  email: string;
  role: Database["public"]["Enums"]["client_role"];
  isActive: boolean;
  joinedAt: string;
};

export async function getClientUsers(clientId: string): Promise<{ ok: boolean; data?: ClientMemberUser[]; error?: string }> {
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    
    // 1. Fetch members first
    const { data: members, error } = await supabase
      .from("client_members")
      .select(`
        id,
        user_id,
        role,
        is_active,
        created_at
      `)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error: error.message };
    if (!members || members.length === 0) return { ok: true, data: [] };

    // 2. Fetch profiles for these users manually
    const userIds = members.map((m) => m.user_id);
    const { data: profiles, error: pError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
        
    if (pError) return { ok: false, error: pError.message };

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

    const users: ClientMemberUser[] = members.map((m) => {
      const p = profileMap.get(m.user_id);
      return {
        id: m.id,
        userId: m.user_id,
        fullName: p?.full_name ?? "—",
        email: p?.email ?? "—",
        role: m.role,
        isActive: m.is_active ?? true, 
        joinedAt: m.created_at,
      };
    });

    return { ok: true, data: users };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function toggleClientMemberStatus(memberId: string, isActive: boolean) {
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    
    const { error } = await supabase
      .from("client_members")
      .update({ is_active: isActive })
      .eq("id", memberId);

    if (error) return { ok: false, error: error.message };
    
    revalidatePath("/admin/clients/[clientId]"); 
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function searchUserByEmail(email: string) {
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .ilike("email", email)
      .single();
    
    if (error) return { ok: false, error: "Usuario no encontrado" };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: "Error buscando usuario" };
  }
}

export async function addClientMember(clientId: string, userId: string, role: string) {
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    
    // Check if already member (locally)
    const { data: existing } = await supabase
        .from("client_members")
        .select("id")
        .eq("client_id", clientId)
        .eq("user_id", userId)
        .single();
        
    if (existing) return { ok: false, error: "El usuario ya es miembro de este cliente" };

    // Try insert. If user belongs to ANOTHER client, the DB UNIQUE constraint will throw error.
    const { error } = await supabase.from("client_members").insert({
        client_id: clientId,
        user_id: userId,
        role: role as any,
        is_active: true
    });

    if (error) {
        if (error.code === '23505') { // Unique violation
            return { ok: false, error: "Este usuario ya pertenece a otra empresa y no puede ser añadido aquí." };
        }
        return { ok: false, error: error.message };
    }
    
    revalidatePath("/admin/clients/[clientId]");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function getClientDashboards(clientId: string) {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    const { data, error } = await supabase
        .from("dashboard")
        .select("id, title")
        .eq("client_id", clientId);
        
    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
}

export async function getClientMembersSimple(clientId: string) {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    
    const { data: members } = await supabase
        .from("client_members")
        .select("id, user_id, role, is_active")
        .eq("client_id", clientId)
        .eq("is_active", true);

    if (!members) return { ok: true, data: [] };
    
    const userIds = members.map(m => m.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", userIds);
    
    const map = new Map(profiles?.map(p => [p.id, p]));
    
    const res = members.map(m => {
        const p = map.get(m.user_id);
        return {
            id: m.id, // client_member_id
            name: p?.full_name ?? p?.email ?? "Usuario",
            email: p?.email ?? ""
        };
    });
    
    return { ok: true, data: res };
}

export async function addClientPermission(clientMemberId: string, dashboardId: string, type: 'VIEW' | 'UPDATE') {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    
    // Check existing
    const { data: exist } = await supabase
        .from("dashboard_has_client_permissions")
        .select("id")
        .eq("client_member_id", clientMemberId)
        .eq("dashboard_id", dashboardId)
        .single();
        
    if (exist) return { ok: false, error: "El usuario ya tiene permiso sobre este dashboard" };
    
    const { error } = await supabase.from("dashboard_has_client_permissions").insert({
        client_member_id: clientMemberId,
        dashboard_id: dashboardId,
        permission_type: type,
        is_active: true
    });
    
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/clients/[clientId]");
    return { ok: true };
}

export async function searchUsers(query: string) {
    try {
        const supabase = await (await import("@/lib/supabase/server")).createClient();
        const { data, error } = await supabase
            .from("profiles")
            .select("id, email, full_name")
            .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
            .limit(10);
            
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: data };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

export async function createAndAddMember(input: {
    clientId: string;
    role: string;
    fullName: string;
    email: string;
    password: string;
}) {
    // 1. Create user via edge function/action
    const { addClientMember: addMemberAction } = await import("@/actions/addClientMember");
    const res = await addMemberAction({
        existingClientId: input.clientId,
        userEmail: input.email,
        userPassword: input.password,
        userFullName: input.fullName,
        userJobTitle: input.role
    });
    
    if (!res.ok) return { ok: false, error: res.error };
    
    revalidatePath("/admin/clients/[clientId]");
    return { ok: true };
}

// ESTA ES LA FUNCIÓN CLAVE CORREGIDA PARA PERMITIR COLABORACIÓN EXTERNA
export async function grantPermissionToEmail(clientId: string, email: string, dashboardId: string, permissionType: 'VIEW' | 'UPDATE') {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    
    // 1. Find User by Email
    const { data: user, error: uErr } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .single();
        
    if (uErr || !user) return { ok: false, error: "Usuario no encontrado con ese email." };
    
    // 2. BUSCAR MEMBRESÍA GLOBAL (CORRECCIÓN CRÍTICA)
    // Buscamos si el usuario ya tiene "carnet de identidad" (membresía) en CUALQUIER empresa.
    let clientMemberId: string;
    
    const { data: existingMember } = await supabase
        .from("client_members")
        .select("id, client_id")
        .eq("user_id", user.id)
        .single();
        
    if (existingMember) {
        // CASO A: El usuario YA pertenece a una empresa (tuya o externa).
        // Usamos su ID existente. Esto permite la colaboración externa sin violar UNIQUE constraints.
        clientMemberId = existingMember.id;
    } else {
        // CASO B: El usuario no tiene empresa asignada. Lo adoptamos en la nuestra.
        const { data: newMember, error: mErr } = await supabase
            .from("client_members")
            .insert({
                client_id: clientId,
                user_id: user.id,
                role: 'viewer', // Rol por defecto
                is_active: true
            })
            .select("id")
            .single();
            
        if (mErr) return { ok: false, error: "Error creando membresía: " + mErr.message };
        clientMemberId = newMember.id;
    }
    
    // 3. Crear o Actualizar el Permiso
    // Verificamos si ya existe el permiso para ese dashboard
    const { data: exist } = await supabase
        .from("dashboard_has_client_permissions")
        .select("id")
        .eq("client_member_id", clientMemberId)
        .eq("dashboard_id", dashboardId)
        .single();
        
    if (exist) {
        // Si ya existe, actualizamos el tipo de permiso y lo activamos
        const { error: upErr } = await supabase
            .from("dashboard_has_client_permissions")
            .update({ permission_type: permissionType, is_active: true })
            .eq("id", exist.id);
            
         if (upErr) return { ok: false, error: upErr.message };
         revalidatePath("/admin/clients/[clientId]");
         return { ok: true, message: "Permiso actualizado" };
    }

    // Insertar nuevo permiso
    const { error: pErr } = await supabase.from("dashboard_has_client_permissions").insert({
        client_member_id: clientMemberId,
        dashboard_id: dashboardId,
        permission_type: permissionType,
        is_active: true
    });
    
    if (pErr) return { ok: false, error: pErr.message };
    
    revalidatePath("/admin/clients/[clientId]");
    return { ok: true, message: "Permiso otorgado exitosamente" };
}