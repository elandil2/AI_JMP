import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAuth } from "@/lib/auth";
import { timelineForDisplay } from "@/lib/routeTimelineBuilder";
import type { RouteAnalysis } from "@/types";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .eq("operator_id", auth.userId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const analysis = data.analysis as RouteAnalysis | null;
  return NextResponse.json({ report: {
    ...data,
    analysis: analysis ? { ...analysis, timeline: timelineForDisplay(analysis, data.departure_time ?? undefined) } : analysis
  } });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Verify ownership before deleting for safety (RLS helps, but good to be explicit)
  const { error } = await supabase
    .from("reports")
    .delete()
    .eq("id", id)
    .eq("operator_id", auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
