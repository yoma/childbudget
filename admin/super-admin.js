const cfg = window.__SUPABASE_CONFIG__ ?? {};
const ADMIN_BUILD_VERSION = "2026-08-19-1545";
const ADMIN_API_URL = String(cfg.adminApiUrl ?? "").replace(/\/$/, "");

const adminWorkspaceEl = document.getElementById("adminWorkspace");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminEmailInput = document.getElementById("adminEmailInput");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminAuthStatusEl = document.getElementById("adminAuthStatus");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");

const createFamilyForm = document.getElementById("createFamilyForm");
const familyNameInput = document.getElementById("familyNameInput");
const childNameInput = document.getElementById("childNameInput");
const childSlugInput = document.getElementById("childSlugInput");
const createFamilyAppModeInput = document.getElementById("createFamilyAppModeInput");
const createFamilyStatusEl = document.getElementById("createFamilyStatus");
const createFamilyLinkEl = document.getElementById("createFamilyLink");

const createChildForm = document.getElementById("createChildForm");
const existingFamilyIdInput = document.getElementById("existingFamilyIdInput");
const newChildNameInput = document.getElementById("newChildNameInput");
const newChildSlugInput = document.getElementById("newChildSlugInput");
const createChildAppModeInput = document.getElementById("createChildAppModeInput");
const createChildStatusEl = document.getElementById("createChildStatus");
const createChildLinkEl = document.getElementById("createChildLink");

const createUserForm = document.getElementById("createUserForm");
const profileFamilyIdInput = document.getElementById("profileFamilyIdInput");
const newUserEmailInput = document.getElementById("newUserEmailInput");
const newUserPasswordInput = document.getElementById("newUserPasswordInput");
const newUserRoleInput = document.getElementById("newUserRoleInput");
const newUserDisplayNameInput = document.getElementById("newUserDisplayNameInput");
const createUserStatusEl = document.getElementById("createUserStatus");
const adminBuildMetaEl = document.getElementById("adminBuildMeta");

const superAdminOverviewEl = document.getElementById("superAdminOverview");
const refreshOverviewBtn = document.getElementById("refreshOverviewBtn");

const adminAuthState = {
  email: "",
  password: "",
};

init();

async function init() {
  window.__superAdminBooted = true;
  renderAdminBuildMeta("warn", "cloud check...");
  bindEvents();
  if (!ADMIN_API_URL) {
    renderAdminBuildMeta("offline", "cloud offline");
    setStatus(
      adminAuthStatusEl,
      "Login niet mogelijk: admin API niet geconfigureerd.",
      "error"
    );
    return;
  }
  renderAdminBuildMeta("online", "cloud klaar");
  setWorkspaceVisible(false);
}

function renderAdminBuildMeta(dotClass, cloudLabel) {
  if (!adminBuildMetaEl) {
    return;
  }
  const now = new Date();
  adminBuildMetaEl.innerHTML = `<span class="build-status-dot ${dotClass}" aria-hidden="true"></span>Build ${ADMIN_BUILD_VERSION} · geladen ${now.toLocaleString("nl-BE")} · ${cloudLabel}`;
}

function bindEvents() {
  adminLoginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleAdminLogin();
  });
  adminLogoutBtn.addEventListener("click", handleAdminLogout);
  createFamilyForm.addEventListener("submit", handleCreateFamilyWithChild);
  createChildForm.addEventListener("submit", handleCreateChild);
  createUserForm.addEventListener("submit", handleCreateUserWithProfile);
  refreshOverviewBtn.addEventListener("click", refreshOverview);
}

async function adminRequest(payload) {
  const response = await fetch(ADMIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: adminAuthState.email,
      password: adminAuthState.password,
      ...payload,
    }),
  });
  let body = null;
  try {
    body = await response.json();
  } catch (_error) {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return body;
}

async function handleAdminLogin() {
  setStatus(adminAuthStatusEl, "Inloggen...", "neutral");
  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value;
  if (!ADMIN_API_URL) {
    setStatus(adminAuthStatusEl, "Inloggen niet mogelijk: admin API ontbreekt.", "error");
    return;
  }
  if (!email || !password) {
    setStatus(adminAuthStatusEl, "Vul email en wachtwoord in.", "error");
    return;
  }

  try {
    adminAuthState.email = email;
    adminAuthState.password = password;
    await adminRequest({ action: "login" });
    setStatus(adminAuthStatusEl, "Ingelogd als super admin.", "success");
    renderAdminBuildMeta("online", "cloud online");
    setWorkspaceVisible(true);
    await refreshOverview();
  } catch (error) {
    adminAuthState.email = "";
    adminAuthState.password = "";
    renderAdminBuildMeta("offline", "cloud offline");
    setStatus(adminAuthStatusEl, networkErrorMessage(error), "error");
  }
}

