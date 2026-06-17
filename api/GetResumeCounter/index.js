const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.CosmosDBConnectionString);
const container = client.database("resume").container("container1");

module.exports = async function (context, req) {
    try {
        const { resource: item } = await container.item("1", "1").read();
        
        if (!item) {
            await container.items.create({ id: "1", count: 1 });
            context.res = { status: 200, body: { count: 1 } };
            return;
        }

        item.count += 1;
        await container.item("1", "1").replace(item);

        context.res = {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: { count: item.count }
        };
    } catch (error) {
        context.res = { status: 500, body: error.message };
    }
};
