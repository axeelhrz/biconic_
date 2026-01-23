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
      <div className="flex w-[402px] flex-col overflow-hidden rounded-[15.29px] bg-white shadow-[0px_3.959px_23.756px_rgba(109,141,173,0.15)] hover:shadow-[0px_6px_28px_rgba(109,141,173,0.18)] transition-shadow">
        {/* Image */}
        <div className="relative h-[190.83px] w-full">
          <Image src={imageUrl} alt={companyName} fill className="object-cover" />
        </div>

        {/* Content */}
        <div className="flex flex-col gap-[15px] p-[19.8px]">
          <h3 className="text-[17.8px] font-semibold leading-[22px] text-[#23834E]">
            {companyName}
          </h3>
          {/* Company subtitle in design is hidden; keep subtle line for layout */}
          <p className="hidden text-[11.9px] leading-4 text-[#54565B]">
            {companyName}
          </p>

          {/* Chips */}
          <div className="flex items-start gap-[10px]">
            {status && (
              <span className="inline-flex h-6 items-center justify-center rounded-full bg-[#E7FFE4] px-3 py-1 text-[14px] font-medium text-[#282828]">
                {status}
              </span>
            )}
            {tag && (
              <span className="inline-flex h-6 items-center justify-center rounded-full bg-[#F9EBFF] px-3 py-1 text-[14px] font-medium text-[#282828]">
                {tag}
              </span>
            )}
          </div>

          {/* Metrics chips */}
          <div className="flex w-full items-start gap-[10px]">
            <div className="flex flex-1 flex-col items-center rounded-[20.84px] bg-[#F9F9F9] px-[55.57px] py-[5px]">
              <div className="flex items-center gap-[3.21px] text-[#014D58]">
                <DashboardIcon className="h-[10.69px] w-[10.69px]" />
                <span className="text-[11px] font-medium leading-[17px]">
                  Dashboards
                </span>
              </div>
              <div className="text-[12.82px] font-medium leading-[17px] text-black">
                {dashboardsCount}
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center rounded-[20.84px] bg-[#F9F9F9] px-[55.57px] py-[5px]">
              <div className="flex items-center gap-[3.21px] text-[#014D58]">
                <EtlIcon className="h-[13px] w-[11px] rotate-180 text-[#0F5F4C]" />
                <span className="text-[11px] font-medium leading-[17px]">
                  ETL
                </span>
              </div>
              <div className="text-[12.82px] font-medium leading-[17px] text-black">
                {etlsCount}
              </div>
            </div>
          </div>

          <hr className="my-1 h-[0.86px] w-full border-0 bg-[#C4C4C4]" />

          {/* People */}
          <div className="flex items-center gap-2 text-[#54565B]">
            {/* Placeholder stacked avatars; can be wired later */}
            <div className="flex -space-x-2">
              <div className="h-6 w-6 rounded-full border-2 border-white bg-gray-300" />
              <div className="h-6 w-6 rounded-full border-2 border-white bg-gray-300" />
              <div className="h-6 w-6 rounded-full border-2 border-white bg-gray-300" />
            </div>
            <span className="text-[12px] leading-4">{membersCount} personas</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
