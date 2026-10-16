"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

const variantStyles = {
  primary: "text-white font-medium transition-all ",
  secondary: "font-medium border transition-all ",
  ghost: "font-medium transition-all ",
  danger: "text-white font-medium transition-all ",
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
    <InteractionButton
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
    </InteractionButton>
  );
}
