import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reports")
    .select(
      `
      id,
      public_slug,
      origin_city,
      origin_county,
      origin_lat,
      origin_lng,
      destination_city,
      destination_county,
      destination_lat,
      destination_lng,
      analysis,
      status,
      created_at
    `
    )
    .eq("public_slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.status !== "ready") return NextResponse.json({ error: "Report not ready" }, { status: 400 });

  return NextResponse.json({ report: data });
}
