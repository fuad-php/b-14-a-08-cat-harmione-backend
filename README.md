# Assignment 08 — Social Development Events API

A small REST API for creating and browsing social development events, and for users to
join them. Built with **Express 5** and **MongoDB**, authenticated with
**HS256 JWTs** issued by a companion Next.js app.

## Tech Stack

- **Node.js** (ES modules, top-level `await`)
- **Express 5**
- **MongoDB** via the official `mongodb` driver
- **jose** for JWT verification
- **cors** and **dotenv**

## Features

- List events with filtering (`upcoming`, `creatorEmail`), sorting
  (`eventDate` or `createdAt`, ascending/descending) and a `limit`.
- Fetch, create, update, and delete individual events.
- Event ownership rules: only the creator may update or delete an event.
- Join an event (one join per user per event), count attendees, and list
  the events a user has joined.
- Input validation for all event fields, including ISO date checks and a
  "no past dates" rule.
- Bearer-token authentication that derives the acting user's identity from
  the JWT rather than trusting emails sent in the request body.


## Deployment

The app exports the Express instance as the default export (`export default app`)
for serverless platforms such as Vercel, while `NODE_ENV=production` disables
the local `app.listen()` call. Set `MONGO_URI` and `JWT_SECRET` in the hosting
provider's environment settings.

