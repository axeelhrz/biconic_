import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { tableName } = body;

    // TODO: Add robust permission checks here. 
    // Ideally, check if the user has access to the ETL or Dashboard that produced this table.
    // For now, we rely on Supabase RLS and ensuring only authorized users can call this via app UI.
    // However, since ETL output tables might be in schemas governed by broader roles, 
    // we should ensure this endpoint is only accessible to authenticated users.

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!tableName || typeof tableName !== "string") {
      return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
    }

    // Safety check: prohibit querying system tables or strange paths
    if (tableName.includes(";") || tableName.includes("--")) {
        return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
    }

    // Query the table dynamically
    // If tableName is "schema.table", split it to use schema() method
    // Otherwise, use the table name directly
    const parts = tableName.split('.');
    let queryBuilder;
    
    if (parts.length === 2) {
        queryBuilder = supabase.schema(parts[0] as any).from(parts[1] as any);
    } else {
        queryBuilder = supabase.from(tableName as any);
    }

    const { data: rows, error: queryError } = await queryBuilder.select("*").limit(100);

    if (queryError) {
        console.error("Error querying table:", queryError);
        return NextResponse.json({ error: queryError.message }, { status: 500 });
    }
    
    // Extract columns from first row if available
    let columns: string[] = [];
    if (rows && rows.length > 0) {
        columns = Object.keys(rows[0]);
    }

    return NextResponse.json({ rows, columns });

  } catch (e: any) {
    console.error("API Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
