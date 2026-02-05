import { createBrowserClient } from "@supabase/ssr";

export const getSupabaseBrowserClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (typeof window === "undefined") {
      // Allow build to pass without env vars - return dummy client
      return createBrowserClient("https://placeholder.supabase.co", "placeholder-key");
    }
    throw new Error("Supabase URL or anon key is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  // Create browser client with automatic cookie handling
  return createBrowserClient(url, anonKey);
};
