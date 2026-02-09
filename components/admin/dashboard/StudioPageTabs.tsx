"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export type StudioPage = { id: string; name: string };

type StudioPageTabsProps = {
  pages: StudioPage[];
  activePageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (pageId: string) => void;
};

export function StudioPageTabs({
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  onRenamePage,
  onDeletePage,
}: StudioPageTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const startEdit = (page: StudioPage) => {
    setEditingId(page.id);
    setEditName(page.name);
  };

  const submitEdit = (pageId: string) => {
    if (editName.trim()) onRenamePage(pageId, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  const canDelete = pages.length > 1;

  return (
    <div className="studio-page-tabs flex flex-shrink-0 items-center gap-1 border-b border-[var(--studio-border)] bg-[var(--studio-bg-elevated)] px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {pages.map((page) => (
          <div
            key={page.id}
            className="studio-page-tab group relative flex shrink-0 items-center gap-1 rounded-t-lg border border-b-0 border-transparent px-3 py-2"
            data-active={activePageId === page.id ? "true" : undefined}
          >
            {editingId === page.id ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => submitEdit(page.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitEdit(page.id);
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditName("");
                  }
                }}
                className="h-7 w-32 border-[var(--studio-border)] bg-[var(--studio-surface)] text-[var(--studio-fg)] text-sm"
                autoFocus
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSelectPage(page.id)}
                  className={`studio-page-tab-btn text-sm font-medium transition-colors ${
                    activePageId === page.id
                      ? "text-[var(--studio-accent)]"
                      : "text-[var(--studio-fg-muted)] hover:text-[var(--studio-fg)]"
                  }`}
                >
                  {page.name}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100 text-[var(--studio-muted)] hover:text-[var(--studio-fg)]"
                      aria-label="Opciones de página"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="studio-header-menu-content min-w-[160px] rounded-lg border-[var(--studio-border)] bg-[var(--studio-surface)] p-1 shadow-xl">
                    <DropdownMenuItem
                      className="rounded-lg text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                      onClick={(e) => {
                        e.preventDefault();
                        startEdit(page);
                      }}
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Renombrar
                    </DropdownMenuItem>
                    {canDelete && (
                      <DropdownMenuItem
                        className="rounded-lg text-[var(--studio-danger)] focus:bg-red-500/10 focus:text-[var(--studio-danger)]"
                        onClick={(e) => {
                          e.preventDefault();
                          onDeletePage(page.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Eliminar página
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 text-[var(--studio-muted)] hover:bg-[var(--studio-surface)] hover:text-[var(--studio-accent)]"
        onClick={onAddPage}
        aria-label="Nueva página"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Nueva página
      </Button>
    </div>
  );
}
