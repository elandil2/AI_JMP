import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    // Cannot set cookies in Server Component, middleware handles session maintenance
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    // Check if user is admin
    const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

    if (error || !profile?.is_admin) {
        // If error (e.g. no profile) or not admin, kick them out
        redirect("/dashboard");
    }

    return (
        <div className="flex min-h-screen flex-col bg-gray-50">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="font-bold text-lg flex items-center gap-2">
                        <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded text-xs uppercase tracking-wide">Admin</span>
                        <span>System Control</span>
                    </div>
                    <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Exit (Go to Dashboard)</a>
                </div>
            </header>
            <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
                {children}
            </div>
        </div>
    );
}
