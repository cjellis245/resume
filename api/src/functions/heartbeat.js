const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

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
      const leave = url.searchParams.get('leave') === '1'; // Detect the exit flag
      const nowSec = Math.floor(Date.now() / 1000);

      if (sid) {
        if (leave) {
          // --- INSTANT DISCONNECT ---
          // Because your partition key is /id, passing 'sid' twice targets the exact row
          try {
            await container.item(sid, sid).delete();
          } catch (err) {
            // Ignore errors if the record was already deleted or expired
          }
        } else {
          // --- NORMAL HEARTBEAT ---
          await container.items.upsert({
            id: sid,
            type: 'live',
            lastSeen: nowSec,
            ttl: WINDOW_SECONDS * 2  // Backup safety net if beacon fails
          });
        }
      }

      // --- OPTIONAL: INCREMENT TOTAL VIEWS ---
      const isInitialLoad = url.searchParams.get('init') === 'true'; 
      if (isInitialLoad && !leave) {
        try {
          const { resource: totalDoc } = await container.item('total_analytics', 'total_analytics').read();
          if (totalDoc) {
            totalDoc.count += 1;
            await container.items.upsert(totalDoc);
          }
        } catch (dbErr) {
          await container.items.upsert({ id: 'total_analytics', type: 'total', count: 1 });
        }
      }

      // --- QUERY CURRENT LIVE COUNT ---
      const cutoff = nowSec - WINDOW_SECONDS;
      const { resources: liveResources } = await container.items
        .query({
          query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'live' AND c.lastSeen >= @cutoff",
          parameters: [{ name: '@cutoff', value: cutoff }]
        })
        .fetchAll();

      // --- QUERY CURRENT TOTAL COUNT ---
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
