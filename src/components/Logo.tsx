import React from "react";

interface LogoProps {
  size?: number;
  mono?: boolean;
  /** Legacy prop — replaced by `mono`. Kept so call sites don't break. */
  stroke?: string;
  /** Legacy prop — ignored. */
  tile?: boolean;
  className?: string;
}

export function Logo({ size = 28, mono, stroke, className }: LogoProps) {
  const useMono = mono ?? !!stroke;

  if (useMono) {
    return (
      <span
        role="img"
        aria-label="Haven"
        className={className ?? ""}
        style={{
          display: "inline-block",
          width: size,
          height: size,
          backgroundColor: "currentColor",
          WebkitMaskImage: "url(/logo.png)",
          maskImage: "url(/logo.png)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          flexShrink: 0,
          verticalAlign: "middle",
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Haven"
      width={size}
      height={size}
      className={className ?? ""}
      style={{ display: "inline-block", objectFit: "contain" }}
    />
  );
}
