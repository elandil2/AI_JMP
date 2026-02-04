import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
    try {
        const supabase = getSupabaseAdmin();

        // 1. Insert a new heartbeat record
        const { error: insertError } = await supabase
            .from("heartbeats")
            .insert({});

        if (insertError) {
            console.error("Heartbeat insert failed:", insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        // 2. Clean up old records (keep last 30 days)
        // Supabase internal cron could do this too, but let's do it here for simplicity
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { error: deleteError } = await supabase
            .from("heartbeats")
            .delete()
            .lt("last_beat", thirtyDaysAgo.toISOString());

        if (deleteError) {
            console.warn("Heartbeat cleanup warning:", deleteError);
        }

        return NextResponse.json({
            success: true,
            message: "Heartbeat logged successfully",
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
