"use client";

import { useState } from "react";
import { Send, Check } from "lucide-react";
import { useT } from "@/i18n";
import { submitFeedback } from "@/lib/feedback";

const field =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

type Status = "idle" | "sending" | "done" | "error";

export function FeedbackForm() {
  const { t } = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const border = { borderColor: "var(--color-border)" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    const res = await submitFeedback({ name, email, message });
    if (res.ok) {
      setStatus("done");
      setName("");
      setEmail("");
      setMessage("");
    } else {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8">
        <div
          className="flex items-center justify-center rounded-2xl mb-4"
          style={{ width: 52, height: 52, background: "#EBF7F3", color: "var(--color-success)" }}
        >
          <Check size={24} />
        </div>
        <p className="text-[15px] font-medium" style={{ color: "var(--color-ink)" }}>{t("feedbackThanks")}</p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm font-medium"
          style={{ color: "var(--color-primary)" }}
        >
          {t("feedbackSend")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          className={field}
          style={border}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("authNamePlaceholder")}
          aria-label={t("authName")}
        />
        <input
          className={field}
          style={border}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          aria-label={t("emailLabel")}
        />
      </div>
      <textarea
        className={`${field} resize-none`}
        style={border}
        rows={4}
        value={message}
        onChange={(e) => { setMessage(e.target.value); if (status === "error") setStatus("idle"); }}
        placeholder={t("feedbackMessagePlaceholder")}
        aria-label={t("feedbackMessage")}
      />
      {status === "error" && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>
          {message.trim() ? t("feedbackError") : t("feedbackEmptyError")}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="haven-btn inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium self-start disabled:opacity-60"
      >
        <Send size={16} className="rtl:rotate-180" />
        {status === "sending" ? t("feedbackSending") : t("feedbackSend")}
      </button>
    </form>
  );
}
