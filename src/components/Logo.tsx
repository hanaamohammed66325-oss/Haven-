import React from "react";

interface LogoProps {
  size?: number;
  /** When true the logo renders monochrome — white in the sidebar (always
   *  dark) and theme-adaptive (dark/light) everywhere else via CSS. */
  mono?: boolean;
  /** Legacy prop — replaced by `mono`. Kept so call sites don't break. */
  stroke?: string;
  /** Legacy prop — ignored. */
  tile?: boolean;
  className?: string;
}

export function Logo({ size = 28, mono, stroke, className }: LogoProps) {
  const useMono = mono ?? !!stroke;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Haven"
      width={size}
      height={size}
      className={`${useMono ? "haven-logo-mono" : ""} ${className ?? ""}`}
      style={{ display: "inline-block", objectFit: "contain" }}
    />
  );
}
