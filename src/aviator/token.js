const crypto = require("crypto");

const TOKEN_SECRET = process.env.AVIATOR_TOKEN_SECRET || "aviator_dev_secret";
const TOKEN_TTL_MS = Number(process.env.AVIATOR_TOKEN_TTL_MS || 15 * 60 * 1000);

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64").toString("utf8");
}

function signPayload(payload) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
}

function createAviatorToken(userId, now = Date.now()) {
  const payload = JSON.stringify({ userId, ts: now });
  const encoded = base64UrlEncode(payload);
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

function verifyAviatorToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encoded, signature] = parts;
  const expected = signPayload(encoded);
  if (signature.length !== expected.length) {
    return null;
  }
  const valid = crypto.timingSafeEqual(
    Buffer.from(signature, "utf8"),
    Buffer.from(expected, "utf8")
  );

  if (!valid) {
    return null;
  }

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch (err) {
    return null;
  }

  if (!payload || typeof payload.userId !== "string" || !payload.ts) {
    return null;
  }

  const age = Date.now() - Number(payload.ts);
  if (!Number.isFinite(age) || age < 0 || age > TOKEN_TTL_MS) {
    return null;
  }

  return payload;
}

module.exports = {
  createAviatorToken,
  verifyAviatorToken,
  TOKEN_TTL_MS
};
