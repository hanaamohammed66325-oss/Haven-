"use client";

import { AlertTriangle, CheckCircle, XCircle, ChevronDown } from "lucide-react";
import { useT } from "@/i18n";
import { InfoPopover } from "./InfoPopover";

type Status = "ok" | "warn" | "danger";

interface AttendanceBadgeProps {
  status: Status;
  size?: "sm" | "md";
  /** show a little arrow that explains the green / orange / red statuses */
  explain?: boolean;
  /** withdrawal limit (%) — shown as a note in the explanation popover */
  limit?: number;
}

const palette: Record<Status, { bg: string; text: string }> = {
  ok: { bg: "#EBF7F3", text: "#5FA98C" },
  warn: { bg: "#FEF3E2", text: "#C77E2E" },
  danger: { bg: "#FDEAEA", text: "#D9534F" },
};

const legendOrder: Status[] = ["ok", "warn", "danger"];

export function AttendanceBadge({ status, size = "sm", explain = false, limit }: AttendanceBadgeProps) {
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

  const badge = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      }`}
      style={{ background: c.bg, color: c.text }}
    >
      {icon}
      <span>{label}</span>
    </span>
  );

  if (!explain) return badge;

  return (
    <span className="inline-flex items-center gap-1.5">
      {badge}
      <InfoPopover
        label={t("attLegendTitle")}
        trigger={
          <ChevronDown size={15} className="haven-nudge" style={{ color: "var(--color-muted)" }} />
        }
      >
        <div className="font-semibold mb-2" style={{ color: "var(--color-ink)" }}>
          {t("attLegendTitle")}
        </div>
        <ul className="space-y-1.5">
          {legendOrder.map((s) => (
            <li key={s} className="flex items-start gap-2">
              <span
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: palette[s].text }}
              />
              <span style={{ color: "var(--color-muted)" }}>
                {t(`attLegend_${s}` as const)}
              </span>
            </li>
          ))}
        </ul>
        {limit != null && (
          <p
            className="mt-2.5 pt-2.5 border-t text-[11px]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
          >
            {t("attLimitNote", { limit })}
          </p>
        )}
      </InfoPopover>
    </span>
  );
}
