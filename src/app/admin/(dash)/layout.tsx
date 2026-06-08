import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = {
  title: "Admin — Valzacchi",
};

// Always re-check the session on the server for every protected page.
export const dynamic = "force-dynamic";

export default async function AdminDashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  return (
    <AdminShell email={session.email} isSuper={session.isSuper}>
      {children}
    </AdminShell>
  );
}
