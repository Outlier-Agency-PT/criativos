import { requireAuth, checkSuperAdmin } from "@/lib/api-auth";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { LicenseGate } from "@/components/license-gate";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, orgId, supabase } = await requireAuth();
  const isSuperAdmin = await checkSuperAdmin(supabase, orgId);

  return (
    <ThemeProvider orgId={orgId}>
      <LicenseGate>
        <div className="theme-shell flex h-screen overflow-hidden rounded-none md:m-3 md:h-[calc(100vh-1.5rem)] md:rounded-[28px]">
          <Sidebar userName={user.email || "Usuário"} userEmail={user.email || ""} isSuperAdmin={isSuperAdmin} />
          <main className="relative flex-1 overflow-y-auto">
            <div className="p-4 pt-[4.25rem] md:p-6 md:pt-6">
              {children}
            </div>
          </main>
        </div>
      </LicenseGate>
    </ThemeProvider>
  );
}
