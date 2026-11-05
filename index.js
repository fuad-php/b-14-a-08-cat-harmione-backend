
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { verifyJwt } from "./jwt.js";

const app = express();
const PORT = process.env.PORT ?? 8000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const client = new MongoClient(process.env.MONGO_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    return client;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

const mongoClientConnection = await connectToMongoDB();
const db = mongoClientConnection.db("social_events");
const eventsCollection = db.collection("events");
const joinsCollection = db.collection("joins");

const toText = (value) =>
  typeof value === "string" ? value.trim() : "";

const isDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const isRealDate = (value) =>
  !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function validateEventInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  const textFields = [
    ["title", 3, 140],
    ["description", 20, 4000],
    ["eventType", 2, 60],
    ["thumbnail", 8, 2048],
    ["location", 2, 160],
  ];

  for (const [field, min, max] of textFields) {
    if (body[field] === undefined) {
      if (!partial) errors.push(`"${field}" is required.`);
      continue;
    }

    const value = toText(body[field]);

    if (value.length < min || value.length > max) {
      errors.push(
        `"${field}" must be between ${min} and ${max} characters.`,
      );
      continue;
    }

    data[field] = value;
  }

  if (body.eventDate === undefined) {
    if (!partial) errors.push('"eventDate" is required.');
  } else {
    const value = toText(body.eventDate);

    if (!isDateString(value) || !isRealDate(value)) {
      errors.push(
        '"eventDate" must be a valid date in YYYY-MM-DD format.',
      );
    } else if (value < todayString()) {
      errors.push('"eventDate" cannot be in the past.');
    } else {
      data.eventDate = value;
    }
  }

  return { data, errors };
}

function parseObjectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

