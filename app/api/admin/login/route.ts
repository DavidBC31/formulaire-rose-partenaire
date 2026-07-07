import { NextRequest, NextResponse } from "next/server";
import { checkPassword, adminCookie, authConfigured } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Accès admin verrouillé : définir ADMIN_PASSWORD côté serveur" },
      { status: 503 }
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || !checkPassword(String(body.password || ""))) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  const c = adminCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("rose_admin", "", { maxAge: 0, path: "/" });
  return res;
}
