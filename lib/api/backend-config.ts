export function shouldUseOwnBackend(): boolean {
  return true;
}

export function getBackendApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:4000/v1"
  ).replace(/\/$/, "");
}

/** URL pública del backend para llamadas desde el navegador. */
export function getPublicBackendApiUrl(): string {
  if (typeof window !== "undefined") {
    return (
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1"
    ).replace(/\/$/, "");
  }
  return getBackendApiUrl();
}