// GET endpoint to retrieve events, optionally filtered, sorted, and limited
app.get("/api/events", async (req, res) => {
  try {
    const { limit, sort, order, upcoming, creatorEmail } = req.query;
    const filter = {};

    if (upcoming === "true") {
      filter.eventDate = { $gte: todayString() };
    }

    if (typeof creatorEmail === "string" && creatorEmail.trim()) {
      filter.creatorEmail = creatorEmail.trim().toLowerCase();
    }

    const sortField =
      sort === "createdAt" ? "createdAt" : "eventDate";

    const direction = order === "desc" ? -1 : 1;

    let cursor = eventsCollection
      .find(filter)
      .sort({ [sortField]: direction, createdAt: direction });

    const parsedLimit = Number.parseInt(String(limit ?? ""), 10);

    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      cursor = cursor.limit(Math.min(parsedLimit, 100));
    }

    const events = await cursor.toArray();

    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching events:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// POST endpoint to create a new event (authenticated)
app.post("/api/events", verifyJwt, async (req, res) => {
  try {
    const { data, errors } = validateEventInput(req.body);

    const creatorEmail = req.auth.email;
    const requestedEmail = toText(req.body.creatorEmail).toLowerCase();

    if (requestedEmail && requestedEmail !== creatorEmail) {
      return res.status(403).json({
        message: "You can only create events for your own account.",
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: errors[0],
        errors,
      });
    }

    const event = {
      ...data,
      creatorEmail,
      creatorName: toText(req.body.creatorName) || req.auth.name,
      createdAt: new Date(),
    };

    const result = await eventsCollection.insertOne(event);

    res.status(201).json({
      ...event,
      _id: result.insertedId,
    });
  } catch (error) {
    console.error("Error creating event:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// GET endpoint to retrieve one event
app.get("/api/events/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const objectId = parseObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        message: "Invalid event id.",
      });
    }

    const event = await eventsCollection.findOne({
      _id: objectId,
    });

    if (!event) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    res.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// PATCH endpoint to update one event (creator only, authenticated)
app.patch("/api/events/:id", verifyJwt, async (req, res) => {
  const { id } = req.params;

  try {
    const objectId = parseObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        message: "Invalid event id.",
      });
    }

    const event = await eventsCollection.findOne({
      _id: objectId,
    });

    if (!event) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const actorEmail = req.auth.email;
    const requestedEmail = toText(req.body.creatorEmail).toLowerCase();

    if (requestedEmail && requestedEmail !== actorEmail) {
      return res.status(403).json({
        message: "You can only update events that you created.",
      });
    }

    if (event.creatorEmail !== actorEmail) {
      return res.status(403).json({
        message: "You can only update events that you created.",
      });
    }

    const { data, errors } = validateEventInput(req.body, {
      partial: true,
    });

    if (errors.length > 0) {
      return res.status(400).json({
        message: errors[0],
        errors,
      });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        message: "No changes were provided.",
      });
    }

    await eventsCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          ...data,
          updatedAt: new Date(),
        },
      },
    );

    const updatedEvent = await eventsCollection.findOne({
      _id: objectId,
    });

    res.status(200).json(updatedEvent);
  } catch (error) {
    console.error("Error updating event:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// DELETE endpoint to remove one event (creator only, authenticated)
app.delete("/api/events/:id", verifyJwt, async (req, res) => {
  const { id } = req.params;

  try {
    const objectId = parseObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        message: "Invalid event id.",
      });
    }

    const event = await eventsCollection.findOne({
      _id: objectId,
    });

    if (!event) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const actorEmail = req.auth.email;

    if (event.creatorEmail !== actorEmail) {
      return res.status(403).json({
        message: "You can only delete events that you created.",
      });
    }

    await eventsCollection.deleteOne({
      _id: objectId,
    });

    await joinsCollection.deleteMany({
      eventId: id,
    });

    res.status(200).json({
      deletedId: id,
    });
  } catch (error) {
    console.error("Error deleting event:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// POST endpoint for a user to join an event (authenticated)
app.post("/api/joins", verifyJwt, async (req, res) => {
  try {
    const eventId = toText(req.body.eventId);
    const userEmail = req.auth.email;
    const userName = toText(req.body.userName) || req.auth.name;
    const userId = req.auth.userId;

    const requestedEmail = toText(req.body.userEmail).toLowerCase();

    if (requestedEmail && requestedEmail !== userEmail) {
      return res.status(403).json({
        message: "You can only join events with your own account.",
      });
    }

    const objectId = parseObjectId(eventId);

    if (!objectId) {
      return res.status(400).json({
        message: "Invalid event id.",
      });
    }

    const event = await eventsCollection.findOne({
      _id: objectId,
    });

    if (!event) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    if (event.eventDate < todayString()) {
      return res.status(400).json({
        message: "This event has already taken place.",
      });
    }

    const existingJoin = await joinsCollection.findOne({
      eventId,
      userEmail,
    });

    if (existingJoin) {
      return res.status(409).json({
        message: "You have already joined this event.",
      });
    }

    const join = {
      eventId,
      eventTitle: event.title,
      eventDate: event.eventDate,
      eventLocation: event.location,
      userEmail,
      userName,
      userId,
      joinedAt: new Date(),
    };

    const result = await joinsCollection.insertOne(join);

    res.status(201).json({
      ...join,
      _id: result.insertedId,
    });
  } catch (error) {
    console.error("Error joining event:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// GET endpoint to count the people who joined an event
app.get("/api/joins/count", async (req, res) => {
  try {
    const eventId = toText(req.query.eventId);

    if (!parseObjectId(eventId)) {
      return res.status(400).json({
        message: "Invalid event id.",
      });
    }

    const count = await joinsCollection.countDocuments({
      eventId,
    });

    res.status(200).json({
      count,
    });
  } catch (error) {
    console.error("Error counting joins:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// GET endpoint for events joined by a user (authenticated, own records only)
app.get("/api/joins", verifyJwt, async (req, res) => {
  try {
    const requestedEmail = toText(req.query.email).toLowerCase();

    const userEmail = requestedEmail || req.auth.email;
    const eventId = toText(req.query.eventId);

    if (userEmail !== req.auth.email) {
      return res.status(403).json({
        message: "You can only view your own joined events.",
      });
    }

    const filter = { userEmail };

    if (eventId) {
      if (!parseObjectId(eventId)) {
        return res.status(400).json({
          message: "Invalid event id.",
        });
      }

      filter.eventId = eventId;
    }

    const joins = await joinsCollection.find(filter).toArray();

    if (eventId) {
      return res.status(200).json(joins);
    }

    const objectIds = joins
      .map((join) => parseObjectId(join.eventId))
      .filter(Boolean);

    const events = objectIds.length
      ? await eventsCollection
          .find({
            _id: { $in: objectIds },
          })
          .toArray()
      : [];

    const eventById = new Map(
      events.map((event) => [String(event._id), event]),
    );

    const joinedEvents = joins
      .map((join) => ({
        ...join,
        event: eventById.get(join.eventId),
      }))
      .filter((join) => join.event)
      .sort((a, b) =>
        String(a.event.eventDate).localeCompare(
          String(b.event.eventDate),
        ),
      );

    res.status(200).json(joinedEvents);
  } catch (error) {
    console.error("Error fetching joined events:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// GET endpoint for the root path
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

// Export Express app for Vercel
export default app;

// Start server locally only
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}
