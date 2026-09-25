/** Local previews must link back to their own port, even when a production URL is configured. */
export function publicReportUrl(slug: string, browserOrigin: string, configuredOrigin?: string): string {
  const local = ['localhost', '127.0.0.1'].includes(new URL(browserOrigin).hostname);
  const base = local ? browserOrigin : configuredOrigin || browserOrigin;
  return `${base.replace(/\/$/, '')}/r/${encodeURIComponent(slug)}`;
}