function handleAdminLogout() {
  adminAuthState.email = "";
  adminAuthState.password = "";
  setWorkspaceVisible(false);
  setStatus(adminAuthStatusEl, "Uitgelogd.", "success");
}

async function handleCreateFamilyWithChild(event) {
  event.preventDefault();
  const familyName = familyNameInput.value.trim();
  const childName = childNameInput.value.trim();
  const childSlug = childSlugInput.value.trim().toLowerCase();
  setStatus(createFamilyStatusEl, "Family aanmaken...", "neutral");
  if (createFamilyLinkEl) {
    createFamilyLinkEl.textContent = "";
  }

  try {
    const result = await adminRequest({
      action: "createFamily",
      familyName,
      childName,
      childSlug,
    });
    const familyId = result.family_id;
    const childId = result.child_id;
    existingFamilyIdInput.value = familyId;
    profileFamilyIdInput.value = familyId;
    setStatus(
      createFamilyStatusEl,
      `Opgeslagen. Family + kind aangemaakt. family_id=${familyId} · child_id=${childId}`,
      "success"
    );
    if (createFamilyLinkEl) {
      const appMode = readAppModeFromSelect(createFamilyAppModeInput);
      const appUrl = buildChildAppUrl(familyId, childId, childSlug, childName, appMode);
      createFamilyLinkEl.innerHTML = formatAppLinkHtml(appUrl, appMode);
    }
    await refreshOverview();
  } catch (error) {
    setStatus(createFamilyStatusEl, `Family aanmaken mislukt: ${error.message}`, "error");
  }
}

async function handleCreateChild(event) {
  event.preventDefault();
  setStatus(createChildStatusEl, "Kind toevoegen...", "neutral");
  if (createChildLinkEl) {
    createChildLinkEl.textContent = "";
  }
  const familyId = existingFamilyIdInput.value.trim();
  const childName = newChildNameInput.value.trim();
  const childSlug = newChildSlugInput.value.trim().toLowerCase();
  try {
    const result = await adminRequest({
      action: "createChild",
      familyId,
      childName,
      childSlug,
    });
    const appMode = readAppModeFromSelect(createChildAppModeInput);
    setStatus(
      createChildStatusEl,
      `Opgeslagen. child_id=${result.child_id} · modus=${appMode}`,
      "success"
    );
    if (createChildLinkEl) {
      const appUrl = buildChildAppUrl(familyId, result.child_id, childSlug, childName, appMode);
      createChildLinkEl.innerHTML = formatAppLinkHtml(appUrl, appMode);
    }
    await refreshOverview();
  } catch (error) {
    setStatus(createChildStatusEl, `Kind toevoegen mislukt: ${error.message}`, "error");
  }
}

async function handleCreateUserWithProfile(event) {
  event.preventDefault();
  setStatus(createUserStatusEl, "Profiel aanmaken...", "neutral");
  const familyId = profileFamilyIdInput.value.trim();
  const role = newUserRoleInput.value;
  const displayName = newUserDisplayNameInput.value.trim();
  try {
    const result = await adminRequest({
      action: "createProfile",
      familyId,
      role,
      displayName,
    });
    setStatus(
      createUserStatusEl,
      `Opgeslagen. Profiel klaar (${role}). PIN blijft in de app, dit is geen aparte login. id=${result.profile_id}`,
      "success"
    );
    await refreshOverview();
  } catch (error) {
    setStatus(createUserStatusEl, `Profile koppelen mislukt: ${error.message}`, "error");
  }
}

