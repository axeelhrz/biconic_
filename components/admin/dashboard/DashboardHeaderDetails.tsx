"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { updateDashboardTitle } from "@/app/admin/(main)/dashboard/actions";
import { toast } from "sonner";

interface DashboardHeaderDetailsProps {
    dashboardId: string;
    etlName?: string | null;
    title?: string;
}

export function DashboardHeaderDetails({ dashboardId, etlName, title: initialTitle }: DashboardHeaderDetailsProps) {
    const [title, setTitle] = useState(initialTitle || "");
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSaveTitle = async () => {
        if (!title.trim() || title === initialTitle) {
            setIsEditing(false);
            return;
        }

        setIsLoading(true);
        try {
            const res = await updateDashboardTitle(dashboardId, title);
            if (!res.ok) {
                toast.error(res.error || "Error al actualizar el título");
                setTitle(initialTitle || ""); // Revert on error
            } else {
                toast.success("Título actualizado");
            }
        } catch (error) {
            console.error(error);
            toast.error("Error inesperado");
        } finally {
            setIsLoading(false);
            setIsEditing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleSaveTitle();
        } else if (e.key === "Escape") {
            setTitle(initialTitle || "");
            setIsEditing(false);
        }
    }

    return (
        <>
            {" "}
            <span className="font-medium text-gray-900 mx-1">
                {isEditing ? (
                    <Input 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleSaveTitle}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        disabled={isLoading}
                        className="h-6 w-48 inline-block text-sm"
                    />
                ) : (
                    <span 
                        onClick={() => setIsEditing(true)} 
                        className="cursor-pointer hover:bg-gray-100 px-1 rounded transition-colors border border-transparent hover:border-gray-200"
                        title="Clic para editar"
                    >
                        {title || "Sin título"}
                    </span>
                )}
            </span>
            {etlName && (
                <>
                    {" "}
                    / ETL:{" "}
                    <span className="font-medium text-purple-600">{etlName}</span>
                </>
            )}
        </>
    );
}
