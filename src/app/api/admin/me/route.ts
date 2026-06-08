import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/access";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    admin: { id: admin.adminId, email: admin.email, isSuper: admin.isSuper },
  });
}
