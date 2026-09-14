import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseBatchCsv } from "@/lib/csv";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_MODEL = "gemini-2.5-flash";
const ADMIN_MODEL = "gemini-3.8-flash";
const MAX_ROWS = 10;

type BatchRequest = { csv: string; fileName?: string; useTolls?: boolean; departureTime?: string | null; model?: string };

const getProfile = async (userId: string, email?: string) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("profiles").select("id, is_admin").eq("id", userId).maybeSingle();
  if (error) return { error: error.message };
  if (data) return { isAdmin: Boolean(data.is_admin) };
  const { error: insertError } = await supabase.from("profiles").insert({ id: userId, email: email ?? "" });
  if (insertError) return { error: insertError.message };
  return { isAdmin: false };
};

const parsePayload = async (req: Request): Promise<BatchRequest | { error: string }> => {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    return body && typeof body.csv === "string" ? body as BatchRequest : { error: "Missing csv field" };
  }
  return contentType.includes("text/csv") ? { csv: await req.text() } : { error: "Send CSV text or JSON { csv: string }" };
};

const rowKey = (row: { originCity: string; originCounty: string; destinationCity: string; destinationCounty: string }) =>
  [row.originCity, row.originCounty, row.destinationCity, row.destinationCounty].map((value) => value.trim().normalize("NFC").toLocaleLowerCase("tr-TR")).join("\u001f");

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const payload = await parsePayload(req);
  if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: 400 });

  const parsed = parseBatchCsv(payload.csv);
  if (parsed.errors.length) return NextResponse.json({ error: "CSV validation failed", errors: parsed.errors }, { status: 400 });
  if (!parsed.rows.length) return NextResponse.json({ error: "No valid rows found" }, { status: 400 });
  if (parsed.rows.length > MAX_ROWS) return NextResponse.json({ error: `A batch can contain at most ${MAX_ROWS} rows` }, { status: 400 });
  const duplicates = parsed.rows.filter((row, index, rows) => rows.findIndex((candidate) => rowKey(candidate) === rowKey(row)) !== index);
  if (duplicates.length) return NextResponse.json({ error: "Each batch row must be distinct", rows: duplicates.map((row) => row.sourceRow) }, { status: 400 });

  const profile = await getProfile(auth.userId, auth.email);
  if ("error" in profile) return NextResponse.json({ error: profile.error }, { status: 500 });
  const model = payload.model ?? DEFAULT_MODEL;
  if (model !== DEFAULT_MODEL && model !== ADMIN_MODEL) return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
  if (model === ADMIN_MODEL && !profile.isAdmin) return NextResponse.json({ error: "The selected model is available to administrators only" }, { status: 403 });

  let departureTime: string | null = null;
  if (payload.departureTime) {
    const date = new Date(payload.departureTime);
    if (Number.isNaN(date.valueOf())) return NextResponse.json({ error: "departureTime must be a valid ISO date" }, { status: 400 });
    if (date.getTime() < Date.now()) return NextResponse.json({ error: "Past departure times are not permitted for a batch" }, { status: 400 });
    departureTime = date.toISOString();
  }
  const useTolls = payload.useTolls ?? true;
  const canonicalRows = parsed.rows.map(({ sourceRow: _, ...row }) => row);
  const inputHash = createHash("sha256").update(JSON.stringify({ rows: canonicalRows, useTolls, departureTime })).digest("hex");
  const supabase = getSupabaseAdmin();
  const { data: batch, error: batchError } = await supabase
    .from("batches")
    .insert({ operator_id: auth.userId, file_name: typeof payload.fileName === "string" ? payload.fileName.slice(0, 255) : "upload.csv", status: "pending", model, use_tolls: useTolls, departure_time: departureTime, input_hash: inputHash })
    .select("id, status, model, use_tolls, departure_time, input_hash")
    .single();
  if (batchError || !batch) return NextResponse.json({ error: batchError?.message || "Failed to create batch" }, { status: 500 });

  const { data: items, error: itemsError } = await supabase
    .from("batch_items")
    .insert(canonicalRows.map((row, rowIndex) => ({ batch_id: batch.id, row_index: rowIndex, raw_json: row, status: "pending" })))
    .select("id, row_index, status");
  if (itemsError || !items) {
    const { error: cleanupError } = await supabase.from("batches").delete().eq("id", batch.id).eq("operator_id", auth.userId);
    if (cleanupError) console.error("Failed to remove incomplete batch", cleanupError.message);
    return NextResponse.json({ error: itemsError?.message || "Failed to create batch items" }, { status: 500 });
  }
  return NextResponse.json({ batchId: batch.id, batch, items, isAdmin: profile.isAdmin }, { status: 201 });
}
