"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useT } from "@/i18n";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="haven-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(36, 54, 64, 0.32)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="haven-modal w-full max-w-md bg-white rounded-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90dvh", boxShadow: "0 20px 60px rgba(36,54,64,0.22)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="font-semibold text-base" style={{ color: "var(--color-ink)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors hover:bg-black/5"
            aria-label={t("close")}
          >
            <X size={18} style={{ color: "var(--color-muted)" }} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
