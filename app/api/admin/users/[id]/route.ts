import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { field, value } = body;

    if (!id || (field !== 'is_admin' && field !== 'is_blocked') || typeof value !== 'boolean') {
        return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll(cookiesToSet) { },
            },
        }
    );

    // 1. Check Authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Check Admin Status (Authorized User)
    // We check if the requester is an admin
    const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

    if (!profile?.is_admin) {
        return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    // 3. Perform Update using Service Role (Bypassing RLS)
    const adminClient = getSupabaseAdmin();
    const { error: updateError } = await adminClient
        .from("profiles")
        .update({ [field]: value })
        .eq("id", id);

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Sync user_roles table if we are modifying is_admin
    if (field === 'is_admin') {
        if (value === true) {
            // Add admin role
            // Ignore error if already exists (constraint violation)
            await adminClient
                .from('user_roles')
                .insert({ profile_id: id, role: 'admin' })
                .select();
        } else {
            // Remove admin role
            await adminClient
                .from('user_roles')
                .delete()
                .match({ profile_id: id, role: 'admin' });
        }
    }

    return NextResponse.json({ success: true });
}
