const { app } = require('@azure/functions');

// Queries Application Insights via its REST API using an API key
async function aiQuery(kql) {
  // 🎯 Defensive check: Supports both underscore styles to prevent config crashes
  const appId = process.env.APPINSIGHTS_APP_ID || process.env.APP_INSIGHTS_APP_ID;
  const apiKey = process.env.APPINSIGHTS_API_KEY || process.env.APP_INSIGHTS_API_KEY;
  
  if (!appId || !apiKey) {
    throw new Error('Application Insights App ID or API Key app settings are missing');
  }

  const url = `https://api.applicationinsights.io/v1/apps/${appId}/query?query=${encodeURIComponent(kql)}`;
  const r = await fetch(url, { headers: { 'x-api-key': apiKey } });
  
  if (!r.ok) throw new Error(`App Insights ${r.status}: ${await r.text()}`);
  
  const data = await r.json();
  const table = data.tables?.[0];
  if (!table || !table.rows) return [];
  
  const cols = table.columns.map(c => c.name);
  return table.rows.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

app.http('stats', {
  methods: ['GET', 'OPTIONS'], // Added OPTIONS method support for safety
  authLevel: 'anonymous',
  handler: async (req, context) => {
    // Standard CORS/Cache headers to align with your frontend routing
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*', // Allows clean cross-domain local testing
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };

    if (req.method === 'OPTIONS') return { status: 204, headers };

  try {
  // Execute all queries in parallel
  const [total, hourly, topPages, topRefs, geo, health, ux, browserData, logs] = await Promise.all([
    aiQuery(`pageViews | where timestamp > ago(7d) | summarize total = count()`),
    aiQuery(`pageViews | where timestamp > ago(24h) | summarize n = count() by t = bin(timestamp, 1h) | order by t asc`),
    aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by url | top 5 by n desc`),
    aiQuery(`pageViews | where timestamp > ago(7d) | where isnotempty(tostring(customDimensions.referrer)) | summarize n = count() by ref = tostring(customDimensions.referrer) | top 5 by n desc`),
    aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by country = tostring(client_CountryOrRegion) | top 20 by n desc`),
    
    // NEW: JS Errors (count exceptions)
    aiQuery(`exceptions | where timestamp > ago(7d) | count`),
    
    // NEW: Performance (Speed & Apdex)
    aiQuery(`pageViews | where timestamp > ago(7d) | summarize avgLoad = avg(duration), apdex = percentile(duration, 95) by bin(timestamp, 1d) | summarize avgLoadSpeed = avg(avgLoad)/1000, apdexScore = 1 - (sumif(apdex, apdex > 3000)/sum(apdex))`),
    
    // NEW: Browser Distribution
    aiQuery(`pageViews | where timestamp > ago(7d) | summarize count = count() by browser = client_Browser | top 5 by count desc`),
    
    // NEW: Recent Activity Log
    aiQuery(`pageViews | project time = timestamp, logText = strcat("User visited: *", url, "*") | top 10 by time desc`)
  ]);

  return {
    status: 200,
    headers,
    jsonBody: {
      totalPageViews: total[0]?.total || 0,
      hourly: hourly.map(r => ({ t: r.t, n: r.n })),
      topPages: topPages.map(r => ({ url: r.url, n: r.n })),
      topReferrers: topRefs.map(r => ({ ref: r.ref, n: r.n })),
      geo: geo.map(r => ({ country: r.country, n: r.n })),
      
      // Mapped new metrics
      jsErrors: health[0]?.count || 0,
      avgLoadSpeed: ux[0]?.avgLoadSpeed || 0,
      apdexScore: ux[0]?.apdexScore || 0,
      browsers: browserData,
      timeline: logs
    },
  };
    } catch (e) {
      context.error('stats failed', e);
      return { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, 
        jsonBody: { error: e.message } 
      };
    }
  },
});
