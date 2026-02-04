"use client";

import { getSupabaseBrowserClient } from "./supabaseClient";

export const authFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers || {});
  if (token) headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", headers.get("content-type") || "application/json");

  return fetch(input, { ...init, headers });
};
