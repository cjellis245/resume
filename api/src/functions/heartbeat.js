const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const WINDOW_SECONDS = 30;
// Lazy init — only created on the first request, so a missing env var
// breaks THIS function, not the whole worker.
let _container;
function getContainer() {
  if (!_container) {
    const cs = process.env.CosmosDBConnectionString;
    if (!cs) throw new Error('CosmosDBConnectionString app setting is missing');
    _container = new CosmosClient(cs).database('resume').container('container1');
  }
  return _container;
}
app.http('heartbeat', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const container = getContainer();
      const url = new URL(request.url);
      const sid = (url.searchParams.get('sid') || '').slice(0, 64);
      const leave = url.searchParams.get('leave') === '1';
      const nowSec = Math.floor(Date.now() / 1000);
      if (sid) {
        if (leave) {
          try { await container.item(sid, sid).delete(); } catch { /* already gone */ }
        } else {
          await container.items.upsert({
            id: sid,
            type: 'live',
            lastSeen: nowSec,
            ttl: WINDOW_SECONDS * 2
          });
        }
      }
      const isInitialLoad = url.searchParams.get('init') === 'true';
      if (isInitialLoad && !leave) {
        try {
          const { resource: totalDoc } = await container.item('total_analytics', 'total_analytics').read();
          if (totalDoc) {
            totalDoc.count = (totalDoc.count || 0) + 1;
            await container.items.upsert(totalDoc);
          } else {
            await container.items.upsert({ id: 'total_analytics', type: 'total', count: 1 });
          }
        } catch {
          await container.items.upsert({ id: 'total_analytics', type: 'total', count: 1 });
        }
      }
      const cutoff = nowSec - WINDOW_SECONDS;
      const { resources: liveResources } = await container.items
        .query({
          query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'live' AND c.lastSeen >= @cutoff",
          parameters: [{ name: '@cutoff', value: cutoff }]
        })
        .fetchAll();
      const { resources: totalResources } = await container.items
        .query({ query: "SELECT VALUE c.count FROM c WHERE c.id = 'total_analytics'" })
        .fetchAll();
      return {
        status: 200,
        jsonBody: {
          live: liveResources[0] || 0,
          total: totalResources[0] || 0
        }
      };
    } catch (e) {
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
