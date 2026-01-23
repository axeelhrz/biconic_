import { NextResponse } from "next/server";
import { Database } from "@/lib/supabase/database.types";

type AppPermissionType = Database["public"]["Enums"]["app_permission_type"];

// Create Supabase server client on demand per request
async function getServerClient() {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

// Helper: Verify current user has UPDATE permission on the ETL
async function verifyUpdatePermission(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  userId: string,
  etlId: string
): Promise<boolean> {
  console.log("[verifyUpdatePermission] Checking for", { userId, etlId });

  // 1. Check if user is APP_ADMIN first (Global Override)
  const { data: profile } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .single();
  
  if (profile?.app_role === "APP_ADMIN") {
      console.log("[verifyUpdatePermission] Access granted via APP_ADMIN");
      return true;
  }

  // Find ETL's client
  const { data: etlRow, error: etlErr } = await supabase
    .from("etl")
    .select("client_id")
    .eq("id", etlId)
    .maybeSingle();

  if (etlErr || !etlRow?.client_id) {
    console.log("[verifyUpdatePermission] ETL or Client not found", { etlErr, etlRow });
    return false;
  }

  // Find the client_member id for this user within the same client
  const { data: memberRow, error: memberErr } = await supabase
    .from("client_members")
    .select("id")
    .eq("user_id", userId)
    .eq("client_id", etlRow.client_id)
    .maybeSingle();

  if (memberErr || !memberRow?.id) {
    console.log("[verifyUpdatePermission] Member not found for user in client", { memberErr, clientId: etlRow.client_id });
    return false;
  }

  // Check permission type UPDATE
  const { data: permRows, error: permErr } = await supabase
    .from("etl_has_permissions")
    .select("id")
    .eq("etl_id", etlId)
    .eq("client_member_id", memberRow.id)
    .eq("permission_type", "UPDATE")
    .limit(1);

  if (permErr) {
    console.log("[verifyUpdatePermission] Error checking permissions table", permErr);
    return false;
  }
  
  const hasPerm = (permRows?.length ?? 0) > 0;
  console.log("[verifyUpdatePermission] Result", { hasPerm });
  return hasPerm;
}

export async function GET(req: Request) {
  const supabase = await getServerClient();

  // Auth
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const etlId = searchParams.get("etlId") || "";
  const action = searchParams.get("action");

  if (!etlId) {
    return NextResponse.json(
      { ok: false, error: "Falta etlId" },
      { status: 400 }
    );
  }

  // --- ACTION: CANDIDATES ---
  if (action === "candidates") {
    try {
      // 1. Check if user is APP_ADMIN
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("app_role")
        .eq("id", userData.user.id)
        .single();

      const isAppAdmin = userProfile?.app_role === "APP_ADMIN";

      // 2. Initialize Scope Client (Service Role for Admin)
      let scopeSupabase = supabase;
      if (isAppAdmin) {
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (serviceRoleKey) {
            const { createServerClient } = await import("@supabase/ssr");
            const { cookies } = await import("next/headers");
            const cookieStore = await cookies();
            
            scopeSupabase = createServerClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                serviceRoleKey,
                {
                    cookies: {
                        getAll() { return cookieStore.getAll() },
                        setAll(cookiesToSet) {}
                    }
                }
            ) as any;
          } else {
             console.warn("SUPABASE_SERVICE_ROLE_KEY not found, falling back to user client");
          }
      } else {
        // If not admin, check permissions using regular client
        const canUpdate = await verifyUpdatePermission(
          supabase,
          userData.user.id,
          etlId
        );
        if (!canUpdate) {
          return NextResponse.json(
            { ok: false, error: "Prohibido" },
            { status: 403 }
          );
        }
      }

      // 3. Get connection/client info (USING SCOPE CLIENT)
      const { data: etlRow, error: etlErr } = await scopeSupabase
        .from("etl")
        .select("client_id")
        .eq("id", etlId)
        .single();

      if (etlErr || !etlRow?.client_id) {
         console.warn("[Candidates] ETL fetch failed", { etlErr, etlId, isAdmin: isAppAdmin });
         return NextResponse.json(
          { ok: false, error: "ETL no encontrado o sin cliente" },
          { status: 404 }
        );
      }

      // 4. Fetch Members
      const { data: members, error: membersErr } = await scopeSupabase
        .from("client_members")
        .select("id, user_id, role")
        .eq("client_id", etlRow.client_id);
        
      if (membersErr) {
          console.error("Error fetching members", membersErr);
          return NextResponse.json({ ok: false, error: membersErr.message }, { status: 500 });
      }

      const userIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
      
      if (userIds.length === 0) {
          return NextResponse.json({ ok: true, candidates: [] });
      }

      const { data: profiles, error: profilesErr } = await scopeSupabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

      if (profilesErr) {
          console.error("Error fetching profiles", profilesErr);
          return NextResponse.json({ ok: false, error: profilesErr.message }, { status: 500 });
      }

      const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      const candidates = (members ?? []).map((m: any) => {
          const p = profileById.get(m.user_id);
          return {
              client_member_id: m.id,
              userId: m.user_id,
              full_name: p?.full_name ?? null,
              email: p?.email ?? null,
              role: m.role ?? null,
          };
      });

      return NextResponse.json({ ok: true, candidates });

    } catch (e: any) {
        console.error("Exception in candidates action:", e);
        return NextResponse.json({ ok: false, error: e.message || "Internal Server Error" }, { status: 500 });
    }
  }

  // --- DEFAULT: FETCH PERMISSIONS ---
  
  const canUpdate = await verifyUpdatePermission(
    supabase,
    userData.user.id,
    etlId
  );
  if (!canUpdate) {
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  // Fetch permissions for this ETL
  const { data: perms, error: permsErr } = await supabase
    .from("etl_has_permissions")
    .select("id, client_member_id, permission_type, created_at")
    .eq("etl_id", etlId);

  if (permsErr) {
    return NextResponse.json(
      { ok: false, error: "Error al obtener permisos" },
      { status: 500 }
    );
  }

  if (!perms || perms.length === 0) {
    return NextResponse.json({ ok: true, permissions: [] }, { status: 200 });
  }

  // Fetch related client_members
  const clientMemberIds = Array.from(
    new Set(perms.map((p) => p.client_member_id).filter(Boolean))
  ) as string[];
  
  // Use admin client if needed here too? Probably not, since "permissions" usually viewable by owners.
  // But if RLS blocks `client_members` read for owners... 
  // The user said "No hay RLS en las tablas". So regular client should work.
  // We'll stick to regular client here to minimize risk of side effects.
  
  const { data: members, error: membersErr } = await supabase
    .from("client_members")
    .select("id, user_id, role")
    .in("id", clientMemberIds);

  if (membersErr) {
    return NextResponse.json(
      { ok: false, error: "Error al obtener miembros" },
      { status: 500 }
    );
  }

  const userIds = Array.from(
    new Set((members ?? []).map((m) => m.user_id).filter(Boolean))
  ) as string[];
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profilesErr) {
    return NextResponse.json(
      { ok: false, error: "Error al obtener perfiles" },
      { status: 500 }
    );
  }

  const memberById = new Map((members ?? []).map((m) => [m.id, m]));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const result = perms.map((p) => {
    const member = memberById.get(p.client_member_id as string);
    const profile = member
      ? profileById.get(member.user_id as string)
      : undefined;
    return {
      id: p.id,
      client_member_id: p.client_member_id,
      permission_type: p.permission_type,
      is_active: true, // Hardcoded as true since table lacks column
      created_at: p.created_at,
      client_member_role: member?.role ?? null,
      user: profile
        ? { id: profile.id, full_name: profile.full_name, email: profile.email }
        : null,
    };
  });

  return NextResponse.json({ ok: true, permissions: result }, { status: 200 });
}

