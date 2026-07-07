import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "rose_admin";

function password(): string {
  return process.env.ADMIN_PASSWORD || "";
}

/** L'admin exige ADMIN_PASSWORD : sans lui, l'accès est verrouillé
 * (jamais ouvert). Le formulaire public, lui, reste sans connexion. */
export function authConfigured(): boolean {
  return !!password();
}

export function sessionToken(): string {
  return createHmac("sha256", `formulaire-rose:${password()}`)
    .update("admin-session")
    .digest("hex");
}

export function checkPassword(pw: string): boolean {
  if (!authConfigured()) return false;
  const a = Buffer.from(pw);
  const b = Buffer.from(password());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  if (!authConfigured()) return false;
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
