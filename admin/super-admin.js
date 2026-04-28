const cfg = window.__SUPABASE_CONFIG__ ?? {};
const supabaseClient = window.supabase?.createClient?.(cfg.url, cfg.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
const ADMIN_BUILD_VERSION = "2026-04-28-1623";

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
const createFamilyStatusEl = document.getElementById("createFamilyStatus");

const createChildForm = document.getElementById("createChildForm");
const existingFamilyIdInput = document.getElementById("existingFamilyIdInput");
const newChildNameInput = document.getElementById("newChildNameInput");
const newChildSlugInput = document.getElementById("newChildSlugInput");
const createChildStatusEl = document.getElementById("createChildStatus");

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
  if (!supabaseClient) {
    renderAdminBuildMeta("offline", "cloud offline");
    setStatus(
      adminAuthStatusEl,
      "Login niet mogelijk: Supabase client niet geladen (check script-paden/config).",
      false
    );
    return;
  }
  const { data, error } = await supabaseClient.auth.getSession();
  renderAdminBuildMeta(error ? "offline" : "online", error ? "cloud offline" : "cloud online");
  setWorkspaceVisible(Boolean(data.session));
  if (data.session) {
    await refreshOverview();
  }
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

async function handleAdminLogin() {
  setStatus(adminAuthStatusEl, "Inloggen...", true);
  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value;
  if (!supabaseClient) {
    setStatus(
      adminAuthStatusEl,
      "Inloggen niet mogelijk: Supabase client ontbreekt. Herlaad pagina of check configuratie.",
      false
    );
    return;
  }
  if (!email || !password) {
    setStatus(adminAuthStatusEl, "Vul email en wachtwoord in.", false);
    return;
  }

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      const lowered = String(error.message || "").toLowerCase();
      if (lowered.includes("email not confirmed")) {
        setStatus(
          adminAuthStatusEl,
          "Inloggen mislukt: email nog niet bevestigd. Zet user op confirmed in Supabase Auth.",
          false
        );
        return;
      }
      setStatus(adminAuthStatusEl, `Inloggen mislukt: ${error.message}`, false);
      return;
    }
    adminAuthState.email = email;
    adminAuthState.password = password;
    setStatus(adminAuthStatusEl, "Ingelogd als super admin.", true);
    setWorkspaceVisible(true);
    await refreshOverview();
  } catch (error) {
    setStatus(adminAuthStatusEl, `Onverwachte fout: ${error?.message ?? "onbekend"}`, false);
  }
}

async function handleAdminLogout() {
  await supabaseClient.auth.signOut();
  setWorkspaceVisible(false);
  setStatus(adminAuthStatusEl, "Uitgelogd.", true);
}

async function handleCreateFamilyWithChild(event) {
  event.preventDefault();
  const familyName = familyNameInput.value.trim();
  const childName = childNameInput.value.trim();
  const childSlug = childSlugInput.value.trim().toLowerCase();
  setStatus(createFamilyStatusEl, "Family aanmaken...", true);

  const userId = (await supabaseClient.auth.getUser()).data.user?.id;
  if (!userId) {
    setStatus(createFamilyStatusEl, "Geen actieve admin sessie.", false);
    return;
  }

  const { data: familyData, error: familyError } = await supabaseClient
    .from("families")
    .insert({ name: familyName })
    .select("id")
    .single();

  if (familyError) {
    setStatus(createFamilyStatusEl, `Family aanmaken mislukt: ${familyError.message}`, false);
    return;
  }

  const familyId = familyData.id;
  const { error: seedProfileError } = await supabaseClient.from("profiles").insert({
    id: userId,
    family_id: familyId,
    role: "admin",
    display_name: "Super Admin",
  });

  if (seedProfileError && !seedProfileError.message.toLowerCase().includes("duplicate")) {
    setStatus(createFamilyStatusEl, `Admin profile koppelen mislukt: ${seedProfileError.message}`, false);
    return;
  }

  const { data: childData, error: childError } = await supabaseClient
    .from("children")
    .insert({
      family_id: familyId,
      slug: childSlug,
      display_name: childName,
    })
    .select("id")
    .single();

  if (childError) {
    setStatus(createFamilyStatusEl, `Kind aanmaken mislukt: ${childError.message}`, false);
    return;
  }

  existingFamilyIdInput.value = familyId;
  profileFamilyIdInput.value = familyId;
  setStatus(createFamilyStatusEl, `Klaar. family_id=${familyId} · child_id=${childData.id}`, true);
  await refreshOverview();
}

