import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin/access";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = {
  title: "Admin — Valzacchi",
};

// Always re-check admin access on the server for every protected page.
export const dynamic = "force-dynamic";

export default async function AdminDashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();
  if (!admin) {
    // Not signed in, or signed in without admin access → back to the app.
    redirect("/");
  }
  return (
    <AdminShell email={admin.email} isSuper={admin.isSuper}>
      {children}
    </AdminShell>
  );
}
