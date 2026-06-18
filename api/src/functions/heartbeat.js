const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

// Pointing to your single container1
const container = new CosmosClient(process.env.CosmosDBConnectionString)
  .database('resume').container('container1');

const WINDOW_SECONDS = 30;

app.http('heartbeat', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const url = new URL(request.url);
      const sid = (url.searchParams.get('sid') || '').slice(0, 64);
      const nowSec = Math.floor(Date.now() / 1000);

      // --- 1. HANDLE LIVE VIEWER HEARTBEAT ---
      if (sid) {
        await container.items.upsert({
          id: sid,          // Unique ID per user tab
          type: 'live',     // Label to keep data types distinct
          lastSeen: nowSec,
          ttl: WINDOW_SECONDS * 2  // Auto-deletes this row when they leave
        });
      }

      // --- 2. OPTIONAL: INCREMENT TOTAL VIEWS (If a new session) ---
      // If your frontend script only hits this on initial load (not on the 10s loop)
      const isInitialLoad = url.searchParams.get('init') === 'true'; 
      if (isInitialLoad) {
        try {
          // Read the existing total record
          const { resource: totalDoc } = await container.item('total_analytics', 'total_analytics').read();
          
          if (totalDoc) {
            totalDoc.count += 1;
            await container.items.upsert(totalDoc);
          } else {
            // First time setup if the row doesn't exist in container1 yet
            await container.items.upsert({
              id: 'total_analytics',
              type: 'total',
              count: 1
              // CRITICAL: No TTL property here, so it never deletes itself!
            });
          }
        } catch (dbErr) {
          // If read fails because it doesn't exist, create it
          await container.items.upsert({ id: 'total_analytics', type: 'total', count: 1 });
        }
      }

      // --- 3. QUERY CURRENT LIVE COUNT ---
      const cutoff = nowSec - WINDOW_SECONDS;
      const { resources: liveResources } = await container.items
        .query({
          query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'live' AND c.lastSeen >= @cutoff",
          parameters: [{ name: '@cutoff', value: cutoff }]
        })
        .fetchAll();

      // --- 4. QUERY CURRENT TOTAL COUNT ---
      const { resources: totalResources } = await container.items
        .query({
          query: "SELECT VALUE c.count FROM c WHERE c.id = 'total_analytics'"
        })
        .fetchAll();

      return { 
        status: 200, 
        jsonBody: { 
          live: liveResources[0] || 0,
          total: totalResources[0] || 1
        } 
      };

    } catch (e) {
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
