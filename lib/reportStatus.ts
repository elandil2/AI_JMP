export type ReportStatusKind = "ready" | "failed" | "preparing" | "needs-attention";

export type StatusReport = {
  status?: string | null;
  created_at?: string | null;
  error_message?: string | null;
};

const ACTIVE_STATUSES = new Set(["pending", "processing", "creating"]);
export const REPORT_STALE_AFTER_MS = 15 * 60 * 1000;

export function getReportStatusKind(report: StatusReport, now = Date.now()): ReportStatusKind {
  if (report.status === "ready") return "ready";
  if (report.status === "failed" || report.status === "error") return "failed";

  if (ACTIVE_STATUSES.has(report.status ?? "")) {
    const createdAt = Date.parse(report.created_at ?? "");
    if (!Number.isNaN(createdAt) && now - createdAt > REPORT_STALE_AFTER_MS) {
      return "needs-attention";
    }
    return "preparing";
  }

  return "needs-attention";
}

export function shouldPollReport(report: StatusReport, now = Date.now()): boolean {
  return getReportStatusKind(report, now) === "preparing";
}

export function reportStatusLabel(kind: ReportStatusKind): string {
  return {
    ready: "Hazır",
    failed: "Başarısız",
    preparing: "Hazırlanıyor",
    "needs-attention": "İlgi gerekiyor"
  }[kind];
}

export function reportStatusMessage(report: StatusReport): string {
  const kind = getReportStatusKind(report);
  if (kind === "failed") {
    const detail = (report.error_message ?? "").toLowerCase();
    if (detail.includes("map") || detail.includes("direction")) {
      return "Rota servisi bu rapor için yanıt veremedi. Harita ve navigasyon açılmadı; yeni bir rapor oluşturabilirsiniz.";
    }
    if (detail.includes("gemini") || detail.includes("analysis") || detail.includes("content") || detail.includes("valid") || detail.includes("json")) {
      return "AI rapor içeriğini tamamlayamadı. Lütfen yeni bir rapor oluşturun.";
    }
    return "Rapor analizi tamamlanamadı. Lütfen yeni bir rapor oluşturun.";
  }
  if (kind === "needs-attention") {
    return "Bu rapor 15 dakika içinde tamamlanmadı ve işlem yarıda kalmış olabilir. Devam etmek için yeni bir rapor oluşturabilirsiniz.";
  }
  return "Rapor hazırlanıyor. Tamamlandığında bu sayfa otomatik yenilenecek.";
}
