import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const metadata = {
  title: "Admin Sign In — Valzacchi",
};

// Keep this page out of any caching so the session check always runs fresh.
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) {
    redirect("/admin");
  }
  return <AdminLoginForm />;
}
