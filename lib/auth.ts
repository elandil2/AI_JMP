import { headers } from "next/headers";
import { getSupabaseAdmin } from "./supabaseAdmin";

export type AuthResult =
  | { userId: string; email?: string }
  | { error: string; status: number };

const getBearerToken = (authHeader?: string | null) => {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token;
};

export const requireAuth = async (): Promise<AuthResult> => {
  const authHeader = (await headers()).get("authorization");
  const token = getBearerToken(authHeader);
  if (!token) return { error: "Missing bearer token", status: 401 };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: "Invalid or expired token", status: 401 };
  }

  return { userId: data.user.id, email: data.user.email ?? undefined };
};
