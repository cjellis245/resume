const { app, output } = require('@azure/functions');

// Set up the SignalR output binding to broadcast messages
const signalROutput = output.generic({
    type: 'signalR',
    hubName: 'resumeHub',
    name: 'signalRMessages'
});

// 1. JOIN ENDPOINT
app.post('JoinPage', {
    authLevel: 'anonymous',
    extraOutputs: [signalROutput],
    handler: async (request, context) => {
        // [YOUR LOGIC HERE]: Read Cosmos DB item, add +1 to active counts
        let currentActiveCount = 5; // Replace with your real Cosmos DB value calculation

        // Broadcast the updated live integer out to all connected websockets
        context.extraOutputs.set(signalROutput, [{
            target: 'updateActiveCount', // This is the event name the frontend listens for
            arguments: [currentActiveCount]
        }]);

        return { status: 200 };
    }
});

// 2. LEAVE ENDPOINT
app.post('LeavePage', {
    authLevel: 'anonymous',
    extraOutputs: [signalROutput],
    handler: async (request, context) => {
        // [YOUR LOGIC HERE]: Read Cosmos DB item, subtract -1 from active counts
        let currentActiveCount = 4; // Replace with your real Cosmos DB value calculation

        context.extraOutputs.set(signalROutput, [{
            target: 'updateActiveCount',
            arguments: [currentActiveCount]
        }]);

        return { status: 200 };
    }
});
