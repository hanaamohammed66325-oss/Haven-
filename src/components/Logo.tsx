import React from "react";

interface LogoProps {
  size?: number;
  /** kept for API compatibility with previous SVG mark — ignored */
  stroke?: string;
  /** kept for API compatibility — ignored (icon is already a self-contained tile) */
  tile?: boolean;
  className?: string;
}

/**
 * Haven mark: the app icon (stylized "H"). Rendered as an <img> pointing at
 * the same PNG the favicon and PWA icons use, so the brand mark is consistent
 * everywhere — nav, footer, checkout, auth pages, etc.
 */
export function Logo({ size = 28, className }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Haven"
      width={size}
      height={size}
      className={className}
      style={{ display: "inline-block", objectFit: "contain" }}
    />
  );
}
