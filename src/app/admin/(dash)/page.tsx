import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin/access";
import { adminDashboardStats } from "@/lib/admin/rpc";
import { DashboardClient } from "@/components/admin/DashboardClient";
import { LoadError } from "@/components/admin/LoadError";
import type { DashboardStats } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/");

  let stats: DashboardStats | null = null;
  try {
    stats = await adminDashboardStats();
  } catch (err) {
    console.error("dashboard stats load failed", err);
  }

  if (!stats) return <LoadError what="dashboard stats" />;
  return <DashboardClient stats={stats} />;
}
