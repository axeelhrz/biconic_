
import React from 'react';

interface DashboardTextWidgetProps {
    content: string;
    isEditing?: boolean;
    onContentChange?: (newContent: string) => void;
    className?: string;
}

export function DashboardTextWidget({
    content,
    isEditing = false,
    onContentChange,
    className = ""
}: DashboardTextWidgetProps) {
    return (
        <div className={`w-full h-full overflow-auto ${className}`}>
             {isEditing ? (
                <textarea
                    className="w-full h-full p-2 border-0 resize-none focus:outline-none bg-transparent text-sm font-normal text-foreground"
                    value={content}
                    onChange={(e) => onContentChange?.(e.target.value)}
                    placeholder="Escribe texto aquí..."
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                />
            ) : (
                <div className="whitespace-pre-wrap text-sm p-2 text-foreground">
                    {content || "Sin texto"}
                </div>
            )}
        </div>
    );
}
