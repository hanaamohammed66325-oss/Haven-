import React from "react";

interface LogoProps {
  size?: number;
  /** stroke color of the roof + book mark (ignored when tile is set) */
  stroke?: string;
  /** render the rounded brand tile with a white mark (favicon style) */
  tile?: boolean;
  className?: string;
}

/**
 * Haven mark: a house roof + open book (shelter + study).
 * Use stroke="#ffffff" on dark backgrounds (sidebar); tile for the favicon look.
 */
export function Logo({ size = 28, stroke = "#477680", tile = false, className }: LogoProps) {
  const markStroke = tile ? "#ffffff" : stroke;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      role="img"
    >
      {tile && <rect width="64" height="64" rx="15" fill="#477680" />}
      <g
        fill="none"
        stroke={markStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11 33 L32 15 L53 33" strokeWidth="4.5" />
        <path
          d="M32 40 C 28 37.5, 24 37.5, 21 39 L21 47 C 24 45.5, 28 45.5, 32 48"
          strokeWidth="2.5"
        />
        <path
          d="M32 40 C 36 37.5, 40 37.5, 43 39 L43 47 C 40 45.5, 36 45.5, 32 48"
          strokeWidth="2.5"
        />
      </g>
    </svg>
  );
}
