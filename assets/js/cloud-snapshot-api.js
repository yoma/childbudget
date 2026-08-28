/**
 * Neon snapshot-client via Vercel /api/snapshot.
 * super-admin.js blijft op Supabase.
 */
(function (global) {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function readConfig() {
    const cfg = global.__SUPABASE_CONFIG__ ?? {};
    return {
      apiUrl: String(cfg.snapshotApiUrl ?? cfg.SNAPSHOT_API_URL ?? "/api/snapshot").replace(/\/$/, ""),
      secret: String(cfg.snapshotSecret ?? ""),
    };
  }

  const FETCH_TIMEOUT_MS = 8000;

  function isConfigured() {
    const { apiUrl, secret } = readConfig();
    return Boolean(apiUrl && secret);
  }

  async function request(path, options = {}) {
    const { apiUrl, secret } = readConfig();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-snapshot-secret": secret,
          ...(options.headers ?? {}),
        },
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Cloud-timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    let body = null;
    try {
      body = await response.json();
    } catch (_error) {
      body = null;
    }
    if (!response.ok && response.status !== 404) {
      const message = body?.error || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return { response, body };
  }

  async function probeSnapshotApi() {
    if (!isConfigured()) {
      return { ok: false, error: "Snapshot API niet geconfigureerd" };
    }
    try {
      const { response } = await request("?child_id=00000000-0000-4000-8000-000000000000", {
        method: "GET",
      });
      if (response.status === 401) {
        return { ok: false, error: "Snapshot-geheim geweigerd" };
      }
      if (response.status === 200 || response.status === 404 || response.status === 400) {
        return { ok: true, error: "" };
      }
      return { ok: false, error: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, error: error?.message ?? "connectie mislukt" };
    }
  }

  async function fetchSnapshot(childId) {
    if (!UUID_RE.test(String(childId ?? ""))) {
      throw new Error("child_id moet een UUID zijn.");
    }
    const { response, body } = await request(`?child_id=${encodeURIComponent(childId)}`, {
      method: "GET",
    });
    if (response.status === 404 || !body?.payload) {
      return { payload: null, updated_at: null };
    }
    return {
      payload: body.payload,
      updated_at: body.updated_at ?? null,
    };
  }

  async function upsertSnapshot({ childId, familyId, payload, updatedAt }) {
    if (!UUID_RE.test(String(childId ?? "")) || !UUID_RE.test(String(familyId ?? ""))) {
      throw new Error("child_id en family_id moeten UUIDs zijn.");
    }
    await request("", {
      method: "PUT",
      body: JSON.stringify({
        child_id: childId,
        family_id: familyId,
        payload,
        updated_at: updatedAt || new Date().toISOString(),
      }),
    });
  }

  global.cloudSnapshotApi = {
    isConfigured,
    probeSnapshotApi,
    fetchSnapshot,
    upsertSnapshot,
  };
})(window);
