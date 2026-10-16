import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import HaviCompanions from "@/components/HaviCompanions";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
      {/* Havi's chosen companion pets roam the app's cards alongside him.
          (Reward-gating to come; shown app-wide for now.) */}
      <HaviCompanions />
    </AuthGuard>
  );
}
