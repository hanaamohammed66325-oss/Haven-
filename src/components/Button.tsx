"use client";

import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

const variantStyles = {
  primary: "text-white font-medium transition-all active:scale-95",
  secondary: "font-medium border transition-all active:scale-95",
  ghost: "font-medium transition-all active:scale-95",
  danger: "text-white font-medium transition-all active:scale-95",
};

const variantColors = {
  primary: {
    background: "var(--color-primary)",
    color: "#fff",
  },
  secondary: {
    background: "transparent",
    borderColor: "var(--color-border)",
    color: "var(--color-ink)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-primary)",
  },
  danger: {
    background: "var(--color-danger)",
    color: "#fff",
  },
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-sm rounded-xl",
  md: "px-5 py-2.5 text-sm rounded-xl",
  lg: "px-6 py-3 text-base rounded-2xl",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  children,
  className = "",
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      style={{ ...variantColors[variant], ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
