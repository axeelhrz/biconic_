import { NextResponse } from "next/server";

// Create Supabase server client on demand per request
async function getServerClient() {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

// Helper: Verify current user has UPDATE permission on the dashboard
async function verifyUpdatePermission(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  userId: string,
  dashboardId: string
): Promise<boolean> {
  // Find dashboard's client
  const { data: dashboardRow, error: dashErr } = await supabase
    .from("dashboard")
    .select("client_id")
    .eq("id", dashboardId)
    .maybeSingle();

  if (dashErr || !dashboardRow?.client_id) return false;

  // Find the client_member id for this user within the same client
  const { data: memberRow, error: memberErr } = await supabase
    .from("client_members")
    .select("id")
    .eq("user_id", userId)
    .eq("client_id", dashboardRow.client_id)
    .maybeSingle();

  if (memberErr || !memberRow?.id) return false;

  // Check permission type UPDATE and is_active true
  const { data: permRows, error: permErr } = await supabase
    .from("dashboard_has_client_permissions")
    .select("id")
    .eq("dashboard_id", dashboardId)
    .eq("client_member_id", memberRow.id)
    .eq("permission_type", "UPDATE")
    .eq("is_active", true)
    .limit(1);

  if (permErr) return false;
  return (permRows?.length ?? 0) > 0;
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
  const dashboardId = searchParams.get("dashboardId") || "";
  if (!dashboardId) {
    return NextResponse.json(
      { ok: false, error: "Falta dashboardId" },
      { status: 400 }
    );
  }

  const canUpdate = await verifyUpdatePermission(
    supabase,
    userData.user.id,
    dashboardId
  );
  if (!canUpdate) {
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  // Fetch permissions for this dashboard
  const { data: perms, error: permsErr } = await supabase
    .from("dashboard_has_client_permissions")
    .select("id, client_member_id, permission_type, is_active, created_at")
    .eq("dashboard_id", dashboardId);

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
      is_active: p.is_active,
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
  const dashboardId: string | undefined = body?.dashboardId;
  const targetUserId: string | undefined = body?.targetUserId;
  const permissionType: "VIEW" | "UPDATE" =
    body?.permissionType === "UPDATE" ? "UPDATE" : "VIEW";

  if (!dashboardId || !targetUserId) {
    return NextResponse.json(
      { ok: false, error: "Parámetros inválidos" },
      { status: 400 }
    );
  }

  const canUpdate = await verifyUpdatePermission(
    supabase,
    userData.user.id,
    dashboardId
  );
  if (!canUpdate) {
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  // Find dashboard client
  const { data: dashboardRow, error: dashErr } = await supabase
    .from("dashboard")
    .select("client_id")
    .eq("id", dashboardId)
    .maybeSingle();

  if (dashErr || !dashboardRow?.client_id) {
    return NextResponse.json(
      { ok: false, error: "Dashboard no encontrado" },
      { status: 404 }
    );
  }

  // Find target user's client_member within same client
  const { data: targetMember, error: targetMemberErr } = await supabase
    .from("client_members")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("client_id", dashboardRow.client_id)
    .maybeSingle();

  if (targetMemberErr || !targetMember?.id) {
    return NextResponse.json(
      { ok: false, error: "Usuario no pertenece al cliente" },
      { status: 404 }
    );
  }

  // Insert permission
  const { data: inserted, error: insertErr } = await supabase
    .from("dashboard_has_client_permissions")
    .insert({
      dashboard_id: dashboardId,
      client_member_id: targetMember.id,
      permission_type: permissionType,
      is_active: true,
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
  const dashboardId: string | undefined = body?.dashboardId;

  if (!permissionId || !dashboardId) {
    return NextResponse.json(
      { ok: false, error: "Parámetros inválidos" },
      { status: 400 }
    );
  }

  const canUpdate = await verifyUpdatePermission(
    supabase,
    userData.user.id,
    dashboardId
  );
  if (!canUpdate) {
    return NextResponse.json(
      { ok: false, error: "Prohibido" },
      { status: 403 }
    );
  }

  const { error: delErr } = await supabase
    .from("dashboard_has_client_permissions")
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
