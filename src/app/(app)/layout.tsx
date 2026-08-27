import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { BetaGate } from "@/components/BetaGate";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <BetaGate>
        <AppShell>{children}</AppShell>
      </BetaGate>
    </AuthGuard>
  );
}
