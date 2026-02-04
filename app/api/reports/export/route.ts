import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
    const auth = await requireAuth();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);
    const ids = body?.ids;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: reports, error } = await supabase
        .from("reports")
        .select("id, public_slug, origin_city, destination_city, status, created_at, analysis")
        .in("id", ids)
        .eq("operator_id", auth.userId);

    if (error || !reports) {
        return NextResponse.json({ error: error?.message || "Failed to fetch reports" }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://surus-guvenji.vercel.app";

    // CSV Generation
    // Requested Format: Rota, Durum, Tarih, Link
    // Details: Origin -> Destination, Status, Formatted Date, Public URL

    const header = ["Rota", "Durum", "Tarih", "Link", "Mesafe", "Süre"];

    const rows = reports.map((r) => {
        const analysis = r.analysis as any;
        const distance = analysis?.summary?.totalDistance || "-";
        const duration = analysis?.summary?.estimatedDuration || "-";
        const route = `${r.origin_city} -> ${r.destination_city}`;
        const date = new Date(r.created_at).toLocaleString("tr-TR");
        const link = `${baseUrl}/r/${r.public_slug}`;

        // CSV Escaping: Wrap fields in quotes to handle commas/newlines safely
        return [
            `"${route}"`,
            `"${r.status}"`,
            `"${date}"`,
            `"${link}"`,
            `"${distance}"`,
            `"${duration}"`
        ].join(",");
    });

    const csvContent = [header.join(","), ...rows].join("\n");

    // Add Byte Order Mark (BOM) for Excel UTF-8 compatibility
    const bom = "\uFEFF";

    return new NextResponse(bom + csvContent, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="surus_guvenligi_raporlari_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
    });
}
