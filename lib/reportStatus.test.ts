import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_STALE_AFTER_MS, getReportStatusKind, shouldPollReport } from "./reportStatus.ts";

test("active reports older than fifteen minutes need attention and stop polling", () => {
  const now = Date.parse("2026-09-14T12:00:00.000Z");
  const stale = { status: "processing", created_at: new Date(now - REPORT_STALE_AFTER_MS - 1).toISOString() };

  assert.equal(getReportStatusKind(stale, now), "needs-attention");
  assert.equal(shouldPollReport(stale, now), false);
  assert.equal(getReportStatusKind({ ...stale, created_at: new Date(now - REPORT_STALE_AFTER_MS + 1).toISOString() }, now), "preparing");
});
