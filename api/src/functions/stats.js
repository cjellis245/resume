const { app } = require('@azure/functions');
// Queries Application Insights via its REST API using an API key
// (simpler than Managed Identity on SWA Managed Functions).
async function aiQuery(kql) {
  const appId = process.env.APPINSIGHTS_APP_ID;
  const apiKey = process.env.APPINSIGHTS_API_KEY;
  if (!appId || !apiKey) throw new Error('APPINSIGHTS_APP_ID / APPINSIGHTS_API_KEY missing');
  const url = `https://api.applicationinsights.io/v1/apps/${appId}/query?query=${encodeURIComponent(kql)}`;
  const r = await fetch(url, { headers: { 'x-api-key': apiKey } });
  if (!r.ok) throw new Error(`App Insights ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const table = data.tables?.[0];
  if (!table) return [];
  const cols = table.columns.map(c => c.name);
  return table.rows.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}
app.http('stats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (_req, context) => {
    try {
      const [total, hourly, topPages, topRefs, geo] = await Promise.all([
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize total = count()`),
        aiQuery(`pageViews | where timestamp > ago(24h) | summarize n = count() by bin(timestamp, 1h) | order by timestamp asc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by url | top 5 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | where isnotempty(tostring(customDimensions.referrer)) | summarize n = count() by ref = tostring(customDimensions.referrer) | top 5 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by country = tostring(client_CountryOrRegion) | top 20 by n desc`),
      ]);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
        jsonBody: {
          total: total[0]?.total || 0,
          hourly: hourly.map(r => ({ t: r.timestamp, n: r.n })),
          topPages: topPages.map(r => ({ url: r.url, n: r.n })),
          topReferrers: topRefs.map(r => ({ ref: r.ref, n: r.n })),
          geo: geo.map(r => ({ country: r.country, n: r.n })),
        },
      };
    } catch (e) {
      context.error('stats failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  },
});
