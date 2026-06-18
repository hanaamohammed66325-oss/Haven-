"use client";

interface ProgressBarProps {
  value: number; // 0–100
  color?: string;
  track?: string;
  height?: number;
  className?: string;
}

export function ProgressBar({
  value,
  color = "var(--color-primary)",
  track = "var(--color-primary-soft)",
  height = 6,
  className = "",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`w-full overflow-hidden rounded-full ${className}`}
      style={{ height, background: track }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${clamped}%`,
          background: color,
          transition: "width 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}
