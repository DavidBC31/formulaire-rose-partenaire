import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "rose_admin";

function password(): string {
  return process.env.ADMIN_PASSWORD || "rose2026";
}

export function usesDefaultPassword(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

export function sessionToken(): string {
  return createHmac("sha256", `formulaire-rose:${password()}`)
    .update("admin-session")
    .digest("hex");
}

export function checkPassword(pw: string): boolean {
  const a = Buffer.from(pw);
  const b = Buffer.from(password());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const val = store.get(COOKIE_NAME)?.value;
  return !!val && val === sessionToken();
}

export function adminCookie(): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  return {
    name: COOKIE_NAME,
    value: sessionToken(),
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    },
  };
}
