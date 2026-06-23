"use client";

import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** soft hover lift (for clickable cards) */
  hover?: boolean;
  padding?: string;
}

export function Card({
  children,
  hover = false,
  padding = "p-8",
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`haven-card rounded-3xl ${padding} ${
        hover ? "haven-card--hover" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
