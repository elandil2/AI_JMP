import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();

        // We fetch all users (up to a reasonable limit) to check for existence in Auth system directly.
        // This bypasses issues where the 'profiles' table might be out of sync.
        const { data: { users }, error } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000
        });

        if (error) {
            console.error("List users error:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        const emailToFind = email.trim().toLowerCase();

        // Check if any user matches the email (case-insensitive)
        const userExists = users.some(u => u.email?.toLowerCase() === emailToFind);

        return NextResponse.json({ exists: userExists });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
