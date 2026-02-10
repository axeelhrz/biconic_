import Image from "next/image";
import Link from "next/link";
import * as React from "react";

export interface AdminClientCardData {
  id: string;
  companyName: string;
  status?: string | null; // e.g. "Activo"
  tag?: string | null; // e.g. "Strategy"
  dashboardsCount: number;
  etlsCount: number;
  membersCount: number;
  imageUrl?: string; // optional preview image
}

// Small icons inline (avoid extra deps)
function DashboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 5h16M4 12h10M4 19h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function EtlIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5 7h14M5 12h9M5 17h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
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

export default function AdminClientCard({
  data,
}: {
  data: AdminClientCardData;
}) {
  const {
    id,
    companyName,
    status,
    tag,
    dashboardsCount,
    etlsCount,
    membersCount,
    imageUrl = "/images/biconic-logo.png",
  } = data;

  return (
    <Link href={`/admin/clients/${id}`}>
      <div
        className="flex w-[402px] flex-col overflow-hidden rounded-[15.29px] border transition-shadow hover:border-[var(--platform-accent)]"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
        }}
      >
        <div className="relative h-[190.83px] w-full">
          <Image src={imageUrl} alt={companyName} fill className="object-cover" />
        </div>

        <div className="flex flex-col gap-[15px] p-[19.8px]">
          <h3 className="text-[17.8px] font-semibold leading-[22px]" style={{ color: "var(--platform-accent)" }}>
            {companyName}
          </h3>
          <p className="hidden text-[11.9px] leading-4" style={{ color: "var(--platform-fg-muted)" }}>
            {companyName}
          </p>

          <div className="flex items-start gap-[10px]">
            {status && (
              <span
                className="inline-flex h-6 items-center justify-center rounded-full px-3 py-1 text-[14px] font-medium"
                style={{ background: "var(--platform-success-dim)", color: "var(--platform-success)" }}
              >
                {status}
              </span>
            )}
            {tag && (
              <span
                className="inline-flex h-6 items-center justify-center rounded-full px-3 py-1 text-[14px] font-medium"
                style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
              >
                {tag}
              </span>
            )}
          </div>

          <div className="flex w-full items-start gap-[10px]">
            <div
              className="flex flex-1 flex-col items-center rounded-[20.84px] px-[55.57px] py-[5px]"
              style={{ background: "var(--platform-bg-elevated)" }}
            >
              <div className="flex items-center gap-[3.21px]" style={{ color: "var(--platform-accent)" }}>
                <DashboardIcon className="h-[10.69px] w-[10.69px]" />
                <span className="text-[11px] font-medium leading-[17px]">Dashboards</span>
              </div>
              <div className="text-[12.82px] font-medium leading-[17px]" style={{ color: "var(--platform-fg)" }}>
                {dashboardsCount}
              </div>
            </div>
            <div
              className="flex flex-1 flex-col items-center rounded-[20.84px] px-[55.57px] py-[5px]"
              style={{ background: "var(--platform-bg-elevated)" }}
            >
              <div className="flex items-center gap-[3.21px]" style={{ color: "var(--platform-accent)" }}>
                <EtlIcon className="h-[13px] w-[11px] rotate-180" />
                <span className="text-[11px] font-medium leading-[17px]">ETL</span>
              </div>
              <div className="text-[12.82px] font-medium leading-[17px]" style={{ color: "var(--platform-fg)" }}>
                {etlsCount}
              </div>
            </div>
          </div>

          <hr className="my-1 h-[0.86px] w-full border-0" style={{ background: "var(--platform-border)" }} />

          <div className="flex items-center gap-2" style={{ color: "var(--platform-fg-muted)" }}>
            <div className="flex -space-x-2">
              <div
                className="h-6 w-6 rounded-full border-2"
                style={{ borderColor: "var(--platform-surface)", background: "var(--platform-surface-hover)" }}
              />
              <div
                className="h-6 w-6 rounded-full border-2"
                style={{ borderColor: "var(--platform-surface)", background: "var(--platform-surface-hover)" }}
              />
              <div
                className="h-6 w-6 rounded-full border-2"
                style={{ borderColor: "var(--platform-surface)", background: "var(--platform-surface-hover)" }}
              />
            </div>
            <span className="text-[12px] leading-4">{membersCount} personas</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
