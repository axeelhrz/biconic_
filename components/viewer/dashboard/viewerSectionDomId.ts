/** id estable para anclas / ?client= y scrollIntoView */
export function viewerSectionDomId(clientId: string | null) {
  return clientId ? `viewer-client-${clientId}` : "viewer-client-otros";
}
