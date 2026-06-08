import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/access";
import { adminListUsers } from "@/lib/admin/rpc";

export async function GET(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  try {
    const data = await adminListUsers({ search, limit, offset });
    return NextResponse.json(data);
  } catch (err) {
    console.error("admin users failed", err);
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }
}
