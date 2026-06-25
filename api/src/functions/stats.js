const { app } = require('@azure/functions');

// Queries Application Insights via its REST API using an API key
async function aiQuery(kql) {
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
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (req, context) => {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };

    if (req.method === 'OPTIONS') return { status: 204, headers };

  try {
      // Execute ALL required queries in parallel for the new dashboard
      const [
        kpi, hourly, daily, topPages, topRefs, geo, cities, 
        browsers, os, deviceTypes, devices, 
        health, ux, slow, feed
      ] = await Promise.all([
        // KPIs (Views, Users, Sessions)
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize views = count(), users = dcount(user_Id), sessions = dcount(session_Id)`),
        // Hourly (24h)
        aiQuery(`pageViews | where timestamp > ago(24h) | summarize n = count() by t = bin(timestamp, 1h) | order by t asc`),
        // Daily (30d)
        aiQuery(`pageViews | where timestamp > ago(30d) | summarize n = count() by t = bin(timestamp, 1d) | order by t asc`),
        
        // Content & Referrers
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by url | top 5 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | where isnotempty(tostring(customDimensions.referrer)) | summarize n = count() by ref = tostring(customDimensions.referrer) | top 5 by n desc`),
        
        // Geography
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by country = tostring(client_CountryOrRegion) | top 20 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by city = tostring(client_City) | top 5 by n desc`),
        
        // Tech Breakdown
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by name = client_Browser | top 6 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by name = client_OS | top 6 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by name = client_Type | top 5 by n desc`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize n = count() by name = client_Model | top 5 by n desc`),
        
        // Performance & Health
        aiQuery(`exceptions | where timestamp > ago(7d) | count`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize avgLoad = avg(duration), apdex = percentile(duration, 95) | summarize avgLoadSpeed = avg(avgLoad)/1000, apdexScore = 1 - (sumif(apdex, apdex > 3000)/sum(apdex))`),
        aiQuery(`pageViews | where timestamp > ago(7d) | summarize avgMs = toint(avg(duration)) by url | top 5 by avgMs desc`),

        // RICH ACTIVITY FEED
        aiQuery(`
          union 
          (pageViews | project t = timestamp, kind = "view", text = strcat("Visited ", url, " from ", iff(client_City != "", strcat(client_City, ", "), ""), client_CountryOrRegion, " via ", client_Browser, " on ", client_OS)),
          (customEvents | extend details = tostring(customDimensions.details) | project t = timestamp, kind = "event", text = strcat("Event: ", name, " from ", iff(client_City != "", strcat(client_City, ", "), ""), client_CountryOrRegion, iff(details != "", strcat(" (", details, ")"), "")))
          | top 25 by t desc
        `)
      ]);

      return {
        status: 200,
        headers,
        jsonBody: {
          // KPIs
          totalPageViews: kpi[0]?.views || 0,
          uniqueUsers: kpi[0]?.users || 0,
          sessions: kpi[0]?.sessions || 0,
          
          // Charts
          hourly: hourly.map(r => ({ t: r.t, n: r.n })),
          daily: daily.map(r => ({ t: r.t, n: r.n })),
          
          // Tables
          topPages: topPages.map(r => ({ url: r.url, n: r.n })),
          topReferrers: topRefs.map(r => ({ ref: r.ref, n: r.n })),
          geo: geo.map(r => ({ country: r.country, n: r.n })),
          topCities: cities.map(r => ({ city: r.city, n: r.n })),
          slowestPages: slow.map(r => ({ url: r.url, avgMs: r.avgMs })),
          
          // Tech Bars
          browsers: browsers.map(r => ({ name: r.name, n: r.n })),
          os: os.map(r => ({ name: r.name, n: r.n })),
          deviceTypes: deviceTypes.map(r => ({ name: r.name, n: r.n })),
          devices: devices.map(r => ({ name: r.name, n: r.n })),
          
          // Health
          jsErrors: health[0]?.count || 0,
          avgLoadSpeed: ux[0]?.avgLoadSpeed || 0,
          apdexScore: ux[0]?.apdexScore || 0,
          
          // The new mapped timeline format
          timeline: feed.map(r => ({ t: r.t, text: r.text, kind: r.kind }))
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
