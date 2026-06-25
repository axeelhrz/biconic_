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
