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
      <div className="flex items-center gap-2 text-gray-600 text-sm">
        <span className="opacity-75">ETL /</span>
        <span className="font-medium text-gray-900">{title}</span>
        <button
          onClick={() => setIsModalOpen(true)}
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-gray-100 transition-colors"
          title="Renombrar ETL"
          aria-label="Renombrar ETL"
        >
          <Pencil className="h-3.5 w-3.5 text-gray-500" />
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
