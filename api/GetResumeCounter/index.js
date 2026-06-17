const { CosmosClient } = require("@azure/cosmos");

// The connection string for 'cjellisresume' will be pulled from your Azure App Settings
const client = new CosmosClient(process.env.CosmosDBConnectionString);
const container = client.database("resume").container("container1");

module.exports = async function (context, req) {
    try {
        // Read the current count item (ID: "1", Partition Key: "1")
        const { resource: item } = await container.item("1", "1").read();
        
        // Safety check: if the document doesn't exist yet, initialize it
        if (!item) {
            const newItem = { id: "1", count: 1 };
            await container.items.create(newItem);
            
            context.res = {
                status: 200,
                headers: { "Content-Type": "application/json" },
                body: { count: 1 }
            };
            return;
        }

        // Increment the count
        item.count += 1;
        
        // Save the updated count back to container1
        await container.item("1", "1").replace(item);

        // Send the updated total back to your HTML frontend
        context.res = {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: { count: item.count }
        };
        
    } catch (error) {
        context.log.error("Database error:", error);
        context.res = {
            status: 500,
            body: "Error updating the visitor counter."
        };
    }
};
