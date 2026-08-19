const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function applyCors(req, res) {
  const allowed = process.env.SNAPSHOT_CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-snapshot-secret");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (allowed !== "*") {
    res.setHeader("Vary", "Origin");
  }
}

function secretsEqual(provided, expected) {
  const left = Buffer.from(String(provided ?? ""), "utf8");
  const right = Buffer.from(String(expected ?? ""), "utf8");
  if (left.length !== right.length || right.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function readSecret(req) {
  const header = req.headers["x-snapshot-secret"];
  if (typeof header === "string") {
    return header;
  }
  if (Array.isArray(header) && header[0]) {
    return header[0];
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const expectedSecret = process.env.SNAPSHOT_SECRET;
  if (!expectedSecret) {
    sendJson(res, 500, { error: "SNAPSHOT_SECRET ontbreekt op de server." });
    return;
  }
  if (!secretsEqual(readSecret(req), expectedSecret)) {
    sendJson(res, 401, { error: "Ongeldig snapshot-geheim." });
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    sendJson(res, 500, { error: "DATABASE_URL ontbreekt op de server." });
    return;
  }

  const sql = neon(databaseUrl);

  try {
    if (req.method === "GET") {
      const childId = String(req.query?.child_id ?? "").trim();
      if (!isUuid(childId)) {
        sendJson(res, 400, { error: "child_id moet een UUID zijn." });
        return;
      }
      const rows = await sql`
        select payload, updated_at
        from public.child_budget_snapshots
        where child_id = ${childId}
        limit 1
      `;
      if (!rows[0]) {
        sendJson(res, 404, { payload: null, updated_at: null });
        return;
      }
      sendJson(res, 200, {
        payload: rows[0].payload,
        updated_at: rows[0].updated_at,
      });
      return;
    }

    if (req.method === "PUT") {
      const body = await readJsonBody(req);
      const childId = String(body.child_id ?? "").trim();
      const familyId = String(body.family_id ?? "").trim();
      const payload = body.payload;
      const updatedAt = body.updated_at || new Date().toISOString();
      if (!isUuid(childId) || !isUuid(familyId)) {
        sendJson(res, 400, { error: "child_id en family_id moeten UUIDs zijn." });
        return;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        sendJson(res, 400, { error: "payload moet een object zijn." });
        return;
      }
      const payloadJson = JSON.stringify(payload);
      await sql`
        insert into public.child_budget_snapshots (child_id, family_id, payload, updated_at)
        values (${childId}::uuid, ${familyId}::uuid, ${payloadJson}::jsonb, ${updatedAt}::timestamptz)
        on conflict (child_id) do update set
          family_id = excluded.family_id,
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `;
      sendJson(res, 200, { ok: true, child_id: childId, updated_at: updatedAt });
      return;
    }

    sendJson(res, 405, { error: "Alleen GET en PUT." });
  } catch (error) {
    sendJson(res, 500, { error: error?.message ?? "Databasefout." });
  }
};
