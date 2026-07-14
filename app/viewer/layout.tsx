import ViewerLayoutShell from "@/components/viewer/ViewerLayoutShell";
import React from "react";

export default function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ViewerLayoutShell>{children}</ViewerLayoutShell>;
}
