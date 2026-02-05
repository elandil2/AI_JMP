import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminDashboard, { Profile } from "./AdminDashboard";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export default async function AdminPage() {
    const cookieStore = await cookies();

    // 1. Verify Current User is Admin using Session
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) { },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: currentProfile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

    if (!currentProfile?.is_admin) {
        redirect("/dashboard");
    }

    // 2. Fetch All Data using Admin Client (God Mode) to ensure we see everything
    const adminClient = getSupabaseAdmin();

    // Fetch all registered users from Auth (source of truth)
    const { data: { users: authUsers }, error: authError } = await adminClient.auth.admin.listUsers();

    // Fetch profile details
    const { data: profiles } = await adminClient
        .from("profiles")
        .select("*");

    if (authError) {
        console.error("Error fetching users:", authError.message);
    }

    // 3. Fetch Stats
    // We can use adminClient for this too to avoid RLS issues
    const { count: reportCount } = await adminClient.from("reports").select("*", { count: 'exact', head: true });
    const { count: batchCount } = await adminClient.from("batches").select("*", { count: 'exact', head: true });

    // 4. Merge Auth Users with Profile Data
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const sanitizedUsers: Profile[] = authUsers?.map((u) => {
        const profile = profileMap.get(u.id);
        return {
            id: u.id,
            email: u.email || "",
            name: profile?.name,
            created_at: u.created_at,
            is_admin: !!profile?.is_admin,
            is_blocked: !!profile?.is_blocked,
        };
    }) || [];

    // Sort by created_at desc
    sanitizedUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return (
        <AdminDashboard
            initialUsers={sanitizedUsers}
            reportCount={reportCount || 0}
            batchCount={batchCount || 0}
        />
    );
}
