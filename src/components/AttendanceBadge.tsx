"use client";

import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useT } from "@/i18n";

type Status = "ok" | "warn" | "danger";

interface AttendanceBadgeProps {
  status: Status;
  /** absence percentage to display */
  absence: number;
  size?: "sm" | "md";
}

const palette: Record<Status, { bg: string; text: string }> = {
  ok: { bg: "#EBF7F3", text: "#5FA98C" },
  warn: { bg: "#FEF3E2", text: "#C77E2E" },
  danger: { bg: "#FDEAEA", text: "#D9534F" },
};

export function AttendanceBadge({ status, absence, size = "sm" }: AttendanceBadgeProps) {
  const { t } = useT();
  const c = palette[status];
  const iconSize = size === "sm" ? 13 : 15;
  const icon =
    status === "ok" ? (
      <CheckCircle size={iconSize} />
    ) : status === "warn" ? (
      <AlertTriangle size={iconSize} />
    ) : (
      <XCircle size={iconSize} />
    );
  const label = t(`attStatus_${status}` as const);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      }`}
      style={{ background: c.bg, color: c.text }}
    >
      {icon}
      <span>{label}</span>
      {status !== "ok" && (
        <span style={{ opacity: 0.85 }}>· {Math.round(absence)}%</span>
      )}
    </span>
  );
}
