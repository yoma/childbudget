const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const ROLES = new Set(["mama", "papa", "lena", "admin"]);

function applyCors(req, res) {
  const allowed = process.env.SNAPSHOT_CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
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

function credentialsOk(email, password) {
  const expectedEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const expectedPassword = String(process.env.ADMIN_PASSWORD ?? "");
  if (!expectedEmail || !expectedPassword) {
    return { ok: false, missing: true };
  }
  const emailOk = secretsEqual(normalizeEmail(email), expectedEmail);
  const passwordOk = secretsEqual(String(password ?? ""), expectedPassword);
  return { ok: emailOk && passwordOk, missing: false };
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Alleen POST." });
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    sendJson(res, 500, { error: "DATABASE_URL ontbreekt op de server." });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (_error) {
    sendJson(res, 400, { error: "Ongeldige JSON." });
    return;
  }

  const auth = credentialsOk(body.email, body.password);
  if (auth.missing) {
    sendJson(res, 500, { error: "ADMIN_EMAIL of ADMIN_PASSWORD ontbreekt op de server." });
    return;
  }
  if (!auth.ok) {
    sendJson(res, 401, { error: "Ongeldige admin-login." });
    return;
  }

  const sql = neon(databaseUrl);
  const action = String(body.action ?? "").trim();

  try {
    if (action === "login") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (action === "overview") {
      const families = await sql`
        select
          f.id,
          f.name,
          (
            select coalesce(
              json_agg(
                json_build_object(
                  'id', c.id,
                  'display_name', c.display_name,
                  'slug', c.slug
                )
                order by c.display_name
              ),
              '[]'::json
            )
            from public.children c
            where c.family_id = f.id
          ) as children,
          (
            select coalesce(
              json_agg(
                json_build_object(
                  'id', p.id,
                  'role', p.role,
                  'display_name', p.display_name
                )
                order by p.display_name
              ),
              '[]'::json
            )
            from public.profiles p
            where p.family_id = f.id
          ) as profiles
        from public.families f
        order by f.created_at
      `;
      sendJson(res, 200, { families });
      return;
    }

    if (action === "createFamily") {
      const familyName = String(body.familyName ?? "").trim();
      const childName = String(body.childName ?? "").trim();
      const childSlug = String(body.childSlug ?? "").trim().toLowerCase();
      if (!familyName || !childName || !SLUG_RE.test(childSlug)) {
        sendJson(res, 400, { error: "Family naam, kind naam en slug (a-z, 0-9, -) zijn verplicht." });
        return;
      }
      const familyRows = await sql`
        insert into public.families (name)
        values (${familyName})
        returning id
      `;
      const familyId = familyRows[0].id;
      await sql`
        insert into public.profiles (id, family_id, role, display_name)
        values (gen_random_uuid(), ${familyId}::uuid, 'admin', 'Super Admin')
      `;
      const childRows = await sql`
        insert into public.children (family_id, slug, display_name)
        values (${familyId}::uuid, ${childSlug}, ${childName})
        returning id
      `;
      sendJson(res, 200, { ok: true, family_id: familyId, child_id: childRows[0].id });
      return;
    }

    if (action === "createChild") {
      const familyId = String(body.familyId ?? "").trim();
      const childName = String(body.childName ?? "").trim();
      const childSlug = String(body.childSlug ?? "").trim().toLowerCase();
      if (!isUuid(familyId) || !childName || !SLUG_RE.test(childSlug)) {
        sendJson(res, 400, { error: "family_id, kind naam en slug (a-z, 0-9, -) zijn verplicht." });
        return;
      }
      const childRows = await sql`
        insert into public.children (family_id, slug, display_name)
        values (${familyId}::uuid, ${childSlug}, ${childName})
        returning id
      `;
      sendJson(res, 200, { ok: true, child_id: childRows[0].id, family_id: familyId });
      return;
    }

    if (action === "createProfile") {
      const familyId = String(body.familyId ?? "").trim();
      const role = String(body.role ?? "").trim();
      const displayName = String(body.displayName ?? "").trim();
      if (!isUuid(familyId) || !ROLES.has(role) || !displayName) {
        sendJson(res, 400, { error: "family_id, geldige rol en display naam zijn verplicht." });
        return;
      }
      const profileRows = await sql`
        insert into public.profiles (id, family_id, role, display_name)
        values (gen_random_uuid(), ${familyId}::uuid, ${role}, ${displayName})
        returning id
      `;
      sendJson(res, 200, { ok: true, profile_id: profileRows[0].id });
      return;
    }

    sendJson(res, 400, { error: "Onbekende actie." });
  } catch (error) {
    sendJson(res, 500, { error: error?.message ?? "Databasefout." });
  }
};
