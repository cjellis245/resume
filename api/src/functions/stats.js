const { app } = require('@azure/functions');

async function aiQuery(kql) {
  const appId = process.env.APPINSIGHTS_APP_ID || process.env.APP_INSIGHTS_APP_ID;
  const apiKey = process.env.APPINSIGHTS_API_KEY || process.env.APP_INSIGHTS_API_KEY;
  
  const url = `https://api.applicationinsights.io/v1/apps/${appId}/query?query=${encodeURIComponent(kql)}`;
  const r = await fetch(url, { headers: { 'x-api-key': apiKey } });
  
  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(`App Insights Error ${r.status}: ${errorText}`);
  }
  
  const data = await r.json();
  if (!data.tables?.[0]?.rows) return [];
  
  const cols = data.tables[0].columns.map(c => c.name);
  return data.tables[0].rows.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

app.http('stats', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (req, context) => {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    };

    if (req.method === 'OPTIONS') return { status: 204, headers };

    try {
      const [kpi, hourly, daily, topPages, topRefs, geo, cities, browsers, os, devices, health, ux, slow, feed] = await Promise.all([
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize totalViews = count(), uniqueUsers = dcount(user_Id), totalSessions = dcount(session_Id)`),
        aiQuery(`pageViews | where timestamp > ago(24h) | summarize n = count() by t = bin(timestamp, 1h) | order by t asc`),
        aiQuery(`pageViews | where timestamp > ago(30d) | summarize n = count() by t = bin(timestamp, 1d) | order by t asc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by url = tostring(url) | top 5 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | extend ref = tostring(customDimensions.referrer) | where isnotempty(ref) | summarize n = count() by ref | top 5 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by country = tostring(client_CountryOrRegion) | top 20 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by city = tostring(client_City) | top 5 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by name = tostring(client_Browser) | top 6 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by name = tostring(client_OS) | top 6 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by name = tostring(client_Model) | top 5 by n desc`),
        aiQuery(`exceptions | where timestamp > ago(7d) | summarize errCount = count()`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize avgLoad = avg(duration), apdex = percentile(duration, 95) by bin(timestamp, 1d) | summarize avgLoadSpeed = avg(avgLoad)/1000, apdexScore = 1 - (sumif(apdex, apdex > 3000)/sum(apdex))`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize avgMs = toint(avg(duration)) by url = tostring(url) | top 5 by avgMs desc`),
        // FIXED: Using itemKind to avoid reserved keyword 'kind'
        aiQuery(`union (pageViews | project t = timestamp, itemKind = "view", text = strcat("Visited ", url)), (customEvents | project t = timestamp, itemKind = "event", text = strcat("Event: ", name)) | top 25 by t desc`)
      ]);

      return {
        status: 200,
        headers,
        jsonBody: {
          totalPageViews: kpi[0]?.totalViews || 0,
          uniqueUsers: kpi[0]?.uniqueUsers || 0,
          sessions: kpi[0]?.totalSessions || 0,
          hourly, daily, topPages, topReferrers: topRefs, geo, topCities: cities, 
          browsers, os, devices, 
          jsErrors: health[0]?.errCount || 0,
          avgLoadSpeed: ux[0]?.avgLoadSpeed || 0,
          apdexScore: ux[0]?.apdexScore || 0,
          // Map itemKind back to the 'kind' property the frontend expects
          timeline: feed.map(r => ({ t: r.t, text: r.text, kind: r.itemKind }))
        }
      };
    } catch (e) {
      return { status: 500, headers, jsonBody: { error: e.message } };
    }
  }
});
