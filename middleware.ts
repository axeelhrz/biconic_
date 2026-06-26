import { updateJwtSession } from "@/lib/auth/jwt-middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateJwtSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|geo/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|geojson|json)|public.*|api/public.*|api/admin/connections/excel-upload(?:/init)?|api/upload-excel).*)",
  ],
};
