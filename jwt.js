import { jwtVerify } from "jose";

const ISSUER = "auracivic-web";
const AUDIENCE = "auracivic-events-api";

const secretValue = process.env.JWT_SECRET;

if (!secretValue) {
  throw new Error("JWT_SECRET is not set. Add it to .env.");
}

const secret = new TextEncoder().encode(secretValue);

/**
 * Verifies the HS256 bearer token issued by the Next.js app (/api/token).
 * On success it exposes `req.auth = { userId, email, name }`, which routes use
 * instead of trusting user-supplied emails.
 */
export async function verifyJwt(req, res, next) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });

    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";

    if (!payload.sub || !email) {
      return res.status(401).json({ message: "Invalid authentication token." });
    }

    req.auth = {
      userId: String(payload.sub),
      email,
      name: typeof payload.name === "string" ? payload.name : "",
    };

    return next();
  } catch {
    return res
      .status(401)
      .json({ message: "Invalid or expired authentication token." });
  }
}
