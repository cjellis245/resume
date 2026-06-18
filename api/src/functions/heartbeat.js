const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

// Use a SEPARATE container for presence (TTL enabled — see setup notes below)
const presence = new CosmosClient(process.env.CosmosDBConnectionString)
  .database('resume').container('presence');

const WINDOW_SECONDS = 30;

app.http('heartbeat', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const url = new URL(request.url);
      const sid = (url.searchParams.get('sid') || '').slice(0, 64);
      const nowSec = Math.floor(Date.now() / 1000);

      if (sid) {
        await presence.items.upsert({
          id: sid,
          sid,
          lastSeen: nowSec,
          ttl: WINDOW_SECONDS * 2  // auto-delete stale rows
        });
      }

      const cutoff = nowSec - WINDOW_SECONDS;
      const { resources } = await presence.items
        .query({
          query: 'SELECT VALUE COUNT(1) FROM c WHERE c.lastSeen >= @cutoff',
          parameters: [{ name: '@cutoff', value: cutoff }]
        })
        .fetchAll();

      return { status: 200, jsonBody: { live: resources[0] || 0 } };
    } catch (e) {
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
