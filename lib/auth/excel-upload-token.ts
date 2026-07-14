import { SignJWT, jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/auth/jwt-config";

export type ExcelUploadTokenPayload = {
  purpose: "excel-upload";
  key: string;
  connectionId: string;
  fileSize?: number;
};

export async function createExcelUploadToken(input: {
  userId: string;
  storagePath: string;
  connectionId: string;
  fileSize?: number;
}): Promise<string> {
  return new SignJWT({
    purpose: "excel-upload",
    key: input.storagePath,
    connectionId: input.connectionId,
    ...(input.fileSize && input.fileSize > 0 ? { fileSize: input.fileSize } : {}),
  } satisfies ExcelUploadTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(getJwtSecretKey());
}

export async function verifyExcelUploadToken(
  token: string
): Promise<ExcelUploadTokenPayload & { sub: string }> {
  const { payload } = await jwtVerify(token, getJwtSecretKey());
  if (payload.purpose !== "excel-upload") {
    throw new Error("Token de subida inválido");
  }
  const key = String(payload.key ?? "");
  const connectionId = String(payload.connectionId ?? "");
  const sub = String(payload.sub ?? "");
  if (!key || !connectionId || !sub) {
    throw new Error("Token de subida incompleto");
  }
  return {
    purpose: "excel-upload",
    key,
    connectionId,
    sub,
  };
}
