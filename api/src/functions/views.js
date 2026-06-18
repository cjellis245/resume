const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const container = new CosmosClient(process.env.CosmosDBConnectionString)
  .database('resume').container('container1');

app.http('views', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async () => {
    try {
      let total = 1;
      const { resource: item } = await container.item('1', '1').read();
      if (!item) {
        await container.items.create({ id: '1', count: 1 });
      } else {
        item.count += 1;
        await container.item('1', '1').replace(item);
        total = item.count;
      }
      return { status: 200, jsonBody: { total } };
    } catch (e) {
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