export async function POST(req: Request) {
  const supabase = await getServerClient();

  // Auth
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const etlId: string | undefined = body?.etlId;
  const targetUserId: string | undefined = body?.targetUserId;
  const permissionType: AppPermissionType =
    body?.permissionType === "UPDATE" ? "UPDATE" : "VIEW";

  if (!etlId || !targetUserId) {
    return NextResponse.json(
      { ok: false, error: "Parámetros inválidos" },
      { status: 400 }
    );
  }

  // 1. Check Admin & Init Scope Client
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", userData.user.id)
    .single();

  const isAppAdmin = userProfile?.app_role === "APP_ADMIN";
  let scopeSupabase = supabase;

  if (isAppAdmin) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey) {
        const { createServerClient } = await import("@supabase/ssr");
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        
        scopeSupabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll(cookiesToSet) {}
                }
            }
        ) as any;
      }
  }

  // 2. Verify Permission
  const canUpdate = await verifyUpdatePermission(
    scopeSupabase, // Use scope client (Service Role if Admin)
    userData.user.id,
    etlId
  );
  if (!canUpdate) {
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  // 3. Find ETL client (Using Scope Client)
  const { data: etlRow, error: etlErr } = await scopeSupabase
    .from("etl")
    .select("client_id, user_id")
    .eq("id", etlId)
    .maybeSingle();

  if (etlErr || !etlRow) {
    console.warn("[POST Permission] ETL not found", { etlId, error: etlErr });
    return NextResponse.json(
      { ok: false, error: "ETL no encontrado" },
      { status: 404 }
    );
  }

  let effectiveClientId = etlRow.client_id;
  
  // Fallback: If no client_id, try to derive from owner
  if (!effectiveClientId && etlRow.user_id) {
       console.log("[POST Permission] Orphan ETL, deriving client from owner", etlRow.user_id);
       const { data: ownerMember } = await scopeSupabase
            .from("client_members")
            .select("client_id")
            .eq("user_id", etlRow.user_id)
            .maybeSingle();
       
       if (ownerMember?.client_id) {
           effectiveClientId = ownerMember.client_id;
           console.log("[POST Permission] Derived client_id:", effectiveClientId);
       }
  }

  if (!effectiveClientId) {
      console.warn("[POST Permission] No client context found for ETL", etlId);
      return NextResponse.json(
          { ok: false, error: "ETL sin cliente asignado y sin dueño con cliente" },
          { status: 404 }
      );
  }

  // 4. Find target user's client_member within same client
  const { data: targetMember, error: targetMemberErr } = await scopeSupabase
    .from("client_members")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("client_id", effectiveClientId)
    .maybeSingle();

  if (targetMemberErr || !targetMember?.id) {
    return NextResponse.json(
      { ok: false, error: "Usuario no pertenece al cliente" },
      { status: 404 }
    );
  }

  // 5. Insert permission
  const { data: inserted, error: insertErr } = await scopeSupabase
    .from("etl_has_permissions")
    .insert({
      etl_id: etlId,
      client_member_id: targetMember.id,
      permission_type: permissionType,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    if ((insertErr as any).code === "23505") {
      return NextResponse.json(
        { ok: false, error: "El permiso ya existe" },
        { status: 409 }
      );
    }
    console.error("[POST Permission] Insert failed", insertErr);
    return NextResponse.json(
      { ok: false, error: "Error al crear permiso" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: inserted?.id }, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await getServerClient();

  // Auth
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const permissionId: string | undefined = body?.permissionId;
  const etlId: string | undefined = body?.etlId;

  if (!permissionId || !etlId) {
    return NextResponse.json(
      { ok: false, error: "Parámetros inválidos" },
      { status: 400 }
    );
  }

  const canUpdate = await verifyUpdatePermission(
    supabase,
    userData.user.id,
    etlId
  );
  if (!canUpdate) {
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  const { error: delErr } = await supabase
    .from("etl_has_permissions")
    .delete()
    .eq("id", permissionId);

  if (delErr) {
    return NextResponse.json(
      { ok: false, error: "Error al eliminar permiso" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
