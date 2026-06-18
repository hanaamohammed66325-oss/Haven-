import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <h1 className="text-2xl font-semibold mb-2" style={{ color: "var(--color-ink)" }}>
        404
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-muted)" }}>
        This page could not be found.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
        style={{ background: "var(--color-primary)" }}
      >
        Back to dashboard
      </Link>
    </div>
  );
}
