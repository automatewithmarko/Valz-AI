import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { adminListUsers } from "@/lib/admin/rpc";
import { UsersClient } from "@/components/admin/UsersClient";
import { LoadError } from "@/components/admin/LoadError";
import type { UsersResponse } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  let initial: UsersResponse | null = null;
  try {
    initial = await adminListUsers({ limit: 50, offset: 0 });
  } catch (err) {
    console.error("users load failed", err);
  }

  if (!initial) return <LoadError what="users" />;
  return <UsersClient initial={initial} />;
}