async function handleCreateChild(event) {
  event.preventDefault();
  setStatus(createChildStatusEl, "Kind toevoegen...", true);
  const { error } = await supabaseClient.from("children").insert({
    family_id: existingFamilyIdInput.value.trim(),
    slug: newChildSlugInput.value.trim().toLowerCase(),
    display_name: newChildNameInput.value.trim(),
  });
  if (error) {
    setStatus(createChildStatusEl, `Kind toevoegen mislukt: ${error.message}`, false);
    return;
  }
  setStatus(createChildStatusEl, "Kind toegevoegd.", true);
  await refreshOverview();
}

async function handleCreateUserWithProfile(event) {
  event.preventDefault();
  setStatus(createUserStatusEl, "User aanmaken...", true);
  const email = newUserEmailInput.value.trim();
  const password = newUserPasswordInput.value;
  const familyId = profileFamilyIdInput.value.trim();
  const role = newUserRoleInput.value;
  const displayName = newUserDisplayNameInput.value.trim();

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({ email, password });
  if (signUpError) {
    setStatus(createUserStatusEl, `Auth user aanmaken mislukt: ${signUpError.message}`, false);
    return;
  }
  const newUserId = signUpData.user?.id;
  if (!newUserId) {
    setStatus(createUserStatusEl, "User ID ontbreekt na signUp.", false);
    return;
  }

  if (adminAuthState.email && adminAuthState.password) {
    await supabaseClient.auth.signInWithPassword({
      email: adminAuthState.email,
      password: adminAuthState.password,
    });
  }

  const { error: profileError } = await supabaseClient.from("profiles").insert({
    id: newUserId,
    family_id: familyId,
    role,
    display_name: displayName,
  });

  if (profileError) {
    setStatus(createUserStatusEl, `Profile koppelen mislukt: ${profileError.message}`, false);
    return;
  }
  setStatus(createUserStatusEl, `User + profile klaar (${role}).`, true);
  await refreshOverview();
}

async function refreshOverview() {
  const { data: families, error: familyError } = await supabaseClient
    .from("families")
    .select("id,name,children(id,display_name,slug),profiles(id,role,display_name)");

  if (familyError) {
    superAdminOverviewEl.innerHTML = `<p class="muted">Overzicht laden mislukt: ${escapeHtml(
      familyError.message
    )}</p>`;
    return;
  }

  if (!families || families.length === 0) {
    superAdminOverviewEl.innerHTML = `<p class="muted">Nog geen families zichtbaar voor deze admin.</p>`;
    return;
  }

  superAdminOverviewEl.innerHTML = families
    .map((family) => {
      const children = family.children ?? [];
      const profiles = family.profiles ?? [];
      return `
        <div class="overview-row">
          <span>
            <strong>${escapeHtml(family.name)}</strong><br/>
            family_id: ${family.id}<br/>
            kinderen: ${children.map((c) => `${escapeHtml(c.display_name)} (${escapeHtml(c.slug)})`).join(", ") || "geen"}<br/>
            users: ${profiles.map((p) => `${escapeHtml(p.display_name)} [${escapeHtml(p.role)}]`).join(", ") || "geen"}
          </span>
        </div>
      `;
    })
    .join("");
}

function setWorkspaceVisible(isVisible) {
  adminWorkspaceEl.classList.toggle("hidden", !isVisible);
  adminLogoutBtn.classList.toggle("hidden", !isVisible);
}

function setStatus(el, message, isSuccess) {
  el.textContent = message;
  el.classList.remove("muted");
  el.classList.toggle("positive", Boolean(message) && isSuccess);
  el.classList.toggle("error", Boolean(message) && !isSuccess);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
