import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBackendApiUrl, shouldUseOwnBackend } from "./backend-config";

export { shouldUseOwnBackend };

export async function proxyToBackend(
  req: NextRequest,
  path: string,
  init?: RequestInit
) {
  const url = `${getBackendApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);

  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const authorization = req.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);

  const method = init?.method ?? req.method;
  let body: BodyInit | undefined = init?.body as BodyInit | undefined;
  if (!body && method !== "GET" && method !== "HEAD") {
    body = await req.text();
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, credentials: "include" });
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo conectar con el backend. Comprueba que esté corriendo en el puerto 4000.",
      },
      { status: 503 }
    );
  }
  const text = await res.text();
  const response = new NextResponse(text, { status: res.status });

  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    response.headers.append("set-cookie", c);
  }

  const resContentType = res.headers.get("content-type");
  if (resContentType) response.headers.set("content-type", resContentType);

  return response;
}
