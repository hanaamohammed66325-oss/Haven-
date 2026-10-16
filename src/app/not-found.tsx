
import { InteractionLink } from "@/components/motion/Interaction";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <h1 className="font-display text-4xl mb-3" style={{ color: "var(--color-ink)" }}>
        404
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-muted)" }}>
        This page could not be found.
      </p>
      <InteractionLink
        href="/dashboard"
        className="haven-btn px-5 py-2.5 rounded-xl text-sm font-medium"
      >
        Back to dashboard
      </InteractionLink>
    </div>
  );
}
