export const UNASSIGNED_CLIENT_ID = "__unassigned__";
export const UNASSIGNED_CLIENT_LABEL = "Sin cliente asignado";

export type ClientGroupableItem = {
  clientId?: string | null;
  clientLabel?: string | null;
};

export type ClientItemGroup<T> = {
  clientId: string | null;
  clientLabel: string;
  items: T[];
};

export function clientDisplayName(row: {
  company_name?: string | null;
  individual_full_name?: string | null;
  type?: string | null;
}): string {
  if (row.type === "empresa" && row.company_name?.trim()) {
    return row.company_name.trim();
  }
  if (row.individual_full_name?.trim()) {
    return row.individual_full_name.trim();
  }
  return row.company_name?.trim() || UNASSIGNED_CLIENT_LABEL;
}

export function groupItemsByClient<T extends ClientGroupableItem>(
  items: T[],
  options?: {
    unassignedLast?: boolean;
    sortItems?: (a: T, b: T) => number;
  }
): ClientItemGroup<T>[] {
  const byKey = new Map<string, ClientItemGroup<T>>();

  for (const item of items) {
    const cid = item.clientId?.trim() || null;
    const key = cid ?? UNASSIGNED_CLIENT_ID;
    const label =
      item.clientLabel?.trim() ||
      (cid ? "Cliente" : UNASSIGNED_CLIENT_LABEL);

    let group = byKey.get(key);
    if (!group) {
      group = { clientId: cid, clientLabel: label, items: [] };
      byKey.set(key, group);
    }
    group.items.push(item);
  }

  const groups = Array.from(byKey.values());
  const unassignedLast = options?.unassignedLast !== false;

  groups.sort((a, b) => {
    const aUn = !a.clientId;
    const bUn = !b.clientId;
    if (aUn !== bUn) {
      return unassignedLast ? (aUn ? 1 : -1) : aUn ? -1 : 1;
    }
    return a.clientLabel.localeCompare(b.clientLabel, "es", { sensitivity: "base" });
  });

  const sortItems =
    options?.sortItems ??
    ((a, b) => {
      const titleA = String((a as { title?: string }).title ?? "").trim();
      const titleB = String((b as { title?: string }).title ?? "").trim();
      return titleA.localeCompare(titleB, "es", { sensitivity: "base" });
    });

  for (const group of groups) {
    group.items.sort(sortItems);
  }

  return groups;
}
