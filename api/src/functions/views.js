const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
let _container;
function getContainer() {
  if (!_container) {
    const cs = process.env.CosmosDBConnectionString;
    if (!cs) throw new Error('CosmosDBConnectionString app setting is missing');
    _container = new CosmosClient(cs).database('resume').container('container1');
  }
  return _container;
}
// Reads the same counter heartbeat maintains. Does NOT increment
// (heartbeat is the only writer, to avoid double-counting).
app.http('views', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => {
    try {
      const container = getContainer();
      const { resource: item } = await container.item('total_analytics', 'total_analytics').read();
      return { status: 200, jsonBody: { total: (item && item.count) || 0 } };
    } catch (e) {
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
