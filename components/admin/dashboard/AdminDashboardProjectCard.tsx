import Image from "next/image";
import Link from "next/link";
import EllipsisHorizontalIcon from "@/components/icons/EllipsisHorizontalIcon";
import * as React from "react";

// Definimos el tipo de datos que espera la tarjeta
export interface Dashboard {
  id: string;
  title: string;
  imageUrl: string;
  status: "Publicado" | "Borrador";
  description: string;
  company: string;
  peopleCount: number;
}

// Icono simple de usuarios (grupo) inline para evitar dependencias extras
function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 20a8 8 0 1 1 16 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// El componente recibe un objeto de tipo Dashboard
export default function AdminDashboardProjectCard({
  dashboard,
}: {
  dashboard: Dashboard;
}) {
  const { id, title, imageUrl, status, description, company, peopleCount } =
    dashboard;

  const statusClasses =
    status === "Publicado"
      ? "bg-[var(--platform-success-dim)] text-[var(--platform-success)]"
      : status === "Borrador"
      ? "bg-[var(--platform-warning)]/20 text-[var(--platform-warning)]"
      : "bg-[var(--platform-surface-hover)] text-[var(--platform-fg-muted)]";

  return (
    <Link
      href={`/admin/dashboard/${id}`}
      aria-label={`Abrir dashboard ${title}`}
      className="flex w-full flex-col overflow-hidden rounded-[15px] border transition-shadow hover:border-[var(--platform-accent)]"
      style={{
        background: "var(--platform-surface)",
        borderColor: "var(--platform-border)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
      }}
    >
      <div className="relative h-[193px] w-full">
        <Image
          src={imageUrl}
          alt={`Vista previa de ${title}`}
          fill
          className="object-cover"
        />
      </div>

      <div className="flex flex-col gap-2.5 p-5">
        <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>{title}</h3>
        <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{company}</p>
        <span
          className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses}`}
        >
          {status}
        </span>
        <p className="h-8 text-xs font-normal" style={{ color: "var(--platform-fg-muted)" }}>{description}</p>
        <hr className="my-1 border-t" style={{ borderColor: "var(--platform-border)" }} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5" style={{ color: "var(--platform-fg-muted)" }}>
            <UsersIcon className="h-4 w-4" />
            <span className="text-[10px] font-normal">{peopleCount} personas</span>
          </div>
          <button
            className="opacity-70 hover:opacity-100"
            style={{ color: "var(--platform-fg-muted)" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </Link>
  );
}
