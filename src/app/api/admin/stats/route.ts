import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { adminDashboardStats } from "@/lib/admin/rpc";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const stats = await adminDashboardStats();
    return NextResponse.json({ stats });
  } catch (err) {
    console.error("admin stats failed", err);
    return NextResponse.json({ error: "Failed to load stats." }, { status: 500 });
  }
}
