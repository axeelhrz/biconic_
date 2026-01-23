"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Database } from "@/lib/supabase/database.types";
import postgres from "postgres";

type AppPermissionType = Database["public"]["Enums"]["app_permission_type"];

// --- Helpers ---

async function getSupabase() {
  return createClient();
}

async function getServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined");
  }
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {}
    }
  });
}

// Logic to bypass checks for App Admin
async function isAppAdmin(userId: string) {
  const supabase = await getSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .single();
  return profile?.app_role === "APP_ADMIN";
}

// Reuse logic for verifying permissions or getting scope client
async function getScopeClient() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const isAdmin = await isAppAdmin(user.id);
  if (isAdmin) {
    // Admin uses Service Role client to bypass RLS
    // We explicitly cast to any to avoid type mismatches with the regular client types
    return { client: await getServiceRoleClient() as any, user, isAppAdmin: true };
  }
  
  return { client: supabase, user, isAppAdmin: false };
}

// --- Actions ---

export type EtlActionResponse<T> = {
    ok: boolean;
    data?: T;
    error?: string;
};

// 1. Get ETLs (Owned + Shared) - Replaces EtlGrid fetch
export async function getEtlsAction(searchQuery: string = "", filter: string = "todos") {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return { ok: false, error: "Unauthorized" };

    try {
        // Fetch Owned
        const { data: owned, error: ownedErr } = await supabase
            .from("etl")
            .select("*")
            .eq("user_id", user.id);
        
        if (ownedErr) throw ownedErr;

        // Fetch Shared
        const { data: members } = await supabase
            .from("client_members")
            .select("id")
            .eq("user_id", user.id);
        
        let sharedEtls: any[] = [];
        if (members?.length) {
            const memberIds = members.map(m => m.id);
            const { data: perms } = await supabase
                .from("etl_has_permissions")
                .select("etl_id")
                .in("client_member_id", memberIds);
            
            if (perms?.length) {
                const etlIds = Array.from(new Set(perms.map(p => p.etl_id).filter(id => id !== null))) as string[];
                const { data: shared, error: sharedErr } = await supabase
                    .from("etl")
                    .select("*")
                    .in("id", etlIds);
                
                if (sharedErr) throw sharedErr;
                sharedEtls = shared ?? [];
            }
        }

        // Merge
        const allEtls = [...(owned ?? [])];
        const seenIds = new Set(allEtls.map(e => e.id));
        
        for (const etl of sharedEtls) {
            if (!seenIds.has(etl.id)) {
                allEtls.push(etl);
                seenIds.add(etl.id);
            }
        }

        // We can do filtering here or client side. The prompt usually implies moving *fetching* logic.
        // But `EtlGrid` filtered client side. We'll return raw data and let valid client filtering happen?
        // Or implement filtering here? 
        // The original `EtlGrid` did client side filtering. 
        // Since `searchQuery` is passed, let's filter here for efficiency if possible, 
        // but Typescript mapping logic was in component.
        // Let's return the raw rows (similar to `SupabaseEtlRow`) and map in component for now to minimize UI breakage,
        // or better, map here and return UI-ready data?
        // Mapping requires `owner` names etc. `EtlGrid` fetched owners separately.
        
        // Let's align with `EtlGrid` logic: Fetch simple list, then maybe enrich?
        // `EtlGrid` fetched ALL rows and owners.
        // Let's reproduce that enrichment here to be truly "Server Action".
        
        // Fetch owners
        const ownerIds = Array.from(new Set(allEtls.map(e => e.user_id).filter(Boolean))) as string[];
        let ownerMap = new Map<string, string>();
        
        if (ownerIds.length) {
            const {data: profiles} = await supabase.from("profiles").select("id, full_name").in("id", ownerIds);
            profiles?.forEach(p => ownerMap.set(p.id, p.full_name ?? ""));
        }

        // Map to Etl UI type
        const mapped = allEtls.map(row => {
            const status = (row.status === "Publicado" || row.status === "Borrador"
                ? row.status
                : row.published ? "Publicado" : "Borrador") as "Publicado" | "Borrador" | "Conectado" | "Desconectado";

            return {
              id: String(row.id),
              title: row.title ?? row.name ?? "Sin título",
              imageUrl: "/Image.svg",
              status,
              description: "", // ETL table doesn't have a description field
              views: 0, // ETL table doesn't have a views field
              lastExecution: "",
              nextExecution: "",
              createdAt: "",
              clientId: row.client_id ?? "",
              ownerId: row.user_id,
              owner: row.user_id ? { fullName: ownerMap.get(row.user_id) ?? null } : undefined,
            };
        });

        return { ok: true, data: mapped };

    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

// 1.5 Rename ETL
export async function renameEtlAction(etlId: string, newTitle: string) {
    try {
        const { client, user } = await getScopeClient();
        
        if (!newTitle || typeof newTitle !== "string" || newTitle.trim().length === 0) {
            return { ok: false, error: "El título no puede estar vacío" };
        }
        
        const trimmedTitle = newTitle.trim();
        
        if (trimmedTitle.length > 100) {
            return { ok: false, error: "El título es demasiado largo (máximo 100 caracteres)" };
        }
        
        // Update both title and name fields
        const { error } = await client
            .from("etl")
            .update({ 
                title: trimmedTitle, 
                name: trimmedTitle 
            })
            .eq("id", etlId);
        
        if (error) throw error;
        
        return { ok: true, data: trimmedTitle };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

// 2. Get Permissions (Replaces GET /api/etl/permissions)
export async function getEtlPermissionsAction(etlId: string) {
    try {
        const { client, user, isAppAdmin } = await getScopeClient(); 
        // Note: For reading permissions, we usually don't need Service Role if we are owner/member,
        // but if Admin is viewing an orphan ETL, they might need it.
        // Logic in API `GET` used regular client for `etl_has_permissions`, relying on RLS?
        // No, API `GET` used `supabase` (regular) for `verifyUpdatePermission` then `supabase` for permissions fetch.
        // BUT if Admin is inspecting, `etl_has_permissions` RLS might block them if they aren't owner/member.
        // So safe to use `client` (which is service role if admin).

        const { data: perms, error: permsErr } = await client
            .from("etl_has_permissions")
            .select("id, client_member_id, permission_type, created_at")
            .eq("etl_id", etlId);

        if (permsErr) throw permsErr;
        
        if (!perms || perms.length === 0) return { ok: true, data: [] };

        const clientMemberIds = perms.map((p: any) => p.client_member_id);
        const { data: members, error: membersErr } = await client
            .from("client_members")
            .select("id, user_id, role")
            .in("id", clientMemberIds);
        
        if (membersErr) throw membersErr;

        const userIds = members?.map((m: any) => m.user_id) ?? [];
        const { data: profiles, error: profilesErr } = await client
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);
        
        if (profilesErr) throw profilesErr;

        const memberById = new Map<string, any>(members?.map((m: any) => [m.id, m]) ?? []);
        const profileById = new Map<string, any>(profiles?.map((p: any) => [p.id, p]) ?? []);

        const result = perms.map((p: any) => {
            const member = memberById.get(p.client_member_id);
            const profile = member ? profileById.get(member.user_id) : undefined;
            return {
                id: p.id,
                client_member_id: p.client_member_id,
                permission_type: p.permission_type,
                is_active: true,
                created_at: p.created_at,
                client_member_role: member?.role ?? null,
                user: profile ? { id: profile.id, full_name: profile.full_name, email: profile.email } : null,
            };
        });

        return { ok: true, data: result };

    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

// 3. Get Candidates (Replaces fetchClientMembers logic)
export async function getEtlCandidatesAction(etlId: string, ownerId?: string) {
    try {
        const { client, user, isAppAdmin } = await getScopeClient();
        
        // 1. Resolve Client ID
        let targetClientId: string | null = null;
        
        // Try getting from ETL
        const { data: etl } = await client
            .from("etl")
            .select("client_id")
            .eq("id", etlId)
            .maybeSingle();
        
        targetClientId = etl?.client_id;

        // Fallback to Owner
        if (!targetClientId && ownerId) {
             const { data: ownerMember } = await client
                .from("client_members")
                .select("client_id")
                .eq("user_id", ownerId)
                .maybeSingle(); // Admin might find multiple? We take one.
             targetClientId = ownerMember?.client_id;
        }

        if (!targetClientId) {
             // If implicit admin context and no client found, return empty or all users?
             // Prompt logic was: "If no client, ... deduco based on owner".
             // If fails, return empty.
             return { ok: true, data: [] };
        }

        // 2. Fetch Members
        const { data: members, error: membersErr } = await client
            .from("client_members")
            .select("id, user_id, role")
            .eq("client_id", targetClientId);
        
        if (membersErr) throw membersErr;

        const memberMap = new Map();
        const memberUserIds = new Set<string>();
        members?.forEach((m: any) => {
            if (m.user_id) {
                memberUserIds.add(m.user_id);
                memberMap.set(m.user_id, m);
            }
        });

        // 3. Fetch Profiles
        let query = client.from("profiles").select("id, full_name, email");
        
        if (!isAppAdmin) {
            // Regular user only sees existing members of the client
            if (memberUserIds.size === 0) return { ok: true, data: [] };
            query = query.in("id", Array.from(memberUserIds));
        }

        const { data: profiles, error: profilesErr } = await query;
        if (profilesErr) throw profilesErr;

        const options = (profiles ?? []).map((p: any) => {
             const member = memberMap.get(p.id);
             return {
                client_member_id: member?.id ?? "PENDING_" + p.id,
                userId: p.id,
                full_name: p.full_name,
                email: p.email,
                role: member?.role ?? null
             };
        });

        return { ok: true, data: options };

    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

// 4. Add Permission (Replaces POST)
export async function addEtlPermissionAction(etlId: string, targetUserId: string, permissionType: AppPermissionType) {
    try {
        const { client, isAppAdmin } = await getScopeClient();

        // 1. Resolve Client
        const { data: etlRow } = await client.from("etl").select("client_id, user_id").eq("id", etlId).single();
        if (!etlRow) throw new Error("ETL Not Found");
        
        let effectiveClientId = etlRow.client_id;
        if (!effectiveClientId && etlRow.user_id) {
            const { data: m } = await client.from("client_members").select("client_id").eq("user_id", etlRow.user_id).maybeSingle();
            effectiveClientId = m?.client_id;
        }

        if (!effectiveClientId) throw new Error("No Client Context Found");

        // 2. Resolve/Create Member
        let memberId: string | undefined;
        const { data: existingMember } = await client
            .from("client_members")
            .select("id")
            .eq("user_id", targetUserId)
            .eq("client_id", effectiveClientId)
            .maybeSingle();
        
        if (existingMember) {
            memberId = existingMember.id;
        } else {
            // Auto-add member
            const { data: newMember, error: addErr } = await client
                .from("client_members")
                .insert({
                    client_id: effectiveClientId,
                    user_id: targetUserId,
                    role: "viewer"
                })
                .select("id")
                .single();
            if (addErr) throw addErr;
            memberId = newMember.id;
        }

        // 3. Insert Permission
        const { error: insertErr } = await client
            .from("etl_has_permissions")
            .insert({
                etl_id: etlId,
                client_member_id: memberId,
                permission_type: permissionType
            });
        
        if (insertErr) {
             if (insertErr.code === "23505") return { ok: false, error: "Permission already exists" }; // Duplicate
             throw insertErr;
        }

        return { ok: true };

    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

// 5. Remove Permission (Replaces DELETE)
export async function removeEtlPermissionAction(permissionId: string) {
    try {
        const { client } = await getScopeClient();
        const { error } = await client.from("etl_has_permissions").delete().eq("id", permissionId);
        if (error) throw error;
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

// 6. Delete ETL
export async function deleteEtlAction(etlId: string) {
    try {
        const { client, user } = await getScopeClient();

        // Check ownership or admin status before deleting
        // Admin via 'getScopeClient' usually bypasses, but good to be explicit if needed.
        // Assuming RLS or getScopeClient handles checking if user can delete.
        // Usually only owner or admin can delete. 
        // If RLS is set up for 'etl' table deletion, direct delete is fine.
        
        // If RLS is set up for 'etl' table deletion, direct delete is fine.
        
        // 1. Fetch ETL to find the output table
        // We select 'content' and 'output_table' (if it exists) to determine the table name.
        const { data: etl } = await client.from("etl").select("content, output_table").eq("id", etlId).single();
        
        let targetTableName: string | undefined;

        if (etl?.output_table) {
            targetTableName = etl.output_table;
        } else if (etl?.content) {
            // Fallback: Parse content
            let content: any = etl.content;
            if (typeof content === "string") {
                try { content = JSON.parse(content); } catch {}
            }
            
            let widgets: any[] = [];
            if (Array.isArray(content)) widgets = content;
            else if (Array.isArray(content?.widgets)) widgets = content.widgets;
            
            const endNode = widgets.find((w: any) => w.type === "end");
            targetTableName = endNode?.end?.target?.table;
        }

        if (targetTableName) {
             // 2. Drop table using direct SQL connection
             const sql = postgres(process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL!);
             try {
                 await sql`DROP TABLE IF EXISTS etl_output.${sql(targetTableName)}`;
             } catch (err) {
                 console.error("Error dropping table:", err);
             } finally {
                 await sql.end();
             }
        }
        
        const { error } = await client.from("etl").delete().eq("id", etlId);
        if (error) throw error;
        
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}