async function refreshOverview() {
  try {
    const result = await adminRequest({ action: "overview" });
    const families = result.families ?? [];
    if (families.length === 0) {
      superAdminOverviewEl.innerHTML = `<p class="muted">Nog geen families zichtbaar voor deze admin.</p>`;
      return;
    }
    superAdminOverviewEl.innerHTML = families
      .map((family) => {
        const children = asList(family.children);
        const profiles = asList(family.profiles);
        const childLinks =
          children
            .map((c) => {
              const familyUrl = buildChildAppUrl(family.id, c.id, c.slug, c.display_name, "family");
              const soloUrl = buildChildAppUrl(family.id, c.id, c.slug, c.display_name, "solo");
              return `${escapeHtml(c.display_name)} (${escapeHtml(c.slug)}) - <a href="${familyUrl}" target="_blank" rel="noopener">family</a> · <a href="${soloUrl}" target="_blank" rel="noopener">solo</a>`;
            })
            .join(", ") || "geen";
        const profileText =
          profiles.map((p) => `${escapeHtml(p.display_name)} [${escapeHtml(p.role)}]`).join(", ") || "geen";
        return `
        <div class="overview-row">
          <strong>${escapeHtml(family.name)}</strong>
          <p>family_id: ${escapeHtml(family.id)}</p>
          <p>kinderen: ${childLinks}</p>
          <p>users: ${profileText}</p>
        </div>
      `;
      })
      .join("");
  } catch (error) {
    superAdminOverviewEl.innerHTML = `<p class="muted">Overzicht laden mislukt: ${escapeHtml(
      error.message
    )}</p>`;
  }
}

function setWorkspaceVisible(isVisible) {
  adminWorkspaceEl.classList.toggle("hidden", !isVisible);
  adminLogoutBtn.classList.toggle("hidden", !isVisible);
  document.body.classList.toggle("admin-authed", isVisible);
}

function asList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

function setStatus(el, message, kind = "neutral") {
  if (!el) {
    return;
  }
  const normalizedKind =
    typeof kind === "boolean" ? (kind ? "success" : "error") : kind;
  const prefix = normalizedKind === "success" ? "✅ " : normalizedKind === "error" ? "⚠️ " : "";
  el.textContent =
    normalizedKind === "neutral" || !message || message.startsWith("✅") || message.startsWith("⚠️")
      ? message
      : `${prefix}${message}`;
  el.classList.toggle("muted", normalizedKind === "neutral");
  el.classList.toggle("positive", Boolean(message) && normalizedKind === "success");
  el.classList.toggle("error", Boolean(message) && normalizedKind === "error");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function networkErrorMessage(error) {
  const raw = String(error?.message ?? "").toLowerCase();
  const isFetchIssue = raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("fetch");
  if (!isFetchIssue) {
    return error?.message ?? "Onverwachte fout";
  }
  const onlineHint = navigator.onLine
    ? "Je internet werkt, dus dit lijkt een blokkade naar de admin API (adblock, extensie of firewall)."
    : "Je lijkt offline. Controleer je internetverbinding.";
  return `Inloggen mislukt: geen verbinding met de admin API. ${onlineHint}`;
}

function readAppModeFromSelect(selectEl) {
  const value = (selectEl?.value || "family").trim().toLowerCase();
  return value === "solo" ? "solo" : "family";
}

function formatAppLinkHtml(appUrl, appMode) {
  const label = appMode === "solo" ? "Solo-app link" : "Family-app link";
  return `${label}: <a href="${appUrl}" target="_blank" rel="noopener">${appUrl}</a>`;
}

function buildChildAppUrl(familyId, childId, childSlug, childName, appMode = "family") {
  const basePath = window.location.pathname.replace(/\/admin\/super-admin\.html$/i, "");
  const origin = window.location.origin;
  const routes = cfg.childRoutes ?? {};
  const slugMatch = Object.entries(routes).find(([, route]) => {
    return route.familyId === familyId && route.childId === childId && (route.mode || "family") === appMode;
  });
  if (slugMatch) {
    const slug = slugMatch[0];
    const shortUrl = `${origin}${basePath}/${slug}/`;
    return shortUrl.endsWith("//") ? `${origin}${basePath}/${slug}` : shortUrl;
  }
  const params = new URLSearchParams({
    family: familyId,
    child: childId,
  });
  if (childSlug) {
    params.set("childSlug", childSlug);
  }
  if (childName) {
    params.set("childName", childName);
  }
  if (appMode === "solo") {
    params.set("mode", "solo");
  }
  return `${origin}${basePath}/index.html?${params.toString()}`;
}

if (cfg.familyId && existingFamilyIdInput && !existingFamilyIdInput.value) {
  existingFamilyIdInput.value = cfg.familyId;
}
