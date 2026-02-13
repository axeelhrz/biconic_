"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import RenameEtlModal from "./RenameEtlModal";

interface EtlTitleWithEditProps {
  etlId: string;
  initialTitle: string;
}

export default function EtlTitleWithEdit({
  etlId,
  initialTitle,
}: EtlTitleWithEditProps) {
  const [title, setTitle] = useState(initialTitle);
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}>
        <span style={{ color: "var(--platform-fg-muted)" }}>ETL /</span>
        <span className="font-semibold">{title}</span>
        <button
          onClick={() => setIsModalOpen(true)}
          className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:opacity-80"
          style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}
          title="Renombrar ETL"
          aria-label="Renombrar ETL"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      <RenameEtlModal
        etlId={etlId}
        currentTitle={title}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onRenamed={(newTitle) => setTitle(newTitle)}
      />
    </>
  );
}
