import express from "express";
import { MongoClient } from "mongodb";
import "dotenv/config";
import cors from "cors";

    const app = express();
    const PORT = 8000;

    app.use(cors());
    app.use(express.json());

    const client = new MongoClient(process.env.MONGO_URI);

    export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        return client;
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
    }

    const mongoClientConnection = await connectToMongoDB();
    const db = mongoClientConnection.db("social_events");
    const eventsCollection = db.collection("events");

    // POST endpoint to create a new event
    app.post("/api/events", async (req, res) => {
        try {
            const event = req.body;
            // Process the event data
            const result = await eventsCollection.insertOne(event);  
            res.send(result);
        } catch (error) {
            console.error("Error creating event:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    });

    // GET endpoint to retrieve all events
    app.get("/api/events", async (req, res) => {
        try {
            const events = await eventsCollection.find().toArray();
            res.json(events);
        } catch (error) {
            console.error("Error fetching events:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    });
    
    // GET endpoint for the root path
    app.get("/", (req, res) => {
        res.send("Hello, World!");
    });

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});