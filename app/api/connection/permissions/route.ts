import { NextResponse } from "next/server";

// Create Supabase server client on demand per request
async function getServerClient() {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

// Helper: Verify current user has UPDATE permission on the Connection
async function verifyUpdatePermission(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  userId: string,
  connectionId: string
): Promise<boolean> {
  console.log(`[API Permissions] Verificando acceso UPDATE. User: ${userId}, Conn: ${connectionId}`);

  // 1. Check if user is APP_ADMIN
  const { data: profile } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .single();
    
  if (profile?.app_role === "APP_ADMIN") {
      console.log("[API Permissions] Acceso concedido: Es APP_ADMIN");
      return true;
  }

  // 2. Find Connection's client AND Owner
  const { data: connRow, error: connErr } = await supabase
    .from("connections")
    .select("client_id, user_id")
    .eq("id", connectionId)
    .maybeSingle();

  if (connErr || !connRow?.client_id) {
    console.error("[API Permissions] Error buscando conexión o client_id:", connErr);
    return false;
  }

  // --- CORRECCIÓN CRÍTICA: Validar si es el dueño ---
  if (connRow.user_id === userId) {
    console.log("[API Permissions] Acceso concedido: Es el DUEÑO (Owner)");
    return true;
  }
  // -------------------------------------------------

  // 3. Find the client_member id for this user within the same client
  const { data: memberRow, error: memberErr } = await supabase
    .from("client_members")
    .select("id")
    .eq("user_id", userId)
    .eq("client_id", connRow.client_id)
    .maybeSingle();

  if (memberErr || !memberRow?.id) {
    console.warn("[API Permissions] Usuario no es miembro del cliente de esta conexión.");
    return false;
  }

  // 4. Check permission type UPDATE
  const { data: permRows, error: permErr } = await supabase
    .from("connection_has_permissions")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("client_member_id", memberRow.id)
    .eq("permission_type", "UPDATE")
    .limit(1);

  if (permErr) {
    console.error("[API Permissions] Error verificando tabla de permisos:", permErr);
    return false;
  }
  
  const hasPermission = (permRows?.length ?? 0) > 0;
  if (!hasPermission) {
    console.warn("[API Permissions] Acceso Denegado: No tiene permiso UPDATE explícito.");
  } else {
    console.log("[API Permissions] Acceso concedido: Permiso explícito encontrado.");
  }

  return hasPermission;
}

export async function GET(req: Request) {
  const supabase = await getServerClient();

  // Auth
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    console.error("[API Permissions] GET: No autorizado", authErr);
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get("connectionId") || "";
  if (!connectionId) {
    return NextResponse.json(
      { ok: false, error: "Falta connectionId" },
      { status: 400 }
    );
  }

  const canUpdate = await verifyUpdatePermission(
    supabase,
    userData.user.id,
    connectionId
  );
  if (!canUpdate) {
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  // Fetch permissions for this Connection
  const { data: perms, error: permsErr } = await supabase
    .from("connection_has_permissions")
    .select("id, client_member_id, permission_type, created_at")
    .eq("connection_id", connectionId);

  if (permsErr) {
    console.error("[API Permissions] GET: Error fetching perms", permsErr);
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
  const { data: members, error: membersErr } = await supabase
    .from("client_members")
    .select("id, user_id, role")
    .in("id", clientMemberIds);

  if (membersErr) {
    console.error("[API Permissions] GET: Error fetching members", membersErr);
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
    console.error("[API Permissions] GET: Error fetching profiles", profilesErr);
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
      is_active: true, // Hardcoded as true
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
  console.log("[API Permissions] POST: Iniciando petición...");

  // Auth
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    console.error("[API Permissions] POST: Auth error", authErr);
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  console.log("[API Permissions] POST Body:", body);

  const connectionId: string | undefined = body?.connectionId;
  const targetUserId: string | undefined = body?.targetUserId;
  const permissionType: "VIEW" | "UPDATE" =
    body?.permissionType === "UPDATE" ? "UPDATE" : "VIEW";

  if (!connectionId || !targetUserId) {
    console.error("[API Permissions] POST: Parámetros inválidos");
    return NextResponse.json(
      { ok: false, error: "Parámetros inválidos" },
      { status: 400 }
    );
  }

  // Verificar Permiso de quien ejecuta la acción
  const canUpdate = await verifyUpdatePermission(
    supabase,
    userData.user.id,
    connectionId
  );
  
  if (!canUpdate) {
    console.error(`[API Permissions] POST: Usuario ${userData.user.id} no tiene permiso para editar conexión ${connectionId}`);
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  // Find Connection client
  const { data: connRow, error: connErr } = await supabase
    .from("connections")
    .select("client_id")
    .eq("id", connectionId)
    .maybeSingle();

  if (connErr || !connRow?.client_id) {
    console.error("[API Permissions] POST: Conexión no encontrada o sin cliente", connErr);
    return NextResponse.json(
      { ok: false, error: "Conexión no encontrada" },
      { status: 404 }
    );
  }

  // Find target user's client_member within same client
  const { data: targetMember, error: targetMemberErr } = await supabase
    .from("client_members")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("client_id", connRow.client_id)
    .maybeSingle();

  if (targetMemberErr || !targetMember?.id) {
    console.error(`[API Permissions] POST: Target User ${targetUserId} no es miembro del cliente ${connRow.client_id}`);
    return NextResponse.json(
      { ok: false, error: "Usuario no pertenece al cliente" },
      { status: 404 }
    );
  }

  // Insert permission
  console.log(`[API Permissions] POST: Insertando permiso ${permissionType} para miembro ${targetMember.id}`);
  const { data: inserted, error: insertErr } = await supabase
    .from("connection_has_permissions")
    .insert({
      connection_id: connectionId,
      client_member_id: targetMember.id,
      permission_type: permissionType,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    console.error("[API Permissions] POST: Error insertando permiso", insertErr);
    if ((insertErr as any).code === "23505") {
      return NextResponse.json(
        { ok: false, error: "El permiso ya existe" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "Error al crear permiso: " + insertErr.message },
      { status: 500 }
    );
  }

  console.log("[API Permissions] POST: Éxito. ID:", inserted?.id);
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
  console.log("[API Permissions] DELETE Body:", body);

  const permissionId: string | undefined = body?.permissionId;
  const connectionId: string | undefined = body?.connectionId;

  if (!permissionId || !connectionId) {
    return NextResponse.json(
      { ok: false, error: "Parámetros inválidos" },
      { status: 400 }
    );
  }

  const canUpdate = await verifyUpdatePermission(
    supabase,
    userData.user.id,
    connectionId
  );
  if (!canUpdate) {
    console.error(`[API Permissions] DELETE: Prohibido para user ${userData.user.id}`);
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  const { error: delErr } = await supabase
    .from("connection_has_permissions")
    .delete()
    .eq("id", permissionId);

  if (delErr) {
    console.error("[API Permissions] DELETE: Error DB", delErr);
    return NextResponse.json(
      { ok: false, error: "Error al eliminar permiso" },
      { status: 500 }
    );
  }

  console.log("[API Permissions] DELETE: Éxito");
  return NextResponse.json({ ok: true }, { status: 200 });
}