import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin/access";
import { adminList } from "@/lib/admin/rpc";
import { SettingsClient } from "@/components/admin/SettingsClient";
import { LoadError } from "@/components/admin/LoadError";
import type { AdminListRow } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/");

  let admins: AdminListRow[] | null = null;
  try {
    admins = await adminList();
  } catch (err) {
    console.error("settings load failed", err);
  }

  if (!admins) return <LoadError what="settings" />;
  return (
    <SettingsClient currentAdminId={admin.adminId} initialAdmins={admins} />
  );
}
