const defaultCategories = [
  { id: "zakgeld", label: "Zakgeld", emoji: "💜", enabled: true, color: "#8d45cc" },
  { id: "kleding", label: "Kledingsbudget", emoji: "👗", enabled: true, color: "#2f5ea2" },
];

const CATEGORY_COLOR_FALLBACK_PALETTE = ["#4a9ca8", "#b86893", "#6f8e3a", "#ad7d44", "#5c6bc0", "#c2185b"];

const urlParams = new URLSearchParams(window.location.search);
const appConfig = window.__SUPABASE_CONFIG__ ?? {};

function resolvePathSlugRoute() {
  const routes = appConfig.childRoutes ?? {};
  const presetSlug = String(window.__ROUTE_SLUG__ ?? "").trim().toLowerCase();
  if (presetSlug && routes[presetSlug]) {
    return { slug: presetSlug, ...routes[presetSlug] };
  }
  const reserved = new Set(["childbudget", "admin", "assets", "index.html"]);
  const segments = window.location.pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i].toLowerCase();
    if (reserved.has(segment)) {
      continue;
    }
    if (routes[segment]) {
      return { slug: segment, ...routes[segment] };
    }
  }
  const routeParam = (urlParams.get("route") || "").trim().toLowerCase();
  if (routeParam && routes[routeParam]) {
    return { slug: routeParam, ...routes[routeParam] };
  }
  return null;
}

const pathRoute = resolvePathSlugRoute();
const IS_SOLO_MODE =
  (urlParams.get("mode") || pathRoute?.mode || "").trim().toLowerCase() === "solo";
const SOLO_OWNER = "self";
const PARENTS = IS_SOLO_MODE ? [SOLO_OWNER] : ["mama", "papa"];

function createEmptyOwnerAmounts() {
  return Object.fromEntries(PARENTS.map((owner) => [owner, 0]));
}

function createDefaultState() {
  const categorySeed = structuredClone(defaultCategories);
  const emptyRecurring = Object.fromEntries(
    defaultCategories.map((c) => [c.id, IS_SOLO_MODE ? 0 : 0])
  );
  const emptyStarts = Object.fromEntries(defaultCategories.map((c) => [c.id, null]));
  const emptyIntervals = Object.fromEntries(defaultCategories.map((c) => [c.id, 1]));

  if (IS_SOLO_MODE) {
    return {
      pins: { [SOLO_OWNER]: "1111" },
      monthlyBudgets: {},
      recurringBudgets: { [SOLO_OWNER]: { ...emptyRecurring } },
      recurringStartMonth: { [SOLO_OWNER]: { ...emptyStarts } },
      recurringIntervalMonths: { [SOLO_OWNER]: { ...emptyIntervals } },
      transactions: [],
      categories: categorySeed,
      coachSettings: {
        autoCoachEnabled: true,
        sensitivity: "normal",
        parentMessages: {
          [SOLO_OWNER]: { text: "", expiresAt: null, readAt: null },
        },
      },
      appMode: "solo",
      syncRevision: 0,
    };
  }

  return {
    appMode: "family",
    pins: { mama: "1111", papa: "2222" },
    monthlyBudgets: {},
    recurringBudgets: {
      mama: { zakgeld: 0, kleding: 0 },
      papa: { zakgeld: 0, kleding: 0 },
    },
    recurringStartMonth: {
      mama: { zakgeld: null, kleding: null },
      papa: { zakgeld: null, kleding: null },
    },
    recurringIntervalMonths: {
      mama: { zakgeld: 1, kleding: 1 },
      papa: { zakgeld: 1, kleding: 1 },
    },
    transactions: [],
    categories: categorySeed,
    coachSettings: {
      autoCoachEnabled: true,
      sensitivity: "normal",
      parentMessages: {
        mama: { text: "", expiresAt: null, readAt: null },
        papa: { text: "", expiresAt: null, readAt: null },
      },
    },
    syncRevision: 0,
  };
}

const defaultState = createDefaultState();

const currency = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
});

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const APP_BUILD_VERSION = "2026-05-08-1625";
const APP_MODE = IS_SOLO_MODE ? "solo" : "family";
const CONFIGURED_LENA_CHILD_ID = String(appConfig.childId ?? "").trim();
const childIdFromUrl = (urlParams.get("child") || pathRoute?.childId || "").trim();
// Solo gebruikt nooit de family-default (Lena) uit config — alleen route, ?child= of soloChildId.
const ACTIVE_CHILD_ID =
  childIdFromUrl ||
  (IS_SOLO_MODE ? String(appConfig.soloChildId ?? "").trim() : CONFIGURED_LENA_CHILD_ID) ||
  "default-child";
const ACTIVE_FAMILY_ID = (
  urlParams.get("family") ||
  pathRoute?.familyId ||
  appConfig.familyId ||
  "default-family"
).trim();
const CHILD_NAME = (urlParams.get("childName") || pathRoute?.childName || appConfig.childName || "Lena").trim();
const defaultAppName = `${CHILD_NAME.toLowerCase().replace(/\s+/g, "-")}_budget`;
const APP_NAME = (urlParams.get("appName") || appConfig.appName || defaultAppName).trim();
const STORAGE_KEY = `child-budget-v1:${ACTIVE_FAMILY_ID}:${ACTIVE_CHILD_ID}:${APP_MODE}`;
const LEGACY_STORAGE_KEY = `child-budget-v1:${ACTIVE_FAMILY_ID}:${ACTIVE_CHILD_ID}`;
const CLOUD_SYNC_BLOCKED = detectCloudSyncCrossAppRisk();
window.__ACTIVE_APP_CONTEXT__ = {
  familyId: ACTIVE_FAMILY_ID,
  childId: ACTIVE_CHILD_ID,
  mode: APP_MODE,
  routeSlug: pathRoute?.slug ?? null,
  storageKey: STORAGE_KEY,
};

function looksLikeUuid(value) {
  const s = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function detectCloudSyncCrossAppRisk() {
  if (!looksLikeUuid(ACTIVE_CHILD_ID) || !looksLikeUuid(CONFIGURED_LENA_CHILD_ID)) {
    return false;
  }
  if (!IS_SOLO_MODE) {
    return false;
  }
  // Solo op dezelfde child_id als Lena = gegarandeerd rommel in de cloud.
  return ACTIVE_CHILD_ID === CONFIGURED_LENA_CHILD_ID;
}

function inferPayloadAppMode(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (payload.appMode === "solo" || payload.appMode === "family") {
    return payload.appMode;
  }
  const pins = payload.pins;
  if (pins?.self && !pins?.mama && !pins?.papa) {
    return "solo";
  }
  if (pins?.mama || pins?.papa) {
    return "family";
  }
  return null;
}

function payloadCompatibleWithCurrentApp(payload) {
  const inferred = inferPayloadAppMode(payload);
  if (inferred === null || inferred === APP_MODE) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      inferred === "family"
        ? "Cloud-data is voor mama/papa (family), niet voor solo — andere child-link gebruiken."
        : "Cloud-data is voor solo, niet voor deze family-link.",
  };
}

function stampAppModeOnState(stateRef) {
  stateRef.appMode = APP_MODE;
}

function normalizeOwnerKey(raw) {
  if (IS_SOLO_MODE) {
    return SOLO_OWNER;
  }
  return raw === "papa" ? "papa" : "mama";
}

function getSessionOwner() {
  return session.loggedInParent ? normalizeOwnerKey(session.loggedInParent) : null;
}

function ownerDisplayLabel(owner) {
  if (IS_SOLO_MODE) {
    return CHILD_NAME;
  }
  return owner === "mama" ? "Mama" : "Papa";
}

function sumCategoryBudgetForMonth(month, category) {
  return PARENTS.reduce((acc, owner) => acc + getBudgetAmountForMonth(month, category, owner), 0);
}

function sumOwnerSplit(split) {
  return PARENTS.reduce((acc, owner) => acc + (split[owner] ?? 0), 0);
}

function renderOwnerSplitHtml(split, className = "overview-split-mini") {
  if (IS_SOLO_MODE) {
    return "";
  }
  return `<div class="${className}"><span class="parent-mini-pill mama">mama ${currency.format(split.mama ?? 0)}</span><span class="parent-mini-pill papa">papa ${currency.format(split.papa ?? 0)}</span></div>`;
}

function normalizeStateForSolo(stateRef) {
  if (!IS_SOLO_MODE) {
    return;
  }

  stateRef.pins ??= {};
  if (!stateRef.pins[SOLO_OWNER]) {
    stateRef.pins[SOLO_OWNER] = stateRef.pins.mama || stateRef.pins.papa || "1111";
  }
  delete stateRef.pins.mama;
  delete stateRef.pins.papa;

  const categoryIds = (stateRef.categories ?? []).map((c) => c.id);

  const mergeNumericMaps = (key, combine) => {
    stateRef[key] ??= {};
    const mamaMap = stateRef[key].mama ?? {};
    const papaMap = stateRef[key].papa ?? {};
    const selfMap = stateRef[key][SOLO_OWNER] ?? {};
    stateRef[key][SOLO_OWNER] = {};
    categoryIds.forEach((cat) => {
      const mamaVal = Number(mamaMap[cat]) || 0;
      const papaVal = Number(papaMap[cat]) || 0;
      const selfVal = Number(selfMap[cat]) || 0;
      if (combine === "sum") {
        stateRef[key][SOLO_OWNER][cat] = mamaVal + papaVal + selfVal;
      } else if (combine === "max") {
        stateRef[key][SOLO_OWNER][cat] = Math.max(mamaVal, papaVal, selfVal);
      } else if (combine === "firstMonth") {
        stateRef[key][SOLO_OWNER][cat] =
          selfMap[cat] || mamaMap[cat] || papaMap[cat] || null;
      } else if (combine === "interval") {
        stateRef[key][SOLO_OWNER][cat] = clampRecurringIntervalMonths(
          selfMap[cat] ?? mamaMap[cat] ?? papaMap[cat] ?? 1
        );
      }
    });
    delete stateRef[key].mama;
    delete stateRef[key].papa;
  };

  mergeNumericMaps("recurringBudgets", "max");
  mergeNumericMaps("recurringStartMonth", "firstMonth");
  mergeNumericMaps("recurringIntervalMonths", "interval");

  Object.keys(stateRef.monthlyBudgets ?? {}).forEach((month) => {
    const monthEntry = stateRef.monthlyBudgets[month];
    if (!monthEntry || typeof monthEntry !== "object") {
      return;
    }
    categoryIds.forEach((cat) => {
      const cell = monthEntry[cat];
      if (!cell || typeof cell !== "object") {
        monthEntry[cat] = createEmptyOwnerAmounts();
        return;
      }
      const total =
        (Number(cell.mama) || 0) + (Number(cell.papa) || 0) + (Number(cell[SOLO_OWNER]) || 0);
      monthEntry[cat] = { [SOLO_OWNER]: total };
    });
  });

  stateRef.coachSettings ??= {};
  stateRef.coachSettings.parentMessages ??= {};
  const messages = stateRef.coachSettings.parentMessages;
  if (!messages[SOLO_OWNER]?.text) {
    messages[SOLO_OWNER] = messages.mama?.text
      ? { ...messages.mama }
      : messages.papa?.text
        ? { ...messages.papa }
        : messages[SOLO_OWNER] ?? { text: "", expiresAt: null };
  }
  delete messages.mama;
  delete messages.papa;

  (stateRef.transactions ?? []).forEach((tx) => {
    if (tx.createdBy === "mama" || tx.createdBy === "papa") {
      tx.createdBy = SOLO_OWNER;
    }
    if (Array.isArray(tx.budgetUsage)) {
      tx.budgetUsage.forEach((entry) => {
        if (entry.fromParent === "mama" || entry.fromParent === "papa") {
          entry.fromParent = SOLO_OWNER;
        }
      });
    }
    if (tx.borrowFromParent === "mama" || tx.borrowFromParent === "papa") {
      tx.borrowFromParent = SOLO_OWNER;
    }
  });
}

function applyCoachBadgeLabel() {
  const label = `${CHILD_NAME.toUpperCase()} COACH`;
  document.documentElement.style.setProperty("--coach-badge-label", `"${label}"`);
}

function applySoloModeDom() {
  if (!IS_SOLO_MODE) {
    return;
  }
  document.body.classList.add("app-mode-solo");
  applyCoachBadgeLabel();

  const pinTitle = pinForm?.querySelector("h3");
  const pinHelp = pinForm?.querySelector("p.muted");
  if (pinTitle) {
    pinTitle.textContent = "Beheer";
  }
  if (pinHelp) {
    pinHelp.textContent = "Voer je PIN in om budget en transacties te beheren.";
  }
  loginParentInput?.closest("label")?.classList.add("hidden");
  loginParentInput?.removeAttribute("required");

  if (parentModeBtn) {
    parentModeBtn.setAttribute("aria-label", "Beheer");
    parentModeBtn.setAttribute("title", "Beheer");
  }

  const panelTitle = parentPanel?.querySelector(".panel-header h2");
  if (panelTitle) {
    panelTitle.textContent = `${CHILD_NAME} — beheer`;
  }

  const overviewTag = document.querySelector(".balance-inline-overview .tag");
  if (overviewTag) {
    overviewTag.textContent = "Jouw budget";
  }

  const dashTitle = document.querySelector("#parentDashboardSection .card-header h3");
  if (dashTitle) {
    dashTitle.textContent = "Overzicht (deze maand)";
  }

  const budgetHelp = document.querySelector("#adminBudgetSection > p.muted");
  if (budgetHelp) {
    budgetHelp.textContent = "Wordt opgeslagen op jouw persoonlijke budget.";
  }

  const catHelp = document.querySelector("#adminCategorySection > p.muted");
  if (catHelp) {
    catHelp.textContent =
      "Categorieën gelden voor jouw hele app. Voeg toe, pas kleur aan of schakel uit.";
  }

  if (parentMessageLabelEl) {
    parentMessageLabelEl.textContent = "Persoonlijke herinnering (verschijnt bovenaan)";
  }

  const coachSection = document.getElementById("adminCoachSection");
  if (coachSection) {
    const coachTitle = coachSection.querySelector("h3");
    if (coachTitle) {
      coachTitle.textContent = `${CHILD_NAME} Coach instellingen`;
    }
    const coachIntro = coachSection.querySelector(":scope > p.muted");
    if (coachIntro) {
      coachIntro.textContent = "Automatische coach en gevoeligheid voor jouw budget.";
    }
    const coachSettingLabels = coachSection.querySelectorAll(".coach-settings-top label > span");
    if (coachSettingLabels[0]) {
      coachSettingLabels[0].textContent = "Automatische coach aan";
    }
    if (coachSettingLabels[1]) {
      coachSettingLabels[1].textContent = "Coach gevoeligheid";
    }
    const messageSubmitBtn = coachSection.querySelector("#parentMessageForm button[type='submit']");
    if (messageSubmitBtn) {
      messageSubmitBtn.textContent = "Herinnering opslaan";
    }
  }

  const pinSection = document.getElementById("adminPinSection");
  if (pinSection) {
    const pinHelpAdmin = pinSection.querySelector("p.muted");
    if (pinHelpAdmin) {
      pinHelpAdmin.textContent = "Wijzig je PIN voor beheer.";
    }
  }

  const txAccordion = document.getElementById("adminTransactionsSection");
  if (txAccordion) {
    const summary = txAccordion.querySelector("summary");
    if (summary) {
      summary.textContent = "Alle transacties bekijken";
    }
  }

  document.getElementById("parentDashboardSection")?.classList.add("hidden");
  document
    .querySelector('.admin-nav-btn[data-target="parentDashboardSection"]')
    ?.classList.add("hidden");
  parentTxFilterParentInput?.closest("label")?.classList.add("hidden");
  txFundingLabel?.classList.add("hidden");
}

async function resolveSoloBudgetUsageDecision({
  category,
  month,
  requestedAmount,
  excludeTxId,
  excludeLinkedTransferIds = [],
}) {
  const excludeTxIds = [excludeTxId, ...excludeLinkedTransferIds].filter(Boolean);
  const usage = [];
  let remaining = requestedAmount;
  const ownSplit = getParentRemainingSplit(category, month, { excludeTxIds });
  const ownAvailable = Math.max(0, ownSplit[SOLO_OWNER] ?? 0);
  remaining = Math.max(0, remaining - ownAvailable);

  while (remaining > 0.004) {
    const otherCategories = getEnabledCategoryIds().filter((item) => item !== category);
    const options = otherCategories
      .map((fromCategory) => {
        const split = getParentRemainingSplit(fromCategory, month, { excludeTxIds });
        const baseAvailable = Math.max(0, split[SOLO_OWNER] ?? 0);
        const alreadyUsed = usage
          .filter((entry) => entry.fromCategory === fromCategory)
          .reduce((acc, entry) => acc + entry.amount, 0);
        const available = Math.max(0, baseAvailable - alreadyUsed);
        return {
          fromParent: SOLO_OWNER,
          fromCategory,
          available,
          selectable: available > 0.004,
        };
      })
      .filter((entry) => entry.selectable);

    if (options.length === 0) {
      break;
    }

    const selected = await chooseBudgetSourceOption({
      actingParent: SOLO_OWNER,
      category,
      remaining,
      options,
    });
    if (!selected) {
      const totalPossible = options.reduce((acc, option) => acc + option.available, 0);
      if (totalPossible >= remaining) {
        return { usage: [], cancelledByUser: true };
      }
      break;
    }
    const amount = Math.min(remaining, selected.available);
    usage.push({
      fromParent: SOLO_OWNER,
      fromCategory: selected.fromCategory,
      amount,
    });
    remaining -= amount;
  }

  return { usage, cancelledByUser: false };
}

const state = loadState();
const chartRef = { instance: null };

const totalRemainingEl = document.getElementById("totalRemaining");
const monthLabelEl = document.getElementById("monthLabel");
const topAvailabilityBreakdownEl = document.getElementById("topAvailabilityBreakdown");
const coachAlertsEl = document.getElementById("coachAlerts");
const speedRingsEl = document.getElementById("speedRings");
const speedLegendEl = document.getElementById("speedLegend");
const clearOverviewEl = document.getElementById("clearOverview");
const rolloverBreakdownEl = document.getElementById("rolloverBreakdown");
const appTitleEl = document.getElementById("appTitle");
const appBuildMetaEl = document.getElementById("appBuildMeta");
const heroEyebrowEl = document.getElementById("heroEyebrow");
const heroGreetingEl = document.getElementById("heroGreeting");
const parentMessageLabelEl = document.getElementById("parentMessageLabel");
const childViewEl = document.getElementById("childView");
const parentModeBtn = document.getElementById("parentModeBtn");
const parentDialog = document.getElementById("parentDialog");
const pinForm = document.getElementById("pinForm");
const loginParentInput = document.getElementById("loginParent");
const pinInput = document.getElementById("pinInput");
const pinError = document.getElementById("pinError");
const cancelPinBtn = document.getElementById("cancelPinBtn");
const budgetSourceDialog = document.getElementById("budgetSourceDialog");
const budgetSourceMessageEl = document.getElementById("budgetSourceMessage");
const budgetSourceOptionsEl = document.getElementById("budgetSourceOptions");
const cancelBudgetSourceBtn = document.getElementById("cancelBudgetSourceBtn");
const useRecommendedBudgetSourceBtn = document.getElementById("useRecommendedBudgetSourceBtn");
const useSelectedBudgetSourceBtn = document.getElementById("useSelectedBudgetSourceBtn");
const parentPanel = document.getElementById("parentPanel");
const closeParentPanelBtn = document.getElementById("closeParentPanelBtn");
const logoutParentBtn = document.getElementById("logoutParentBtn");
const resetAllDataBtn = document.getElementById("resetAllDataBtn");
const adminQuickNavEl = document.getElementById("adminQuickNav");
const loggedInAsEl = document.getElementById("loggedInAs");
const cloudSyncStatusEl = document.getElementById("cloudSyncStatus");

const budgetForm = document.getElementById("budgetForm");
const budgetMonthInput = document.getElementById("budgetMonth");
const budgetCategoryInput = document.getElementById("budgetCategory");
const budgetAmountInput = document.getElementById("budgetAmount");
const budgetAutoRenewInput = document.getElementById("budgetAutoRenew");
const budgetRecurringIntervalWrap = document.getElementById("budgetRecurringIntervalWrap");
const budgetRecurringIntervalInput = document.getElementById("budgetRecurringInterval");
const autoRenewCountdownEl = document.getElementById("autoRenewCountdown");
const autoRenewOverviewEl = document.getElementById("autoRenewOverview");
const categoryConfigForm = document.getElementById("categoryConfigForm");
const newCategoryNameInput = document.getElementById("newCategoryNameInput");
const newCategoryEmojiInput = document.getElementById("newCategoryEmojiInput");
const newCategoryColorInput = document.getElementById("newCategoryColorInput");
const categoryConfigStatusEl = document.getElementById("categoryConfigStatus");
const categoryConfigListEl = document.getElementById("categoryConfigList");

const txForm = document.getElementById("transactionForm");
const txDateInput = document.getElementById("txDate");
const txCategoryInput = document.getElementById("txCategory");
const txTypeInput = document.getElementById("txType");
const txModeLabel = document.getElementById("txModeLabel");
const txTopupDetails = document.getElementById("txTopupDetails");
const txAmountInput = document.getElementById("txAmount");
const txAmountModeHint = document.getElementById("txAmountModeHint");
const txNoteInput = document.getElementById("txNote");
const txFundingLabel = document.getElementById("txFundingLabel");
const txFundingModeInput = document.getElementById("txFundingMode");
const txFundingHintEl = document.getElementById("txFundingHint");
const txSubmitBtn = document.getElementById("txSubmitBtn");
const cancelTxEditBtn = document.getElementById("cancelTxEditBtn");
const txPresetButtons = document.querySelectorAll(".tx-preset-btn");
const txQuickAmountButtons = document.querySelectorAll(".tx-quick-btn");
const txTopupButtons = document.querySelectorAll(".tx-topup-btn");
const transactionListEl = document.getElementById("transactionList");
const parentTransactionListEl = document.getElementById("parentTransactionList");
const parentMiniDashboardEl = document.getElementById("parentMiniDashboard");
const quickNavButtons = Array.from(document.querySelectorAll(".admin-nav-btn"));
const parentTxFilterParentInput = document.getElementById("parentTxFilterParent");
const parentTxFilterCategoryInput = document.getElementById("parentTxFilterCategory");
const changePinForm = document.getElementById("changePinForm");
const currentPinInput = document.getElementById("currentPinInput");
const newPinInput = document.getElementById("newPinInput");
const confirmPinInput = document.getElementById("confirmPinInput");
const changePinMessageEl = document.getElementById("changePinMessage");
const parentCoachSummaryEl = document.getElementById("parentCoachSummary");
const parentReadAlertsEl = document.getElementById("parentReadAlerts");
const parentMessageForm = document.getElementById("parentMessageForm");
const parentMessageInput = document.getElementById("parentMessageInput");
const parentMessageDaysInput = document.getElementById("parentMessageDays");
const coachSensitivityInput = document.getElementById("coachSensitivity");
const autoCoachEnabledInput = document.getElementById("autoCoachEnabled");
const parentMessageStatusEl = document.getElementById("parentMessageStatus");
const toggleDetailsBtn = document.getElementById("toggleDetailsBtn");
const extraInsightsEl = document.getElementById("extraInsights");
const childQuickActionsEl = document.getElementById("childQuickActions");
const openTransactionsBtn = document.getElementById("openTransactionsBtn");
const childTransactionsCardEl = document.getElementById("childTransactionsCard");
const viewMode = urlParams.get("view");
const mobileParentActionButtons = [
  resetAllDataBtn,
  closeParentPanelBtn,
].filter(Boolean);
const session = { loggedInParent: null };
const txEditState = { editingId: null };
const budgetSourceChoiceState = {
  options: [],
  selectedId: null,
  recommendedId: null,
  resolver: null,
};
let txTopupArmed = false;
const cloudSyncState = {
  configured: false,
  connected: false,
  lastError: "",
  syncEligible: false,
  lastSyncError: "",
  lastSyncedAt: null,
};
let cloudPushTimer = null;
const supabaseClient = createSupabaseClient();

void init();

// App bootstrap and top-level UI state
async function init() {
  cloudSyncState.syncEligible =
    looksLikeUuid(ACTIVE_CHILD_ID) && looksLikeUuid(ACTIVE_FAMILY_ID) && !CLOUD_SYNC_BLOCKED;
  ensureCategoryStructures(state);
  applyBranding();
  applySoloModeDom();
  monthLabelEl.textContent = formatMonth(currentMonth);
  budgetMonthInput.value = currentMonth;
  txDateInput.value = new Date().toISOString().slice(0, 10);
  renderLoggedInParent();
  setParentPanelOpen(false);
  await initializeCloudConnection();
  await hydrateFromCloudSnapshot();
  renderBuildMeta();
  applyResponsiveButtonLabels();
  window.addEventListener("resize", applyResponsiveButtonLabels);

  parentModeBtn.addEventListener("click", () => parentDialog.showModal());
  cancelPinBtn.addEventListener("click", () => {
    pinError.textContent = "";
    pinInput.value = "";
    if (!IS_SOLO_MODE && loginParentInput) {
      loginParentInput.value = "mama";
    }
    parentDialog.close();
  });
  closeParentPanelBtn.addEventListener("click", () => setParentPanelOpen(false));
  adminQuickNavEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest(".admin-nav-btn");
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const targetId = button.dataset.target;
    if (!targetId) {
      return;
    }
    const section = document.getElementById(targetId);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  logoutParentBtn.addEventListener("click", () => {
    setParentPanelOpen(false);
    session.loggedInParent = null;
    renderLoggedInParent();
    setChangePinMessage("", true);
  });
  resetAllDataBtn.addEventListener("click", () => {
    const canReset = IS_SOLO_MODE
      ? session.loggedInParent === SOLO_OWNER
      : session.loggedInParent === "papa";
    if (!canReset) {
      return;
    }
    const firstConfirm = window.confirm(
      "Alles wissen? Dit verwijdert ALLE budgetten, transacties, coach-instellingen en PIN-wijzigingen op deze browser."
    );
    if (!firstConfirm) {
      return;
    }
    const secondConfirm = window.confirm("Laatste check: zeker resetten naar volledig leeg?");
    if (!secondConfirm) {
      return;
    }
    resetAllData();
  });

  coachAlertsEl.addEventListener("click", handleCoachAlertClick);
  toggleDetailsBtn.addEventListener("click", () => {
    const isHidden = extraInsightsEl.classList.toggle("hidden");
    setDetailsButtonText(isHidden);
  });
  openTransactionsBtn?.addEventListener("click", openChildTransactionsSection);
  autoRenewOverviewEl.addEventListener("click", handleAutoRenewActionClick);
  parentTxFilterParentInput.addEventListener("change", () => renderTransactions());
  parentTxFilterCategoryInput.addEventListener("change", () => renderTransactions());
  parentTransactionListEl.addEventListener("click", handleParentTransactionAction);
  categoryConfigListEl?.addEventListener("click", handleCategoryConfigListClick);
  categoryConfigListEl?.addEventListener("change", handleCategoryConfigListChange);
  budgetAutoRenewInput?.addEventListener("change", syncBudgetRecurringIntervalVisibility);
  cancelTxEditBtn.addEventListener("click", resetTransactionFormState);
  cancelBudgetSourceBtn.addEventListener("click", () => closeBudgetSourceDialog("cancel"));
  useRecommendedBudgetSourceBtn.addEventListener("click", () => closeBudgetSourceDialog("recommended"));
  useSelectedBudgetSourceBtn.addEventListener("click", () => closeBudgetSourceDialog("selected"));
  budgetSourceOptionsEl.addEventListener("click", handleBudgetSourceOptionClick);
  budgetSourceDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeBudgetSourceDialog("cancel");
  });
  txQuickAmountButtons.forEach((button) => {
    button.addEventListener("click", handleQuickAmountClick);
  });
  txTopupButtons.forEach((button) => {
    button.addEventListener("click", handleTopupQuickAmountClick);
  });
  txPresetButtons.forEach((button) => {
    button.addEventListener("click", handleTxPresetClick);
  });
  txFundingModeInput?.addEventListener("change", syncTxFundingModeUi);
  txCategoryInput?.addEventListener("change", syncTxFundingModeUi);
  categoryConfigForm?.addEventListener("submit", handleCategoryConfigSubmit);

  applyInitialViewMode();
  refreshCategorySelectors();
  syncTxFundingFieldVisibility();
  syncChildQuickActionsVisibility();

  pinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedParent = IS_SOLO_MODE ? SOLO_OWNER : loginParentInput.value;
    const selectedPin = state.pins?.[selectedParent];

    if (pinInput.value === selectedPin) {
      session.loggedInParent = selectedParent;
      pinError.textContent = "";
      parentDialog.close();
      setParentPanelOpen(true);
      pinInput.value = "";
      renderLoggedInParent();
      parentPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    pinError.textContent = "Foute PIN. Probeer opnieuw.";
  });

  budgetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!session.loggedInParent) {
      return;
    }
    const month = budgetMonthInput.value;
    const parent = session.loggedInParent;
    const category = budgetCategoryInput.value;
    const amount = Number(budgetAmountInput.value);

    if (!month || !category || Number.isNaN(amount)) {
      return;
    }

    state.monthlyBudgets[month] ??= {};
    ensureCategoryStructures(state);
    state.monthlyBudgets[month][category] ??= createEmptyOwnerAmounts();
    state.monthlyBudgets[month][category][parent] = amount;
    if (budgetAutoRenewInput.checked) {
      state.recurringBudgets[parent][category] = amount;
      state.recurringStartMonth[parent][category] = month;
      state.recurringIntervalMonths[parent][category] = readBudgetRecurringIntervalFromForm();
    }
    saveState();
    render();
    budgetAmountInput.value = "";
    budgetAutoRenewInput.checked = false;
    syncBudgetRecurringIntervalVisibility();
  });

  txForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session.loggedInParent) {
      return;
    }
    const date = txDateInput.value;
    const category = txCategoryInput.value;
    const type = txTopupArmed ? "topup" : "expense";
    const rawAmount = Number(txAmountInput.value);
    const month = date.slice(0, 7);
    const editingTx = txEditState.editingId
      ? state.transactions.find((tx) => tx.id === txEditState.editingId)
      : null;

    if (!date || !category || Number.isNaN(rawAmount) || rawAmount <= 0) {
      return;
    }

    let budgetUsage = [];
    let linkedTransferIds = [];
    if (type === "expense") {
      const usageDecision = await resolveBudgetUsageDecision({
        category,
        month,
        requestedAmount: rawAmount,
        actingParent: session.loggedInParent,
        fundingMode: normalizeTxFundingMode(txFundingModeInput?.value),
        excludeTxId: txEditState.editingId ?? null,
        excludeLinkedTransferIds: Array.isArray(editingTx?.linkedTransferIds)
          ? editingTx.linkedTransferIds
          : [],
      });
      if (usageDecision.cancelledByUser) {
        return;
      }
      budgetUsage = usageDecision.usage;
    }

    const amount = type === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    if (txEditState.editingId) {
      const existing = editingTx;
      if (!existing) {
        resetTransactionFormState();
        return;
      }
      existing.date = date;
      existing.month = month;
      existing.category = category;
      existing.amount = amount;
      existing.note = txNoteInput.value.trim();
      existing.budgetUsage = budgetUsage;
      existing.fundingMode = normalizeTxFundingMode(txFundingModeInput?.value);
      existing.borrowFromParent = null;
      existing.borrowAmount = 0;
      delete existing.kledingSub;
      if (Array.isArray(existing.linkedTransferIds) && existing.linkedTransferIds.length > 0) {
        state.transactions = state.transactions.filter((item) => !existing.linkedTransferIds.includes(item.id));
      }
      linkedTransferIds = createLinkedCategoryTransfers({
        date,
        month,
        targetCategory: category,
        usage: budgetUsage,
      });
      existing.linkedTransferIds = linkedTransferIds;
    } else {
      const txId = crypto.randomUUID();
      linkedTransferIds = createLinkedCategoryTransfers({
        date,
        month,
        targetCategory: category,
        usage: budgetUsage,
      });
      const newTx = {
        id: txId,
        date,
        month,
        category,
        amount,
        note: txNoteInput.value.trim(),
        createdBy: session.loggedInParent,
        budgetUsage,
        fundingMode: normalizeTxFundingMode(txFundingModeInput?.value),
        linkedTransferIds,
      };
      state.transactions.push(newTx);
    }
    state.transactions.sort((a, b) => (a.date > b.date ? 1 : -1));

    saveState();
    render();
    resetTransactionFormState();
  });

  changePinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!session.loggedInParent) {
      setChangePinMessage(IS_SOLO_MODE ? "Log eerst in via Beheer (slotje)." : "Log eerst in als ouder.", false);
      return;
    }

    const currentPin = currentPinInput.value.trim();
    const newPin = newPinInput.value.trim();
    const confirmPin = confirmPinInput.value.trim();
    const savedPin = state.pins?.[session.loggedInParent] ?? "";

    if (currentPin !== savedPin) {
      setChangePinMessage("Huidige PIN klopt niet.", false);
      return;
    }

    if (!/^\d{4,8}$/.test(newPin)) {
      setChangePinMessage("Nieuwe PIN moet 4 tot 8 cijfers zijn.", false);
      return;
    }

    if (newPin !== confirmPin) {
      setChangePinMessage("Bevestiging komt niet overeen.", false);
      return;
    }

    state.pins[session.loggedInParent] = newPin;
    saveState();
    changePinForm.reset();
    setChangePinMessage("PIN succesvol gewijzigd.", true);
  });

  parentMessageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!session.loggedInParent) {
      setParentMessageStatus(IS_SOLO_MODE ? "Log eerst in via Beheer (slotje)." : "Log eerst in als ouder.", false);
      return;
    }
    const days = Number(parentMessageDaysInput.value);
    if (Number.isNaN(days) || days < 1 || days > 31) {
      setParentMessageStatus("Kies een geldige duur tussen 1 en 31 dagen.", false);
      return;
    }

    const message = parentMessageInput.value.trim();
    state.coachSettings.autoCoachEnabled = autoCoachEnabledInput.checked;
    state.coachSettings.sensitivity = coachSensitivityInput.value;
    if (message) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + days);
      state.coachSettings.parentMessages[session.loggedInParent] = {
        text: message,
        expiresAt: expiry.toISOString(),
        readAt: null,
      };
    }
    saveState();
    parentMessageInput.value = "";
    setParentMessageStatus(
      message
        ? `Boodschap doorgestuurd voor ${days} dag${days === 1 ? "" : "en"} 💜`
        : "Coach-instellingen opgeslagen.",
      true
    );
    renderCoachAlerts();
    renderParentReadAlerts();
    renderParentCoachSummary();
  });

  window.addEventListener("beforeunload", flushScheduledCloudPush);
  window.addEventListener("pagehide", flushScheduledCloudPush);

  render();
}

function renderBuildMeta() {
  if (!appBuildMetaEl) {
    return;
  }
  const now = new Date();
  const cloudMeta = getCloudBuildMeta();
  appBuildMetaEl.innerHTML = `<span class="build-status-dot ${cloudMeta.dotClass}" aria-hidden="true"></span>Build ${APP_BUILD_VERSION} · geladen ${now.toLocaleString("nl-BE")} · ${cloudMeta.label}`;
}

function applyResponsiveButtonLabels() {
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  mobileParentActionButtons.forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const nextLabel = isMobile ? button.dataset.labelMobile : button.dataset.labelDesktop;
    if (nextLabel) {
      button.textContent = nextLabel;
    }
  });
  quickNavButtons.forEach((button) => {
    const nextLabel = isMobile ? button.dataset.labelMobile : button.dataset.labelDesktop;
    if (nextLabel) {
      button.textContent = nextLabel;
    }
  });
}

function getCloudBuildMeta() {
  if (!cloudSyncState.configured) {
    return { dotClass: "warn", label: "cloud niet ingesteld" };
  }
  if (!cloudSyncState.connected) {
    return { dotClass: "offline", label: "cloud offline" };
  }
  if (cloudSyncState.syncEligible && cloudSyncState.lastSyncError) {
    const short = cloudSyncState.lastSyncError.slice(0, 48);
    return {
      dotClass: "offline",
      label: short.length < cloudSyncState.lastSyncError.length ? `sync-fout: ${short}…` : `sync-fout: ${short}`,
    };
  }
  if (cloudSyncState.syncEligible && cloudSyncState.lastSyncedAt) {
    return { dotClass: "online", label: "cloud · data gesynchroniseerd" };
  }
  if (cloudSyncState.syncEligible) {
    return { dotClass: "online", label: "cloud · sync actief" };
  }
  return { dotClass: "online", label: "cloud online" };
}

function applyBranding() {
  applyCoachBadgeLabel();
  if (appTitleEl) {
    appTitleEl.textContent = APP_NAME;
  }
  if (heroEyebrowEl) {
    heroEyebrowEl.textContent = APP_NAME;
  }
  if (heroGreetingEl) {
    heroGreetingEl.innerHTML = `Hey ${escapeHtml(CHILD_NAME)} <span class="wave">✨</span>`;
  }
  const heroSub = document.querySelector(".hero-sub");
  if (heroSub) {
    heroSub.textContent = IS_SOLO_MODE
      ? "Jouw budget, in één oogopslag."
      : "Jouw budget in 1 oogopslag.";
  }
  if (parentMessageLabelEl && !IS_SOLO_MODE) {
    parentMessageLabelEl.textContent = `Jouw boodschap voor ${CHILD_NAME}`;
  }
}

function createSupabaseClient() {
  const config = window.__SUPABASE_CONFIG__;
  const createClientFn = window.supabase?.createClient;
  if (!config?.url || !config?.anonKey || typeof createClientFn !== "function") {
    return null;
  }
  cloudSyncState.configured = true;
  return createClientFn(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

async function initializeCloudConnection() {
  if (!supabaseClient) {
    cloudSyncState.connected = false;
    cloudSyncState.lastError = "Supabase niet geconfigureerd";
    renderCloudSyncStatus();
    return;
  }
  try {
    const { error } = await supabaseClient.auth.getSession();
    if (error) {
      throw error;
    }
    cloudSyncState.connected = true;
    cloudSyncState.lastError = "";
  } catch (error) {
    cloudSyncState.connected = false;
    cloudSyncState.lastError = error?.message ?? "connectie mislukt";
  }
  renderCloudSyncStatus();
}

function renderCloudSyncStatus() {
  if (!cloudSyncStatusEl) {
    return;
  }
  if (!cloudSyncState.configured) {
    cloudSyncStatusEl.textContent = "Cloud sync: nog niet ingesteld";
    cloudSyncStatusEl.classList.remove("positive");
    cloudSyncStatusEl.classList.add("error");
    renderBuildMeta();
    return;
  }
  if (!cloudSyncState.connected) {
    cloudSyncStatusEl.textContent = `Cloud sync: niet verbonden (${cloudSyncState.lastError})`;
    cloudSyncStatusEl.classList.remove("positive");
    cloudSyncStatusEl.classList.add("error");
    renderBuildMeta();
    return;
  }
  if (!cloudSyncState.syncEligible) {
    if (CLOUD_SYNC_BLOCKED) {
      cloudSyncStatusEl.textContent =
        "Cloud sync geblokkeerd: solo mag niet dezelfde kind-ID als Lena — gebruik een aparte child-UUID in de link.";
      cloudSyncStatusEl.classList.remove("positive");
      cloudSyncStatusEl.classList.add("error");
    } else if (cloudSyncState.lastSyncError) {
      cloudSyncStatusEl.textContent = `Cloud sync: ${cloudSyncState.lastSyncError}`;
      cloudSyncStatusEl.classList.remove("positive");
      cloudSyncStatusEl.classList.add("error");
    } else {
      cloudSyncStatusEl.textContent =
        "Cloud sync: verbonden — gebruik family + kind UUID in de link of config om tussen toestellen te synchroniseren.";
      cloudSyncStatusEl.classList.remove("error");
      cloudSyncStatusEl.classList.add("positive");
    }
    renderBuildMeta();
    return;
  }
  if (cloudSyncState.lastSyncError) {
    cloudSyncStatusEl.textContent = `Cloud sync: fout bij opslaan/ laden (${cloudSyncState.lastSyncError}).`;
    cloudSyncStatusEl.classList.remove("positive");
    cloudSyncStatusEl.classList.add("error");
    renderBuildMeta();
    return;
  }
  if (cloudSyncState.lastSyncedAt) {
    const when = new Date(cloudSyncState.lastSyncedAt).toLocaleString("nl-BE");
    cloudSyncStatusEl.textContent = `Cloud sync: actief · laatst bijgewerkt ${when}`;
    cloudSyncStatusEl.classList.remove("error");
    cloudSyncStatusEl.classList.add("positive");
    renderBuildMeta();
    return;
  }
  cloudSyncStatusEl.textContent = "Cloud sync: actief · budget wordt online bijgehouden voor dit kind.";
  cloudSyncStatusEl.classList.remove("error");
  cloudSyncStatusEl.classList.add("positive");
  renderBuildMeta();
}

// View mode and panel visibility helpers
function applyInitialViewMode() {
  if (viewMode === "ouder") {
    extraInsightsEl.classList.remove("hidden");
    setDetailsButtonText(false);
    return;
  }

  extraInsightsEl.classList.add("hidden");
  setDetailsButtonText(true);
}

function setParentPanelOpen(isOpen) {
  parentPanel.classList.toggle("hidden", !isOpen);
  parentPanel.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("parent-mode-active", isOpen);
  if (childViewEl) {
    childViewEl.setAttribute("data-parent-open", isOpen ? "true" : "false");
  }
  if (isOpen) {
    renderParentReadAlerts();
  } else if (parentReadAlertsEl) {
    parentReadAlertsEl.innerHTML = "";
  }
  syncChildQuickActionsVisibility();
}

function setDetailsButtonText(isHidden) {
  toggleDetailsBtn.textContent = isHidden ? "Toon extra details" : "Verberg extra details";
}

function openChildTransactionsSection() {
  if (!extraInsightsEl) {
    return;
  }
  extraInsightsEl.classList.remove("hidden");
  setDetailsButtonText(false);
  window.requestAnimationFrame(() => {
    const target = childTransactionsCardEl ?? document.getElementById("transactionList");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function syncChildQuickActionsVisibility() {
  if (!childQuickActionsEl) {
    return;
  }
  const hide = document.body.classList.contains("parent-mode-active");
  childQuickActionsEl.classList.toggle("hidden", hide);
}

function renderLoggedInParent() {
  if (!session.loggedInParent) {
    loggedInAsEl.textContent = "";
    resetAllDataBtn.classList.add("hidden");
    return;
  }
  if (IS_SOLO_MODE) {
    loggedInAsEl.textContent = `Beheer voor ${CHILD_NAME}`;
    resetAllDataBtn.classList.remove("hidden");
  } else {
    const name = session.loggedInParent === "mama" ? "Mama" : "Papa";
    loggedInAsEl.textContent = `Aangemeld als: ${name}`;
    resetAllDataBtn.classList.toggle("hidden", session.loggedInParent !== "papa");
  }
  setChangePinMessage("", true);
  hydrateParentCoachForm();
  setParentMessageStatus("", true);
  syncTxFundingFieldVisibility();
}

function setChangePinMessage(message, isSuccess) {
  changePinMessageEl.textContent = message;
  changePinMessageEl.classList.toggle("positive", Boolean(message) && isSuccess);
  changePinMessageEl.classList.toggle("error", Boolean(message) && !isSuccess);
}

// Main render pipeline
function render() {
  ensureCategoryStructures(state);
  refreshCategorySelectors();
  const categories = getEnabledCategoryIds();
  const categoryData = categories.map((category) => {
    const simulation = simulateCategory(category, currentMonth);
    return {
      category,
      totalRemaining: sum(simulation.buckets.map((b) => b.amount)),
      buckets: simulation.buckets,
      timeline: simulation.timeline,
    };
  });

  const totalRemaining = sum(categoryData.map((c) => c.totalRemaining));
  totalRemainingEl.textContent = currency.format(totalRemaining);
  totalRemainingEl.classList.toggle("positive", totalRemaining >= 0);
  totalRemainingEl.classList.toggle("negative", totalRemaining < 0);
  renderTopAvailability(categoryData);

  renderClearOverview(categoryData);
  renderSpeedRings();
  renderCoachAlerts();
  renderParentReadAlerts();
  renderParentCoachSummary();
  renderParentMiniDashboard(categoryData);
  renderAutoRenewOverview();
  renderCategoryConfigList();

  renderBreakdown(categoryData);
  renderTransactions();
  renderChart(categoryData);
  syncBudgetRecurringIntervalVisibility();
}

function clampRecurringIntervalMonths(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.min(12, Math.max(1, n));
}

function monthIndexFromKey(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return 0;
  }
  return y * 12 + m;
}

function readBudgetRecurringIntervalFromForm() {
  if (!budgetRecurringIntervalInput) {
    return 1;
  }
  return clampRecurringIntervalMonths(budgetRecurringIntervalInput.value);
}

function syncBudgetRecurringIntervalVisibility() {
  budgetRecurringIntervalWrap?.classList.toggle("hidden", !budgetAutoRenewInput?.checked);
}

function getRecurringIntervalFor(parent, category) {
  return clampRecurringIntervalMonths(state.recurringIntervalMonths?.[parent]?.[category]);
}

// Parent budget configuration (auto-renew)
function renderAutoRenewOverview() {
  const entries = [];
  PARENTS.forEach((parent) => {
    getAllCategoryIds().forEach((category) => {
      const amount = state.recurringBudgets?.[parent]?.[category] ?? 0;
      if (Math.abs(amount) > 0.004) {
        entries.push({ parent, category, amount });
      }
    });
  });

  const daysLeft = daysUntilNextMonth();
  autoRenewCountdownEl.textContent = `Auto-schema’s gaan verder over ${daysLeft} dag${daysLeft === 1 ? "" : "en"} (op de 1ste van de volgende maand).`;

  if (entries.length === 0) {
    autoRenewOverviewEl.innerHTML = `<p class="muted">Nog geen automatische verlenging ingesteld.</p>`;
    return;
  }

  autoRenewOverviewEl.innerHTML = entries
    .map((entry) => {
      const parentLabel = entry.parent === "mama" ? "Mama" : "Papa";
      const catLabel = `${getCategoryEmoji(entry.category)} ${humanCategory(entry.category)}`;
      const interval = getRecurringIntervalFor(entry.parent, entry.category);
      const intervalHint =
        interval <= 1 ? "elke maand" : `om de ${interval} maanden (vanaf startmaand)`;
      return `
        <div class="auto-renew-row">
          <span>${parentLabel} · ${catLabel} <span class="muted">· ${intervalHint}</span></span>
          <strong>${currency.format(entry.amount)}</strong>
          <div class="auto-renew-actions">
            <button
              type="button"
              class="auto-renew-btn"
              data-action="edit"
              data-parent="${entry.parent}"
              data-category="${entry.category}"
              data-amount="${entry.amount}"
            >Wijzigen</button>
            <button
              type="button"
              class="auto-renew-btn danger"
              data-action="stop"
              data-parent="${entry.parent}"
              data-category="${entry.category}"
            >Stoppen</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function handleAutoRenewActionClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const action = target.dataset.action;
  const parent = target.dataset.parent;
  const category = target.dataset.category;
  if (!action || !parent || !category) {
    return;
  }

  if (action === "stop") {
    state.recurringBudgets[parent][category] = 0;
    state.recurringStartMonth[parent][category] = null;
    if (state.recurringIntervalMonths?.[parent]) {
      delete state.recurringIntervalMonths[parent][category];
    }
    saveState();
    render();
    return;
  }

  if (action === "edit") {
    const amount = Number(target.dataset.amount ?? "0");
    budgetCategoryInput.value = category;
    budgetAmountInput.value = Number.isNaN(amount) ? "" : String(amount);
    budgetAutoRenewInput.checked = true;
    if (budgetRecurringIntervalInput) {
      budgetRecurringIntervalInput.value = String(getRecurringIntervalFor(parent, category));
    }
    syncBudgetRecurringIntervalVisibility();
    budgetAmountInput.focus();
    setParentMessageStatus(
      `Klaar om auto-bedrag voor ${ownerDisplayLabel(parent).toLowerCase()} · ${humanCategory(category).toLowerCase()} te wijzigen.`,
      true
    );
  }
}

// Top Lena dashboard blocks
function renderTopAvailability(categoryData) {
  topAvailabilityBreakdownEl.innerHTML = categoryData
    .map((entry) => {
      const split = getParentRemainingSplit(entry.category, currentMonth);
      return `
        <div class="top-availability-pill ${entry.category}">
          <div class="top-availability-pill-head">
            <span class="top-availability-pill-title">${getCategoryEmoji(entry.category)} ${humanCategory(entry.category)}</span>
            <strong class="top-availability-pill-total ${entry.totalRemaining >= 0 ? "positive" : "negative"}">${currency.format(entry.totalRemaining)}</strong>
          </div>
          ${renderOwnerSplitHtml(split, "top-availability-split")}
        </div>
      `;
    })
    .join("");
}

function renderSpeedRings() {
  const todayDate = new Date();
  const elapsedRatio = todayDate.getDate() / new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const categories = getEnabledCategoryIds();

  speedRingsEl.innerHTML = categories
    .map((category) => {
      const usage = getCurrentMonthUsage(category);
      const speedRatio = elapsedRatio > 0 ? usage.usedRatio / elapsedRatio : 0;
      const usedPercent = Math.min(Math.max(usage.usedRatio * 100, 0), 100);
      const fill = `${usedPercent.toFixed(0)}%`;
      const mood = getSpeedMood(speedRatio);
      const paceText = mood === "slow" ? "rustig" : mood === "fast" ? "snel" : "on track";

      const accentColor = getCategoryColor(category);
      return `
          <div class="speed-ring-card ${category}" style="--ring-accent:${accentColor};">
          <div class="speed-ring" style="--fill:${fill};"></div>
          <div class="speed-ring-value">${Math.round(usage.usedRatio * 100)}%</div>
          <div class="speed-ring-label">${humanCategory(category)}</div>
          <div class="speed-ring-meta">Tempo: ${paceText}</div>
        </div>
      `;
    })
    .join("");

  if (speedLegendEl) {
    speedLegendEl.innerHTML = categories
      .map(
        (category) =>
          `<span><i class="dot" style="background:${getCategoryColor(category)};"></i>${humanCategory(category)}</span>`
      )
      .join("");
  }
}

function getSpeedMood(speedRatio) {
  if (speedRatio <= 0.9) {
    return "slow";
  }
  if (speedRatio <= 1.15) {
    return "medium";
  }
  return "fast";
}

// Lena Coach and parent coach settings
function renderCoachAlerts() {
  pruneExpiredParentMessages();
  const autoAlerts = buildAutomaticCoachAlerts();
  const parentAlerts = buildParentMessageAlerts();
  const alerts = state.coachSettings.autoCoachEnabled ? [...parentAlerts, ...autoAlerts] : parentAlerts;
  coachAlertsEl.innerHTML = "";

  alerts.forEach((alert) => {
    const item = document.createElement("article");
    item.className = `coach-item ${alert.toneClass} ${alert.categoryClass ?? ""} ${
      alert.showCoachTag === false ? "no-coach-tag" : ""
    }`;
    const coachText = alert.showCoachTag === false ? alert.text : personalizeAutomaticCoachText(alert.text);
    const ackHtml = alert.parentKey ? renderCoachAckHtml(alert.parentKey) : "";
    item.innerHTML = `
      <p class="coach-title">${alert.title}</p>
      <p class="coach-text">${coachText}</p>
      ${ackHtml}
    `;
    coachAlertsEl.appendChild(item);
  });
}

function renderCoachAckHtml(parentKey) {
  const entry = state.coachSettings.parentMessages?.[parentKey];
  if (!entry?.text) {
    return "";
  }
  if (entry.readAt) {
    return `
      <div class="coach-ack coach-ack-done" aria-live="polite">
        <button type="button" class="coach-thumbs-btn is-active" disabled aria-pressed="true" aria-label="Bericht gelezen">👍</button>
        <p class="coach-ack-hint coach-ack-hint-done">${IS_SOLO_MODE ? "We weten dat je het hebt gelezen 💜" : "Mama en papa weten dat je het hebt gelezen 💜"}</p>
      </div>
    `;
  }
  return `
    <div class="coach-ack">
      <button type="button" class="coach-thumbs-btn" data-coach-ack-parent="${parentKey}" aria-label="Bericht gelezen markeren">👍</button>
      <p class="coach-ack-hint">Geef een duim als je het gelezen hebt — dan weten ${IS_SOLO_MODE ? "we" : "mama en papa"} dat je het gezien hebt 💜</p>
    </div>
  `;
}

function handleCoachAlertClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest("[data-coach-ack-parent]");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const parentKey = button.dataset.coachAckParent;
  if (!parentKey) {
    return;
  }
  acknowledgeParentMessage(parentKey);
}

function acknowledgeParentMessage(parentKey) {
  const entry = state.coachSettings.parentMessages?.[parentKey];
  if (!entry?.text || entry.readAt) {
    return;
  }
  entry.readAt = new Date().toISOString();
  saveState();
  renderCoachAlerts();
  renderParentReadAlerts();
}

function buildAutomaticCoachAlerts() {
  const todayDate = new Date();
  const dayOfMonth = todayDate.getDate();
  const daysInMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const categories = getEnabledCategoryIds();
  const alerts = [];

  categories.forEach((category) => {
    const usage = getCurrentMonthUsage(category);
    if (usage.monthBudget <= 0) {
      return;
    }

    const ratio = usage.usedRatio;
    const remaining = usage.monthBudget - usage.usedFromMonthBudget;
    const severity = getUsageSeverity(
      dayOfMonth,
      daysInMonth,
      ratio,
      state.coachSettings.sensitivity ?? "normal"
    );
    if (!severity) {
      return;
    }

    alerts.push(createCoachMessage(category, severity, ratio, remaining, dayOfMonth));
  });

  if (alerts.length === 0) {
    const positiveTemplates = [
      "Je bent top bezig 💜 Je houdt mooi balans tussen genieten en sparen.",
      "Nice! 🌟 Je budgettempo is gezond. Zo hou je aan het einde van de maand nog keuze over.",
      "Lekker bezig 😎 Je uitgaven zijn onder controle, hou dit ritme vast.",
    ];
    const idx = getStableIndex(`positive-${currentMonth}-${dayOfMonth}`, positiveTemplates.length);
    return [
      {
        toneClass: "coach-soft",
        title: `🌸 ${CHILD_NAME} Coach`,
        text: positiveTemplates[idx],
      },
    ];
  }

  return alerts;
}

function getCurrentMonthUsage(category) {
  const monthBudget = sumCategoryBudgetForMonth(currentMonth, category);

  const monthTx = state.transactions.filter((tx) => tx.month === currentMonth && tx.category === category);
  const expenses = monthTx.filter((tx) => tx.amount < 0).reduce((sumValue, tx) => sumValue + Math.abs(tx.amount), 0);
  const topups = monthTx.filter((tx) => tx.amount > 0).reduce((sumValue, tx) => sumValue + tx.amount, 0);
  const usedFromMonthBudget = Math.max(0, expenses - topups);
  const usedRatio = monthBudget > 0 ? usedFromMonthBudget / monthBudget : 0;

  return { monthBudget, usedFromMonthBudget, usedRatio };
}

function getUsageSeverity(dayOfMonth, daysInMonth, usedRatio, sensitivity) {
  const expectedRatio = dayOfMonth / Math.max(daysInMonth, 1);
  const settingsBySensitivity = {
    calm: { earlyWarning: 0.6, midWarning: 0.82, lateSoft: 0.95, buffer: 0.25 },
    normal: { earlyWarning: 0.5, midWarning: 0.75, lateSoft: 0.9, buffer: 0.18 },
    strict: { earlyWarning: 0.42, midWarning: 0.68, lateSoft: 0.84, buffer: 0.12 },
  };
  const cfg = settingsBySensitivity[sensitivity] ?? settingsBySensitivity.normal;

  if (usedRatio >= 1) {
    return "danger";
  }
  if (dayOfMonth <= 10 && usedRatio >= cfg.earlyWarning) {
    return "warning";
  }
  if (dayOfMonth <= 20 && usedRatio >= cfg.midWarning) {
    return "warning";
  }
  if (dayOfMonth <= 25 && usedRatio >= cfg.lateSoft) {
    return "soft";
  }
  if (usedRatio > expectedRatio + cfg.buffer && usedRatio >= 0.45) {
    return usedRatio >= 0.9 ? "danger" : "warning";
  }
  return null;
}

function createCoachMessage(category, severity, ratio, remaining, dayOfMonth) {
  const label = humanCategory(category).toLowerCase();
  const ratioText = Math.round(ratio * 100);
  const remainingText = currency.format(remaining);
  const templates = {
    soft: [
      {
        title: `💡 Zachte reminder (${label})`,
        text: `Je hebt al ${ratioText}% gebruikt. Je hebt nog ${remainingText} over, dus rustig verder en je komt er wel ✨`,
      },
      {
        title: `🌼 Slimme tip voor ${label}`,
        text: `${ratioText}% is gebruikt en er blijft ${remainingText} over. Mini challenge: nog wat marge bewaren 💜`,
      },
      {
        title: `🫶 Kleine check-in (${label})`,
        text: `Je hebt ${ratioText}% gebruikt. Als je nu slim kiest, blijft er nog mooi ${remainingText} over.`,
      },
      {
        title: `🎯 Budget level-up`,
        text: `${label} zit op ${ratioText}%. Tiny focus nu = later nog fun met ${remainingText}.`,
      },
      {
        title: `🌈 Je kan dit perfect`,
        text: `${ratioText}% gebruikt is ok, let gewoon op je tempo zodat ${remainingText} je buffer blijft.`,
      },
      {
        title: `🍀 Lieve reminder`,
        text: `${label}: ${ratioText}% gebruikt. Nog ${remainingText} over, dus je hebt nog speelruimte.`,
      },
    ],
    warning: [
      {
        title: `⚠️ ${CHILD_NAME}, je gaat snel op ${label}`,
        text: `Je zit al aan ${ratioText}% deze maand. Misschien even pauze op shopping zodat je nog ${remainingText} overhoudt 😇`,
      },
      {
        title: `🚦 Even vertragen (${label})`,
        text: `Al ${ratioText}% gebruikt terwijl de maand nog bezig is. You got this: mik op minstens ${remainingText} over 🙌`,
      },
      {
        title: `📉 Snelle update (${label})`,
        text: `Je zit nu op ${ratioText}%. Als je een paar dagen rustiger gaat, hou je nog ${remainingText} over.`,
      },
      {
        title: `🧠 Slimme move?`,
        text: `${ratioText}% is al weg in ${label}. Even remmen nu = minder stress later in de maand.`,
      },
      {
        title: `💬 Team ${CHILD_NAME} tip`,
        text: `${label} gaat deze maand snel. Doel voor de rest van de maand: nog ${remainingText} sparen.`,
      },
      {
        title: `🛍️ Shop-balance alert`,
        text: `${ratioText}% verbruikt. Misschien nu 1 aankoop skippen en je houdt meer over tegen maand-einde.`,
      },
    ],
    danger: [
      {
        title: `🛑 Bijna op: ${label}`,
        text: `Je zit op ${ratioText}%. Tijd voor no-spend mode zodat je niet zonder budget valt voor het einde van de maand 💗`,
      },
      {
        title: `🔥 Hoog tempo op ${label}`,
        text: `${ratioText}% verbruikt. Budget-pauze aanzetten en terug wat marge opbouwen, queen 👑`,
      },
      {
        title: `🚨 Noodrem op ${label}`,
        text: `${ratioText}% gebruikt en we zijn pas dag ${dayOfMonth}. Mini no-spend challenge tot volgende week?`,
      },
      {
        title: `🧯 Even stabiliseren`,
        text: `${label} staat onder druk (${ratioText}%). Nu even basics-only helpt je maand redden.`,
      },
      {
        title: `💥 Bijna door je budget`,
        text: `Je bent al op ${ratioText}% voor ${label}. Tijd om je resterende budget extra te beschermen.`,
      },
      {
        title: `🪫 Budget batterij laag`,
        text: `${label} zit al op ${ratioText}%. Schakel naar rustige modus zodat je niet volledig leegloopt.`,
      },
    ],
  };

  const list = templates[severity];
  const idx = getStableIndex(`${category}-${severity}-${currentMonth}-${new Date().getDate()}`, list.length);
  return {
    toneClass: severity === "danger" ? "coach-danger" : severity === "warning" ? "coach-warning" : "coach-soft",
    categoryClass: `coach-cat-${category}`,
    ...list[idx],
  };
}

function buildParentMessageAlerts() {
  const messages = state.coachSettings.parentMessages ?? {};
  const alerts = [];
  if (IS_SOLO_MODE) {
    if (messages[SOLO_OWNER]?.text) {
      alerts.push({
        toneClass: "coach-soft",
        title: "💌 Herinnering",
        text: escapeHtml(messages[SOLO_OWNER].text),
        showCoachTag: false,
        parentKey: SOLO_OWNER,
      });
    }
    return alerts;
  }
  if (messages.mama?.text) {
    alerts.push({
      toneClass: "coach-soft",
      title: "💌 Bericht van mama",
      text: escapeHtml(messages.mama.text),
      showCoachTag: false,
      parentKey: "mama",
    });
  }
  if (messages.papa?.text) {
    alerts.push({
      toneClass: "coach-soft",
      title: "💌 Bericht van papa",
      text: escapeHtml(messages.papa.text),
      showCoachTag: false,
      parentKey: "papa",
    });
  }
  return alerts;
}

function personalizeAutomaticCoachText(text) {
  const rawText = typeof text === "string" ? text.trim() : "";
  if (!rawText) {
    return `${CHILD_NAME}, je bent goed bezig 💜`;
  }
  const lowerName = CHILD_NAME.toLowerCase();
  if (new RegExp(`^${lowerName}\\b`, "i").test(rawText)) {
    return rawText;
  }
  return `${CHILD_NAME}, ${rawText.charAt(0).toLowerCase()}${rawText.slice(1)}`;
}

function renderParentCoachSummary() {
  pruneExpiredParentMessages();
  const categoryRows = getEnabledCategoryIds()
    .map((category) => {
      const usage = getCurrentMonthUsage(category);
      return `<div class="coach-summary-row">${getCategoryEmoji(category)} ${humanCategory(category)}: ${Math.round(
        usage.usedRatio * 100
      )}% gebruikt (${currency.format(usage.usedFromMonthBudget)} / ${currency.format(usage.monthBudget)})</div>`;
    })
    .join("");
  const autoCoachText = state.coachSettings.autoCoachEnabled ? "Aan" : "Uit";
  const sensitivity = state.coachSettings.sensitivity ?? "normal";
  const sensitivityText = sensitivity === "calm" ? "Rustig" : sensitivity === "strict" ? "Streng" : "Normaal";
  const parentMessages = state.coachSettings.parentMessages ?? {};

  if (IS_SOLO_MODE) {
    const selfUntil = formatMessageExpiry(parentMessages[SOLO_OWNER]?.expiresAt);
    parentCoachSummaryEl.innerHTML = `
      ${categoryRows}
      <div class="coach-summary-row">🔔 Automatische coach: ${autoCoachText}</div>
      <div class="coach-summary-row">🎚️ Gevoeligheid: ${sensitivityText}</div>
      <div class="coach-summary-row">💌 Persoonlijke herinnering: ${selfUntil}</div>
    `;
    return;
  }

  const mamaUntil = formatMessageExpiry(parentMessages.mama?.expiresAt);
  const papaUntil = formatMessageExpiry(parentMessages.papa?.expiresAt);

  parentCoachSummaryEl.innerHTML = `
    <div class="coach-summary-row coach-summary-shared">ℹ️ Gedeeld: automatische coach en gevoeligheid gelden voor mama + papa samen.</div>
    ${categoryRows}
    <div class="coach-summary-row">🔔 Automatische coach (gedeeld): ${autoCoachText}</div>
    <div class="coach-summary-row">🎚️ Gevoeligheid (gedeeld): ${sensitivityText}</div>
    <div class="coach-summary-row">💌 Mama-boodschap: ${mamaUntil}</div>
    <div class="coach-summary-row">💌 Papa-boodschap: ${papaUntil}</div>
  `;
}

function renderParentReadAlerts() {
  if (!parentReadAlertsEl || IS_SOLO_MODE) {
    if (parentReadAlertsEl) {
      parentReadAlertsEl.innerHTML = "";
    }
    return;
  }
  if (!session.loggedInParent || parentPanel.classList.contains("hidden")) {
    parentReadAlertsEl.innerHTML = "";
    return;
  }

  pruneExpiredParentMessages();
  const parentKey = session.loggedInParent === "papa" ? "papa" : "mama";
  const entry = state.coachSettings.parentMessages?.[parentKey];
  if (!entry?.text || !entry.readAt) {
    parentReadAlertsEl.innerHTML = "";
    return;
  }

  const readLabel = formatMessageReadStatus(entry);
  const parentLabel = parentKey === "mama" ? "Mama" : "Papa";
  parentReadAlertsEl.innerHTML = `
    <article class="parent-read-alert" role="status">
      <div class="parent-read-alert-icon" aria-hidden="true">👍</div>
      <div class="parent-read-alert-body">
        <strong>${CHILD_NAME} heeft je boodschap gelezen!</strong>
        <p>${readLabel.replace(/^👍\s*/, "")}</p>
      </div>
      <span class="parent-read-alert-badge">${parentLabel}</span>
    </article>
  `;
}

function hydrateParentCoachForm() {
  if (!session.loggedInParent) {
    parentMessageInput.value = "";
    return;
  }
  parentMessageInput.value = "";
  parentMessageDaysInput.value = "3";
  coachSensitivityInput.value = state.coachSettings.sensitivity ?? "normal";
  autoCoachEnabledInput.checked = state.coachSettings.autoCoachEnabled !== false;
}

function setParentMessageStatus(message, isSuccess) {
  parentMessageStatusEl.textContent = message;
  parentMessageStatusEl.classList.toggle("positive", Boolean(message) && isSuccess);
  parentMessageStatusEl.classList.toggle("error", Boolean(message) && !isSuccess);
}

function getStableIndex(seed, length) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % Math.max(length, 1);
}

function pruneExpiredParentMessages() {
  const nowMs = Date.now();
  let changed = false;
  PARENTS.forEach((parent) => {
    const entry = state.coachSettings.parentMessages?.[parent];
    if (!entry?.text || !entry?.expiresAt) {
      return;
    }
    if (new Date(entry.expiresAt).getTime() < nowMs) {
      state.coachSettings.parentMessages[parent] = { text: "", expiresAt: null, readAt: null };
      changed = true;
    }
  });
  if (changed) {
    saveState();
  }
}

function formatMessageReadStatus(entry) {
  if (!entry?.text) {
    return "—";
  }
  if (!entry.readAt) {
    return "nog niet gelezen";
  }
  const readDate = new Date(entry.readAt);
  if (Number.isNaN(readDate.getTime())) {
    return "nog niet gelezen";
  }
  const day = readDate.toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
  const time = readDate.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  return `👍 gelezen op ${day} om ${time}`;
}

function formatMessageExpiry(expiresAt) {
  if (!expiresAt) {
    return "geen actieve boodschap";
  }
  const endDate = new Date(expiresAt);
  if (Number.isNaN(endDate.getTime())) {
    return "geen actieve boodschap";
  }
  const todayDate = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.max(0, Math.ceil((endDate - todayDate) / msPerDay));
  return daysLeft > 0 ? `actief nog ${daysLeft} dag${daysLeft === 1 ? "" : "en"}` : "loopt vandaag af";
}

// Budget overview and split simulation
function renderClearOverview(categoryData) {
  clearOverviewEl.innerHTML = getEnabledCategoryIds()
    .map((category) => {
      const snapshot = getCategorySnapshot(category, categoryData);
      const split = getParentRemainingSplit(category, currentMonth);
      return `
        <div class="overview-row">
          <div class="overview-row-main">
            <strong class="overview-cat-title">${getCategoryEmoji(category)} ${humanCategory(category)}</strong>
            <p class="overview-row-meta muted">Nieuw: ${currency.format(snapshot.monthBudget)} · Over: ${currency.format(snapshot.rolloverFromPrev)}</p>
          </div>
          <div class="overview-row-aside">
            <strong class="overview-total-amount ${snapshot.availableNow >= 0 ? "positive" : "negative"}">${currency.format(snapshot.availableNow)}</strong>
            ${renderOwnerSplitHtml(split, "overview-split-mini")}
          </div>
        </div>
      `;
    })
    .join("");
}

function getCategorySnapshot(category, categoryData) {
  const monthBudget = sumCategoryBudgetForMonth(currentMonth, category);

  const prev = previousMonth(currentMonth);
  let rolloverFromPrev = 0;
  if (prev) {
    const prevSimulation = simulateCategory(category, prev);
    rolloverFromPrev = sum(prevSimulation.buckets.map((bucket) => bucket.amount));
  }

  const availableNow = categoryData.find((entry) => entry.category === category)?.totalRemaining ?? 0;
  return { monthBudget, rolloverFromPrev, availableNow };
}

function getParentRemainingSplit(category, upToMonth, options = {}) {
  const excludedTxIds = Array.isArray(options.excludeTxIds)
    ? new Set(options.excludeTxIds.filter(Boolean))
    : new Set();
  const months = getMonthRange(upToMonth);
  const buckets = [];

  months.forEach((month) => {
    PARENTS.forEach((owner) => {
      const ownerBudget = getBudgetAmountForMonth(month, category, owner);
      if (Math.abs(ownerBudget) > 0.004) {
        addOwnedBucket(buckets, month, owner, ownerBudget);
      }
    });

    const txs = state.transactions
      .filter((tx) => tx.month === month && tx.category === category && !excludedTxIds.has(tx.id))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    txs.forEach((tx) => {
      const owner = normalizeOwnerKey(tx.createdBy);
      if (tx.amount >= 0) {
        addOwnedBucket(buckets, tx.month, owner, tx.amount);
        pruneZeroBuckets(buckets);
        return;
      }

      const usageEntries = Array.isArray(tx.budgetUsage)
        ? tx.budgetUsage
        : tx.borrowAmount > 0 &&
            (tx.borrowFromParent === "mama" ||
              tx.borrowFromParent === "papa" ||
              tx.borrowFromParent === SOLO_OWNER)
          ? [{ fromParent: tx.borrowFromParent, fromCategory: category, amount: tx.borrowAmount }]
          : [];
      const fundingMode = normalizeTxFundingMode(tx.fundingMode);
      let toSpend = Math.abs(tx.amount);

      const spendFromParentBuckets = (fromParent, requestedAmount) => {
        let requested = requestedAmount;
        const positiveBuckets = buckets
          .filter((bucket) => bucket.owner === fromParent && bucket.amount > 0)
          .sort((a, b) => a.sourceMonth.localeCompare(b.sourceMonth));
        positiveBuckets.forEach((bucket) => {
          if (requested <= 0) {
            return;
          }
          const used = Math.min(bucket.amount, requested);
          bucket.amount -= used;
          requested -= used;
        });
        return requested;
      };

      if (fundingMode === "other-same" || fundingMode === "manual") {
        usageEntries
          .filter((entry) => entry.fromCategory === category)
          .forEach((entry) => {
            if (toSpend <= 0) {
              return;
            }
            const fromParent =
              entry.fromParent === "papa" ? "papa" : entry.fromParent === "mama" ? "mama" : owner;
            const entryAmount = Math.min(toSpend, Number(entry.amount) || 0);
            const leftover = spendFromParentBuckets(fromParent, entryAmount);
            toSpend -= entryAmount - leftover;
          });
      } else {
        const ownerPositiveBuckets = buckets
          .filter((bucket) => bucket.owner === owner && bucket.amount > 0)
          .sort((a, b) => a.sourceMonth.localeCompare(b.sourceMonth));

        ownerPositiveBuckets.forEach((bucket) => {
          if (toSpend <= 0) {
            return;
          }
          const used = Math.min(bucket.amount, toSpend);
          bucket.amount -= used;
          toSpend -= used;
        });

        usageEntries
          .filter((entry) => entry.fromCategory === category && entry.fromParent !== owner)
          .forEach((entry) => {
            if (toSpend <= 0) {
              return;
            }
            const entryAmount = Math.min(toSpend, Number(entry.amount) || 0);
            const leftover = spendFromParentBuckets(
              entry.fromParent === "papa" ? "papa" : "mama",
              entryAmount
            );
            toSpend -= entryAmount - leftover;
          });
      }

      if (toSpend > 0) {
        addOwnedBucket(buckets, month, owner, -toSpend);
      }
      pruneZeroBuckets(buckets);
    });
  });

  const split = {};
  PARENTS.forEach((owner) => {
    split[owner] = sum(buckets.filter((bucket) => bucket.owner === owner).map((bucket) => bucket.amount));
  });
  return split;
}

const TX_FUNDING_MODES = ["auto", "other-same", "manual"];

function normalizeTxFundingMode(value) {
  return TX_FUNDING_MODES.includes(value) ? value : "auto";
}

function getOtherParentKey(parent) {
  return parent === "mama" ? "papa" : "mama";
}

function inferTxFundingMode(tx) {
  if (!tx || tx.amount >= 0) {
    return "auto";
  }
  if (tx.fundingMode && TX_FUNDING_MODES.includes(tx.fundingMode)) {
    return tx.fundingMode;
  }
  const expense = Math.abs(tx.amount);
  const usageEntries = Array.isArray(tx.budgetUsage)
    ? tx.budgetUsage.filter((entry) => Number(entry.amount) > 0)
    : [];
  if (usageEntries.length === 0) {
    return "auto";
  }
  const actor = tx.createdBy === "papa" ? "papa" : "mama";
  const otherParent = getOtherParentKey(actor);
  if (
    usageEntries.length === 1 &&
    usageEntries[0].fromParent === otherParent &&
    usageEntries[0].fromCategory === tx.category &&
    Math.abs(Number(usageEntries[0].amount) - expense) <= 0.02
  ) {
    return "other-same";
  }
  return "manual";
}

function syncTxFundingModeUi() {
  if (!txFundingModeInput || IS_SOLO_MODE) {
    return;
  }
  const actingParent = session.loggedInParent === "papa" ? "papa" : session.loggedInParent === "mama" ? "mama" : null;
  const otherParent = actingParent ? getOtherParentKey(actingParent) : "papa";
  const category = txCategoryInput?.value ?? "kleding";
  const otherOption = txFundingModeInput.querySelector('option[value="other-same"]');
  if (otherOption) {
    otherOption.textContent = `Volledig van ${otherParent} · ${humanCategory(category).toLowerCase()}`;
  }
  const hints = {
    auto: "Eerst jouw budget in deze categorie; bij tekort kies je een andere bron.",
    "other-same": `Het volledige bedrag komt van ${otherParent} (${humanCategory(category).toLowerCase()}), ook als jij nog saldo hebt.`,
    manual: "Jij kiest zelf welke budgetten (eigen, andere ouder of andere categorie) worden gebruikt.",
  };
  const mode = normalizeTxFundingMode(txFundingModeInput.value);
  if (txFundingHintEl) {
    txFundingHintEl.textContent = hints[mode] ?? hints.auto;
  }
}

function syncTxFundingFieldVisibility() {
  if (!txFundingLabel) {
    return;
  }
  const show = !IS_SOLO_MODE && !txTopupArmed && Boolean(session.loggedInParent);
  txFundingLabel.classList.toggle("hidden", !show);
  if (show) {
    syncTxFundingModeUi();
  }
}

async function resolveBudgetUsageDecision({
  category,
  month,
  requestedAmount,
  actingParent,
  fundingMode = "auto",
  excludeTxId,
  excludeLinkedTransferIds = [],
}) {
  if (IS_SOLO_MODE) {
    return resolveSoloBudgetUsageDecision({
      category,
      month,
      requestedAmount,
      excludeTxId,
      excludeLinkedTransferIds,
    });
  }
  if (actingParent !== "mama" && actingParent !== "papa") {
    return { usage: [], cancelledByUser: false };
  }
  const mode = normalizeTxFundingMode(fundingMode);
  const otherParent = getOtherParentKey(actingParent);
  const otherCategories = getEnabledCategoryIds().filter((item) => item !== category);
  const excludeTxIds = [excludeTxId, ...excludeLinkedTransferIds].filter(Boolean);

  const sameCategorySplit = getParentRemainingSplit(category, month, { excludeTxIds });
  let remaining = requestedAmount;
  const usage = [];

  if (mode === "auto") {
    const ownSameCategory = Math.max(0, sameCategorySplit[actingParent] ?? 0);
    remaining = Math.max(0, remaining - ownSameCategory);
  } else if (mode === "other-same") {
    const otherAvailable = Math.max(0, sameCategorySplit[otherParent] ?? 0);
    const fromOther = Math.min(remaining, otherAvailable);
    if (fromOther > 0.004) {
      usage.push({
        fromParent: otherParent,
        fromCategory: category,
        amount: fromOther,
      });
      remaining -= fromOther;
    }
  }

  while (remaining > 0.004) {
    // Alle bronnen tegelijk (geen aparte "eigen categorieën eerst"-fase), zodat bv. papa cosmetica
    // zichtbaar blijft zolang mama nog zakgeld/kleding heeft.
    const includeOwnSameCategory = mode === "manual" || mode === "other-same";
    const candidateDefs = [
      ...(includeOwnSameCategory ? [{ fromParent: actingParent, fromCategory: category }] : []),
      { fromParent: otherParent, fromCategory: category },
      ...otherCategories.map((item) => ({ fromParent: actingParent, fromCategory: item })),
      ...otherCategories.map((item) => ({ fromParent: otherParent, fromCategory: item })),
    ];
    const seen = new Set();
    const uniqueCandidates = candidateDefs.filter((candidate) => {
      const key = `${candidate.fromParent}:${candidate.fromCategory}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    const options = uniqueCandidates.map((candidate) => {
        const split = getParentRemainingSplit(candidate.fromCategory, month, { excludeTxIds });
        const baseAvailable = Math.max(0, split[candidate.fromParent] ?? 0);
        const alreadyUsed = usage
          .filter(
            (entry) =>
              entry.fromParent === candidate.fromParent && entry.fromCategory === candidate.fromCategory
          )
          .reduce((acc, entry) => acc + entry.amount, 0);
        const available = Math.max(0, baseAvailable - alreadyUsed);
        return { ...candidate, available, selectable: available > 0.004 };
      });

    const selectableOptions = options.filter((candidate) => candidate.selectable);
    if (selectableOptions.length === 0) {
      break;
    }

    const totalPossible = selectableOptions.reduce((acc, option) => acc + option.available, 0);
    const selected = await chooseBudgetSourceOption({
      actingParent,
      category,
      remaining,
      options,
      fundingMode: mode,
    });
    if (!selected) {
      if (totalPossible >= remaining) {
        return { usage: [], cancelledByUser: true };
      }
      break;
    }
    const amount = Math.min(remaining, selected.available);
    usage.push({
      fromParent: selected.fromParent,
      fromCategory: selected.fromCategory,
      amount,
    });
    remaining -= amount;
  }

  return { usage, cancelledByUser: false };
}

// Budget source selection dialog for shortage handling
function handleBudgetSourceOptionClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest("button[data-option-id]");
  if (!(button instanceof HTMLElement)) {
    return;
  }
  if (button.classList.contains("disabled")) {
    return;
  }
  budgetSourceChoiceState.selectedId = button.dataset.optionId ?? null;
  renderBudgetSourceOptions();
}

async function chooseBudgetSourceOption({ actingParent, category, remaining, options, fundingMode = "auto" }) {
  if (!budgetSourceDialog || !budgetSourceMessageEl || !budgetSourceOptionsEl) {
    return options[0] ?? null;
  }
  const mode = normalizeTxFundingMode(fundingMode);
  const selectable = options.filter((option) => option.selectable);
  const sameCategoryOtherParent = selectable.find(
    (option) => option.fromParent !== actingParent && option.fromCategory === category
  );
  const sameCategoryOwn = selectable.find(
    (option) => option.fromParent === actingParent && option.fromCategory === category
  );
  const recommended =
    mode === "other-same"
      ? sameCategoryOtherParent
      : mode === "manual"
        ? sameCategoryOwn ?? sameCategoryOtherParent
        : sameCategoryOtherParent ??
          [...selectable].sort((a, b) => b.available - a.available)[0] ??
          selectable[0] ??
          options[0];
  budgetSourceChoiceState.options = options.map((option, index) => ({
    ...option,
    id: `${option.fromParent}-${option.fromCategory}-${index}`,
  }));
  const recommendedIndex = budgetSourceChoiceState.options.findIndex(
    (option) =>
      option.fromParent === recommended?.fromParent && option.fromCategory === recommended?.fromCategory
  );
  budgetSourceChoiceState.recommendedId =
    recommendedIndex >= 0
      ? budgetSourceChoiceState.options[recommendedIndex].id
      : budgetSourceChoiceState.options[0]?.id ?? null;
  budgetSourceChoiceState.selectedId = budgetSourceChoiceState.recommendedId;

  const parentLabel = IS_SOLO_MODE ? "jouw" : actingParent === "mama" ? "mama" : "papa";
  const catLabel = humanCategory(category).toLowerCase();
  if (mode === "manual") {
    budgetSourceMessageEl.textContent = `Kies budgetbron voor ${currency.format(remaining)} (${catLabel}). Je mag eigen of andere ouder/categorie kiezen.`;
  } else if (mode === "other-same") {
    budgetSourceMessageEl.textContent = `Nog ${currency.format(remaining)} te dekken. Kies een aanvullende bron (bv. eigen ${catLabel} of andere categorie).`;
  } else {
    const suffix = IS_SOLO_MODE
      ? " Kies uit een andere categorie."
      : " Kies waar het vandaan komt (ook dezelfde categorie bij de andere ouder).";
    budgetSourceMessageEl.textContent = `Tekort op ${parentLabel} ${catLabel}: ${currency.format(remaining)}.${suffix}`;
  }
  renderBudgetSourceOptions();
  budgetSourceDialog.showModal();

  const choice = await new Promise((resolve) => {
    budgetSourceChoiceState.resolver = resolve;
  });

  if (choice.mode === "cancel") {
    return null;
  }
  const optionId =
    choice.mode === "recommended" ? budgetSourceChoiceState.recommendedId : budgetSourceChoiceState.selectedId;
  const picked = budgetSourceChoiceState.options.find((option) => option.id === optionId) ?? null;
  if (!picked || !picked.selectable) {
    return null;
  }
  return picked;
}

function renderBudgetSourceOptions() {
  budgetSourceOptionsEl.innerHTML = budgetSourceChoiceState.options
    .map((option) => {
      const cat = humanCategory(option.fromCategory).toLowerCase();
      const isActive = option.id === budgetSourceChoiceState.selectedId;
      const isRecommended = option.id === budgetSourceChoiceState.recommendedId;
      const catLabel = `${getCategoryEmoji(option.fromCategory)} ${cat}`;
      const sourceLabel = IS_SOLO_MODE ? catLabel : `${option.fromParent} · ${catLabel}`;
      return `
        <button type="button" class="budget-source-option ${isActive ? "active" : ""} ${option.selectable ? "" : "disabled"}" data-option-id="${option.id}" ${option.selectable ? "" : "disabled"}>
          <span>${sourceLabel}</span>
          <strong>${currency.format(option.available)}</strong>
          ${isRecommended ? `<em>Aanbevolen</em>` : option.selectable ? "" : `<em>Geen saldo beschikbaar</em>`}
        </button>
      `;
    })
    .join("");
}

function closeBudgetSourceDialog(mode) {
  if (!budgetSourceChoiceState.resolver) {
    return;
  }
  const resolver = budgetSourceChoiceState.resolver;
  budgetSourceChoiceState.resolver = null;
  if (budgetSourceDialog.open) {
    budgetSourceDialog.close();
  }
  resolver({ mode });
}

// Transactions rendering and interaction handlers
function renderBreakdown(categoryData) {
  rolloverBreakdownEl.innerHTML = "";

  const hasAnyData = categoryData.some((d) =>
    d.buckets.some((b) => Math.abs(b.amount) > 0.004 && b.sourceMonth !== currentMonth)
  );

  if (!hasAnyData) {
    rolloverBreakdownEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">🌸</div>
        <p class="muted">Nog niets over van vorige maand(en)</p>
      </div>
    `;
    return;
  }

  categoryData.forEach((data) => {
    const visibleBuckets = data.buckets
      .filter((bucket) => Math.abs(bucket.amount) > 0.004 && bucket.sourceMonth !== currentMonth)
      .sort((a, b) => a.sourceMonth.localeCompare(b.sourceMonth));

    if (visibleBuckets.length === 0) {
      return;
    }

    const title = document.createElement("h4");
    title.textContent = humanCategory(data.category);
    rolloverBreakdownEl.appendChild(title);

    visibleBuckets.forEach((bucket) => {
      const row = document.createElement("div");
      row.className = "rollover-item";
      const monthText = bucket.sourceMonth === "manual" ? "Bijstorting" : formatMonth(bucket.sourceMonth);
      row.innerHTML = `
        <span>${monthText}</span>
        <strong class="${bucket.amount >= 0 ? "positive" : "negative"}">
          ${currency.format(bucket.amount)}
        </strong>
      `;
      rolloverBreakdownEl.appendChild(row);
    });
  });
}

function renderTransactions() {
  const visibleTransactions = state.transactions.filter((tx) => !tx.systemTransfer);
  const recentItems = [...visibleTransactions].slice(-8).reverse();
  if (recentItems.length === 0) {
    transactionListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">✨</div>
        <p class="muted">Nog geen transacties</p>
      </div>
    `;
    parentTransactionListEl.innerHTML = `<p class="muted">Nog geen transacties.</p>`;
    return;
  }

  transactionListEl.innerHTML = buildTransactionRowsMarkup(recentItems, true);
  const filteredParentItems = applyParentTransactionFilters([...visibleTransactions].reverse());
  if (filteredParentItems.length === 0) {
    parentTransactionListEl.innerHTML = `<p class="muted">Geen transacties voor deze filter.</p>`;
  } else {
    parentTransactionListEl.innerHTML = buildTransactionRowsMarkup(filteredParentItems, true, true);
  }
}

function renderParentMiniDashboard(categoryData) {
  if (!parentMiniDashboardEl) {
    return;
  }
  if (IS_SOLO_MODE) {
    parentMiniDashboardEl.innerHTML = "";
    return;
  }
  const categories = getEnabledCategoryIds();
  const splitByCategory = Object.fromEntries(
    categories.map((category) => [category, getParentRemainingSplit(category, currentMonth)])
  );
  const transferStats = getCrossParentTransferStats(currentMonth);
  const integrity = checkCalculationIntegrity(categoryData);

  const renderParentCard = (parentKey, emoji) => {
    const label = parentKey === "mama" ? "Mama" : "Papa";
    const totals = categories.map((category) => ({
      category,
      value: splitByCategory[category]?.[parentKey] ?? 0,
    }));
    const totaal = sum(totals.map((item) => item.value));
    const stats = transferStats[parentKey];
    const categoryRows = totals
      .map(
        (item) =>
          `<div class="parent-mini-cat-cell"><span class="parent-mini-cat-label">${humanCategory(item.category)}</span><strong class="parent-mini-cat-value ${item.value >= 0 ? "positive" : "negative"}">${currency.format(item.value)}</strong></div>`
      )
      .join("");
    return `
      <article class="parent-mini-card ${parentKey}">
        <h4>${emoji} ${label}</h4>
        <div class="parent-mini-grid">
          ${categoryRows}
          <div class="parent-mini-cat-cell wide"><span class="parent-mini-cat-label">Totaal</span><strong class="parent-mini-cat-value ${totaal >= 0 ? "positive" : "negative"}">${currency.format(totaal)}</strong></div>
        </div>
        <div class="parent-mini-transfer">
          <span>Genomen van andere ouder: <strong>${currency.format(stats.takenFromOther)}</strong></span>
          <span>Afgestaan aan andere ouder: <strong>${currency.format(stats.givenToOther)}</strong></span>
        </div>
      </article>
    `;
  };

  parentMiniDashboardEl.innerHTML = `
    ${renderParentCard("mama", "💗")}
    ${renderParentCard("papa", "💙")}
    <div class="parent-mini-integrity ${integrity.ok ? "ok" : "error"}">
      ${integrity.ok ? "✅ Controle: berekeningen kloppen overkoepelend." : `⚠️ Controleverschil: ${integrity.message}`}
    </div>
  `;
}

function getCrossParentTransferStats(month) {
  const stats = {
    mama: { takenFromOther: 0, givenToOther: 0 },
    papa: { takenFromOther: 0, givenToOther: 0 },
  };

  state.transactions
    .filter((tx) => !tx.systemTransfer && tx.month === month && tx.amount < 0)
    .forEach((tx) => {
      const actor = tx.createdBy === "papa" ? "papa" : "mama";
      const usageEntries = Array.isArray(tx.budgetUsage) ? tx.budgetUsage : [];
      usageEntries.forEach((entry) => {
        const fromParent = entry.fromParent === "papa" ? "papa" : "mama";
        const amount = Number(entry.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return;
        }
        if (fromParent !== actor) {
          stats[actor].takenFromOther += amount;
          stats[fromParent].givenToOther += amount;
        }
      });
    });

  return stats;
}

function checkCalculationIntegrity(categoryData) {
  const tolerance = 0.02;
  const checks = getEnabledCategoryIds().map((category) => {
    const total = categoryData.find((entry) => entry.category === category)?.totalRemaining ?? 0;
    const split = getParentRemainingSplit(category, currentMonth);
    return {
      label: humanCategory(category).toLowerCase(),
      diff: Math.abs(total - sumOwnerSplit(split)),
    };
  });
  checks.push({
    label: "totaal",
    diff: Math.abs(
      sum(categoryData.map((entry) => entry.totalRemaining)) -
        sum(
          getEnabledCategoryIds().map((category) => {
            const split = getParentRemainingSplit(category, currentMonth);
            return sumOwnerSplit(split);
          })
        )
    ),
  });

  const failed = checks.find((check) => check.diff > tolerance);
  if (!failed) {
    return { ok: true, message: "" };
  }
  return { ok: false, message: `${failed.label} wijkt af (${currency.format(failed.diff)})` };
}

function applyParentTransactionFilters(items) {
  const selectedParent = parentTxFilterParentInput.value;
  const selectedCategory = parentTxFilterCategoryInput.value;
  return items.filter((tx) => {
    if (tx.systemTransfer) {
      return false;
    }
    const parentMatch = selectedParent === "all" || tx.createdBy === selectedParent;
    const categoryMatch = selectedCategory === "all" || tx.category === selectedCategory;
    return parentMatch && categoryMatch;
  });
}

function buildTransactionRowsMarkup(items, includeParentName, includeActions = false) {
  return items
    .map((tx) => {
      const emoji = getCategoryEmoji(tx.category);
      const dateLabel = formatDate(tx.date);
      const parentName =
        tx.createdBy === SOLO_OWNER
          ? ""
          : tx.createdBy === "mama"
            ? "mama"
            : tx.createdBy === "papa"
              ? "papa"
              : "ouder";
      const usageEntries = Array.isArray(tx.budgetUsage)
        ? tx.budgetUsage.filter((entry) => Number(entry.amount) > 0)
        : tx.amount < 0 &&
            tx.borrowAmount > 0 &&
            (tx.borrowFromParent === "mama" ||
              tx.borrowFromParent === "papa" ||
              tx.borrowFromParent === SOLO_OWNER)
          ? [{ fromParent: tx.borrowFromParent, fromCategory: tx.category, amount: tx.borrowAmount }]
          : [];
      const usagePills = usageEntries
        .map((entry) => {
          const cat = entry.fromCategory;
          const crossParentNote =
            !IS_SOLO_MODE &&
            (tx.createdBy === "mama" || tx.createdBy === "papa") &&
            entry.fromParent !== tx.createdBy
              ? ` (bij ${tx.createdBy} transactie)`
              : "";
          const fromLabel = IS_SOLO_MODE
            ? humanCategory(cat).toLowerCase()
            : `${entry.fromParent} ${humanCategory(cat).toLowerCase()}`;
          return `<span class="tx-usage-pill">${currency.format(entry.amount)} van ${fromLabel}${crossParentNote}</span>`;
        })
        .join("");
      return `
        <div class="tx-item">
          <div class="tx-icon tx-icon-${tx.category}">${emoji}</div>
          <div class="tx-body">
            <strong>${humanCategory(tx.category)}${includeParentName && parentName ? ` · ${parentName}` : ""}</strong>
            <p class="tx-meta">${dateLabel}${tx.note ? ` · ${escapeHtml(tx.note)}` : ""}</p>
            ${usagePills ? `<div class="tx-usage-pills">${usagePills}</div>` : ""}
            ${
              includeActions
                ? `<div class="tx-actions">
                    <button type="button" class="tx-action-btn" data-action="edit-tx" data-id="${tx.id}">Wijzigen</button>
                    <button type="button" class="tx-action-btn" data-action="reverse-tx" data-id="${tx.id}">Terugdraaien</button>
                    <button type="button" class="tx-action-btn danger" data-action="delete-tx" data-id="${tx.id}">Verwijderen</button>
                  </div>`
                : ""
            }
          </div>
          <strong class="tx-amount ${tx.amount >= 0 ? "positive" : "negative"}">${currency.format(tx.amount)}</strong>
        </div>
      `;
    })
    .join("");
}

function handleParentTransactionAction(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) {
    return;
  }
  const tx = state.transactions.find((item) => item.id === id);
  if (!tx) {
    return;
  }

  if (action === "edit-tx") {
    txEditState.editingId = id;
    txDateInput.value = tx.date;
    ensureTransactionCategorySelectable(tx.category);
    txCategoryInput.value = tx.category;
    const editMode = tx.amount < 0 ? "expense" : "topup";
    setTransactionMode(editMode);
    txTopupArmed = editMode === "topup";
    txAmountInput.value = String(Math.abs(tx.amount));
    txNoteInput.value = tx.note ?? "";
    if (txFundingModeInput) {
      txFundingModeInput.value = inferTxFundingMode(tx);
    }
    syncTxFundingFieldVisibility();
    txSubmitBtn.textContent = "Wijziging opslaan";
    cancelTxEditBtn.classList.remove("hidden");
    txAmountInput.focus();
    return;
  }

  if (action === "delete-tx") {
    const confirmDelete = window.confirm("Deze transactie verwijderen?");
    if (!confirmDelete) {
      return;
    }
    const linkedIds = Array.isArray(tx.linkedTransferIds) ? tx.linkedTransferIds : [];
    state.transactions = state.transactions.filter((item) => item.id !== id && !linkedIds.includes(item.id));
    saveState();
    render();
    if (txEditState.editingId === id) {
      resetTransactionFormState();
    }
    return;
  }

  if (action === "reverse-tx") {
    const confirmReverse = window.confirm("Transactie terugdraaien met een tegenboeking?");
    if (!confirmReverse) {
      return;
    }
    const reverseAmount = -tx.amount;
    const reverseDate = new Date().toISOString().slice(0, 10);
    const reversedUsage = Array.isArray(tx.budgetUsage) ? tx.budgetUsage : [];
    const reverseLinkedTransferIds = createLinkedCategoryTransfers({
      date: reverseDate,
      month: reverseDate.slice(0, 7),
      targetCategory: tx.category,
      usage: reversedUsage.map((entry) => ({
        fromParent: entry.fromParent,
        fromCategory: entry.fromCategory,
        amount: -Math.abs(Number(entry.amount) || 0),
      })),
    });
    const reverseTx = {
      id: crypto.randomUUID(),
      date: reverseDate,
      month: reverseDate.slice(0, 7),
      category: tx.category,
      amount: reverseAmount,
      note: `Terugdraaiing: ${tx.note || humanCategory(tx.category)}`,
      createdBy: session.loggedInParent || tx.createdBy || "ouder",
      budgetUsage: reversedUsage.map((entry) => ({
        fromParent: entry.fromParent,
        fromCategory: entry.fromCategory,
        amount: -Math.abs(Number(entry.amount) || 0),
      })),
      linkedTransferIds: reverseLinkedTransferIds,
    };
    state.transactions.push(reverseTx);
    state.transactions.sort((a, b) => (a.date > b.date ? 1 : -1));
    saveState();
    render();
  }
}

function resetTransactionFormState() {
  txEditState.editingId = null;
  txSubmitBtn.textContent = "Transactie opslaan";
  cancelTxEditBtn.classList.add("hidden");
  txDateInput.value = new Date().toISOString().slice(0, 10);
  const fallbackCategory = getEnabledCategoryIds()[0] ?? getAllCategoryIds()[0] ?? "zakgeld";
  txCategoryInput.value = fallbackCategory;
  setTransactionMode("expense");
  txTopupArmed = false;
  txAmountInput.value = "";
  txNoteInput.value = "";
  if (txFundingModeInput) {
    txFundingModeInput.value = "auto";
  }
  syncTxFundingFieldVisibility();
}

function handleQuickAmountClick(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const quickValue = target.dataset.quickAmount;
  if (!quickValue) {
    return;
  }

  const numeric = Number(quickValue.replace("+", "").replace("-", ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return;
  }

  setTransactionMode("expense");
  txAmountInput.value = String(numeric);
  txAmountInput.focus();
}

function handleTxPresetClick(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const preset = target.dataset.preset;
  if (preset === "kleding-expense") {
    if (!getEnabledCategoryIds().includes("kleding")) {
      return;
    }
    txCategoryInput.value = "kleding";
    setTransactionMode("expense");
    txAmountInput.focus();
    return;
  }
  if (preset === "zakgeld-expense") {
    if (!getEnabledCategoryIds().includes("zakgeld")) {
      return;
    }
    txCategoryInput.value = "zakgeld";
    setTransactionMode("expense");
    txAmountInput.focus();
  }
}

function handleTopupQuickAmountClick(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (target.dataset.topupManual === "true") {
    setTransactionMode("topup");
    txTopupArmed = true;
    txAmountInput.focus();
    return;
  }
  const numeric = Number(target.dataset.topupAmount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return;
  }
  setTransactionMode("topup");
  txTopupArmed = true;
  txAmountInput.value = String(numeric);
  txAmountInput.focus();
}

function setTransactionMode(mode) {
  const isTopup = mode === "topup";
  txTopupArmed = isTopup;
  txTypeInput.value = isTopup ? "topup" : "expense";
  txModeLabel.textContent = isTopup ? "Actief: bijstorting (uitzondering)" : "Standaard: uitgave";
  txModeLabel.classList.toggle("topup", isTopup);
  txAmountModeHint?.classList.toggle("hidden", !isTopup);
  if (!isTopup && txTopupDetails.open && !txEditState.editingId) {
    txTopupDetails.open = false;
  }
  if (isTopup) {
    txTopupDetails.open = true;
  }
  syncTxFundingFieldVisibility();
}

function createLinkedCategoryTransfers({ date, month, targetCategory, usage }) {
  if (!Array.isArray(usage) || usage.length === 0) {
    return [];
  }
  const linkedIds = [];
  usage.forEach((entry) => {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || Math.abs(amount) <= 0.004) {
      return;
    }
    const fromCategory = entry.fromCategory;
    const fromParent = entry.fromParent === "papa" ? "papa" : "mama";
    if (fromCategory === targetCategory) {
      return;
    }
    const transferOut = {
      id: crypto.randomUUID(),
      date,
      month,
      category: fromCategory,
      amount: -amount,
      note: `Auto overdracht naar ${humanCategory(targetCategory).toLowerCase()}`,
      createdBy: fromParent,
      systemTransfer: true,
    };
    const transferIn = {
      id: crypto.randomUUID(),
      date,
      month,
      category: targetCategory,
      amount,
      note: `Auto overdracht van ${humanCategory(fromCategory).toLowerCase()}`,
      createdBy: fromParent,
      systemTransfer: true,
    };
    state.transactions.push(transferOut, transferIn);
    linkedIds.push(transferOut.id, transferIn.id);
  });
  return linkedIds;
}

// Charts and category simulation engine
function renderChart(categoryData) {
  const canvas = document.getElementById("budgetChart");
  const timeline = mergeTimelines(categoryData);
  const labels = timeline.map((item) => formatMonthShort(item.month));
  const totals = timeline.map((item) => round2(item.total));

  if (chartRef.instance) {
    chartRef.instance.destroy();
  }

  const finalLabels = labels.length > 0 ? labels : [formatMonthShort(currentMonth)];
  const finalData = totals.length > 0 ? totals : [0];
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 130);
  gradient.addColorStop(0, "rgba(214, 168, 238, 0.32)");
  gradient.addColorStop(1, "rgba(244, 194, 220, 0.02)");

  chartRef.instance = new Chart(canvas, {
    type: "line",
    data: {
      labels: finalLabels,
      datasets: [
        {
          label: "Totaal",
          data: finalData,
          borderColor: "#c89bea",
          backgroundColor: gradient,
          borderWidth: 2.5,
          borderDash: [6, 6],
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#c89bea",
          pointHoverBorderColor: "#fff",
          pointHoverBorderWidth: 2,
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      scales: {
        y: {
          display: false,
          beginAtZero: false,
        },
        x: {
          ticks: {
            color: "#b3a4c7",
            font: { size: 11, weight: "500", family: "Plus Jakarta Sans" },
          },
          grid: { display: false },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(42, 26, 63, 0.92)",
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 10,
          cornerRadius: 12,
          displayColors: false,
          callbacks: {
            label: (ctxValue) => currency.format(ctxValue.parsed.y),
          },
        },
      },
    },
  });
}

function applySignedTxToBucketList(buckets, tx) {
  if (tx.amount >= 0) {
    addToBucket(buckets, tx.month, tx.amount);
  } else {
    let toSpend = Math.abs(tx.amount);
    const positiveBuckets = buckets
      .filter((bucket) => bucket.amount > 0)
      .sort((a, b) => a.sourceMonth.localeCompare(b.sourceMonth));

    positiveBuckets.forEach((bucket) => {
      if (toSpend <= 0) {
        return;
      }
      const used = Math.min(bucket.amount, toSpend);
      bucket.amount -= used;
      toSpend -= used;
    });

    if (toSpend > 0) {
      addToBucket(buckets, tx.month, -toSpend);
    }
  }
  pruneZeroBuckets(buckets);
}

function simulateCategory(category, upToMonth) {
  const months = getMonthRange(upToMonth);
  const buckets = [];
  const timeline = [];

  months.forEach((month) => {
    const contribution = PARENTS.reduce(
      (acc, owner) => acc + getBudgetAmountForMonth(month, category, owner),
      0
    );
    if (Math.abs(contribution) > 0.004) {
      addToBucket(buckets, month, contribution);
    }

    const txs = state.transactions
      .filter((tx) => tx.month === month && tx.category === category)
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    txs.forEach((tx) => {
      applySignedTxToBucketList(buckets, tx);
    });

    timeline.push({
      month,
      total: sum(buckets.map((bucket) => bucket.amount)),
    });
  });

  return { buckets, timeline };
}

function mergeTimelines(categoryData) {
  const merged = new Map();
  categoryData.forEach((category) => {
    category.timeline.forEach((entry) => {
      merged.set(entry.month, (merged.get(entry.month) ?? 0) + entry.total);
    });
  });
  return [...merged.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, total]) => ({ month, total }));
}

function getMonthRange(upToMonth) {
  const monthsWithData = [
    ...Object.keys(state.monthlyBudgets),
    ...state.transactions.map((tx) => tx.month),
    upToMonth,
  ].filter(Boolean);

  if (monthsWithData.length === 0) {
    return [upToMonth];
  }

  monthsWithData.sort();
  const start = monthsWithData[0];
  const range = [];
  let cursor = start;
  while (cursor <= upToMonth) {
    range.push(cursor);
    cursor = nextMonth(cursor);
  }
  return range;
}

function nextMonth(month) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const numMonth = Number(monthRaw);
  const date = new Date(year, numMonth, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonth(month) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const numMonth = Number(monthRaw);
  const date = new Date(year, numMonth - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysUntilNextMonth() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.ceil((nextMonth - now) / msPerDay));
}

function addToBucket(buckets, sourceMonth, amount) {
  const existing = buckets.find((bucket) => bucket.sourceMonth === sourceMonth);
  if (existing) {
    existing.amount += amount;
  } else {
    buckets.push({ sourceMonth, amount });
  }
}

function addOwnedBucket(buckets, sourceMonth, owner, amount) {
  const existing = buckets.find(
    (bucket) => bucket.sourceMonth === sourceMonth && bucket.owner === owner
  );
  if (existing) {
    existing.amount += amount;
  } else {
    buckets.push({ sourceMonth, owner, amount });
  }
}

function getBudgetAmountForMonth(month, category, parent) {
  const explicit = state.monthlyBudgets[month]?.[category]?.[parent];
  if (typeof explicit === "number") {
    return explicit;
  }
  const recurringAmount = state.recurringBudgets?.[parent]?.[category] ?? 0;
  if (Math.abs(recurringAmount) <= 0.004) {
    return 0;
  }
  const configuredStart = state.recurringStartMonth?.[parent]?.[category];
  const startMonth = configuredStart || currentMonth;
  if (month < startMonth) {
    return 0;
  }
  const interval = getRecurringIntervalFor(parent, category);
  const diff = monthIndexFromKey(month) - monthIndexFromKey(startMonth);
  if (diff < 0 || diff % interval !== 0) {
    return 0;
  }
  return recurringAmount;
}

function pruneZeroBuckets(buckets) {
  for (let i = buckets.length - 1; i >= 0; i -= 1) {
    if (Math.abs(buckets[i].amount) <= 0.004) {
      buckets.splice(i, 1);
    }
  }
}

function normalizeCategoryId(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeCategoryHexColor(raw) {
  const s = String(raw ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) {
    return s.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "";
}

function pickFallbackColorForCategoryId(categoryId) {
  return CATEGORY_COLOR_FALLBACK_PALETTE[getStableIndex(categoryId, CATEGORY_COLOR_FALLBACK_PALETTE.length)];
}

function getCategoryById(categoryId) {
  return (state.categories ?? []).find((entry) => entry.id === categoryId) ?? null;
}

function getAllCategoryIds() {
  return (state.categories ?? []).map((entry) => entry.id);
}

function getEnabledCategoryIds() {
  return (state.categories ?? []).filter((entry) => entry.enabled !== false).map((entry) => entry.id);
}

function getCategoryEmoji(categoryId) {
  return getCategoryById(categoryId)?.emoji || "💠";
}

function getCategoryColor(categoryId) {
  const fromDefinition = normalizeCategoryHexColor(getCategoryById(categoryId)?.color);
  if (fromDefinition) {
    return fromDefinition;
  }
  if (categoryId === "kleding") {
    return "#2f5ea2";
  }
  if (categoryId === "zakgeld") {
    return "#8d45cc";
  }
  return pickFallbackColorForCategoryId(categoryId);
}

function refreshCategorySelectors() {
  const enabled = getEnabledCategoryIds();
  const all = getAllCategoryIds();
  const txCurrent = txCategoryInput.value;
  const budgetCurrent = budgetCategoryInput.value;
  const filterCurrent = parentTxFilterCategoryInput.value;

  txCategoryInput.innerHTML = enabled
    .map((category) => `<option value="${category}">${getCategoryEmoji(category)} ${humanCategory(category)}</option>`)
    .join("");
  budgetCategoryInput.innerHTML = enabled
    .map((category) => `<option value="${category}">${getCategoryEmoji(category)} ${humanCategory(category)}</option>`)
    .join("");
  parentTxFilterCategoryInput.innerHTML = `<option value="all">Alles</option>${all
    .map((category) => `<option value="${category}">${humanCategory(category)}</option>`)
    .join("")}`;

  if (enabled.includes(txCurrent)) {
    txCategoryInput.value = txCurrent;
  } else if (enabled.length > 0) {
    txCategoryInput.value = enabled[0];
  }
  if (enabled.includes(budgetCurrent)) {
    budgetCategoryInput.value = budgetCurrent;
  } else if (enabled.length > 0) {
    budgetCategoryInput.value = enabled[0];
  }
  parentTxFilterCategoryInput.value = filterCurrent === "all" || all.includes(filterCurrent) ? filterCurrent : "all";

  document.querySelectorAll(".tx-preset-btn").forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const preset = button.dataset.preset;
    const linkedCategory =
      preset === "kleding-expense" ? "kleding" : preset === "zakgeld-expense" ? "zakgeld" : null;
    if (!linkedCategory) {
      return;
    }
    const isEnabled = enabled.includes(linkedCategory);
    button.classList.toggle("hidden", !isEnabled);
    button.classList.toggle("tx-preset-hidden", !isEnabled);
    button.disabled = !isEnabled;
    button.setAttribute("aria-hidden", String(!isEnabled));
    button.style.display = isEnabled ? "" : "none";
  });
}

function ensureTransactionCategorySelectable(categoryId) {
  if (!categoryId) {
    return;
  }
  const existing = Array.from(txCategoryInput.options).some((option) => option.value === categoryId);
  if (existing) {
    return;
  }
  const extra = document.createElement("option");
  extra.value = categoryId;
  extra.textContent = `${getCategoryEmoji(categoryId)} ${humanCategory(categoryId)} (uitgeschakeld)`;
  txCategoryInput.appendChild(extra);
}

function renderCategoryConfigList() {
  if (!categoryConfigListEl) {
    return;
  }
  const canDeleteAny = (state.categories ?? []).length > 1;
  categoryConfigListEl.innerHTML = (state.categories ?? [])
    .map((category) => {
      const activeLabel = category.enabled === false ? "Uitgeschakeld" : "Actief";
      const actionLabel = category.enabled === false ? "Inschakelen" : "Uitschakelen";
      const swatchHex =
        normalizeCategoryHexColor(category.color) || pickFallbackColorForCategoryId(category.id);
      return `
        <div class="auto-renew-row category-config-row">
          <input
            type="color"
            class="category-color-input"
            data-category-color-id="${category.id}"
            value="${swatchHex}"
            title="Kleur op Lena-scherm"
            aria-label="Kleur voor ${escapeHtml(category.label)}"
          />
          <span class="category-config-title">${category.emoji || "💠"} ${escapeHtml(category.label)} · ${activeLabel}</span>
          <div class="auto-renew-actions">
            <button type="button" class="auto-renew-btn" data-action="toggle-category" data-id="${category.id}">${actionLabel}</button>
            <button
              type="button"
              class="auto-renew-btn danger"
              data-action="delete-category"
              data-id="${category.id}"
              ${canDeleteAny ? "" : "disabled"}
            >Wissen</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function setCategoryConfigStatus(message, isSuccess) {
  if (!categoryConfigStatusEl) {
    return;
  }
  categoryConfigStatusEl.textContent = message;
  categoryConfigStatusEl.classList.toggle("positive", Boolean(message) && isSuccess);
  categoryConfigStatusEl.classList.toggle("error", Boolean(message) && !isSuccess);
}

function handleCategoryConfigSubmit(event) {
  event.preventDefault();
  if (!session.loggedInParent) {
    setCategoryConfigStatus(
      IS_SOLO_MODE ? "Log eerst in via Beheer (slotje)." : "Log eerst in als ouder.",
      false
    );
    return;
  }
  const label = newCategoryNameInput.value.trim();
  const id = normalizeCategoryId(label);
  const emoji = newCategoryEmojiInput.value.trim() || "💠";
  const colorNorm =
    normalizeCategoryHexColor(newCategoryColorInput?.value || "") || pickFallbackColorForCategoryId(id);
  if (!label || !id) {
    setCategoryConfigStatus("Vul een geldige categorienaam in.", false);
    return;
  }
  if (getCategoryById(id)) {
    setCategoryConfigStatus("Deze categorie bestaat al.", false);
    return;
  }
  state.categories.push({ id, label, emoji, enabled: true, color: colorNorm });
  ensureCategoryStructures(state);
  saveState();
  newCategoryNameInput.value = "";
  newCategoryEmojiInput.value = "";
  if (newCategoryColorInput) {
    newCategoryColorInput.value = "#4a9ca8";
  }
  setCategoryConfigStatus(`Categorie "${label}" toegevoegd.`, true);
  render();
}

function handleCategoryConfigListChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (!target.dataset.categoryColorId) {
    return;
  }
  if (!session.loggedInParent) {
    return;
  }
  const cat = getCategoryById(target.dataset.categoryColorId);
  if (!cat) {
    return;
  }
  const hex = normalizeCategoryHexColor(target.value);
  if (hex) {
    cat.color = hex;
  } else {
    delete cat.color;
  }
  saveState();
  render();
}

function removeTransactionsForCategory(categoryId) {
  state.transactions = state.transactions.filter((tx) => tx.category !== categoryId);
  const existing = new Set(state.transactions.map((t) => t.id).filter(Boolean));
  state.transactions = state.transactions.filter((tx) => {
    const links = Array.isArray(tx.linkedTransferIds) ? tx.linkedTransferIds : [];
    if (links.length === 0) {
      return true;
    }
    return links.every((lid) => existing.has(lid));
  });
}

function deleteCategoryByUser(categoryId) {
  if (!categoryId || !session.loggedInParent) {
    return;
  }
  if ((state.categories ?? []).length <= 1) {
    setCategoryConfigStatus("Je moet minstens één categorie behouden.", false);
    return;
  }
  const cat = getCategoryById(categoryId);
  if (!cat) {
    return;
  }
  const nTx = state.transactions.filter((tx) => tx.category === categoryId).length;
  const confirmMsg = `Categorie "${cat.label}" permanent wissen? Dit verwijdert ${nTx} transactie(s) in deze categorie en alle gekoppelde maand- en automatische budgetregels.`;
  if (!window.confirm(confirmMsg)) {
    return;
  }
  state.categories = state.categories.filter((c) => c.id !== categoryId);
  Object.keys(state.monthlyBudgets ?? {}).forEach((monthKey) => {
    const me = state.monthlyBudgets[monthKey];
    if (me && typeof me === "object") {
      delete me[categoryId];
    }
  });
  PARENTS.forEach((parent) => {
    delete state.recurringBudgets?.[parent]?.[categoryId];
    delete state.recurringStartMonth?.[parent]?.[categoryId];
    delete state.recurringIntervalMonths?.[parent]?.[categoryId];
  });
  removeTransactionsForCategory(categoryId);
  ensureCategoryStructures(state);
  saveState();
  setCategoryConfigStatus(`Categorie "${cat.label}" is verwijderd.`, true);
  render();
}

function handleCategoryConfigListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (target.dataset.action === "delete-category") {
    deleteCategoryByUser(target.dataset.id ?? "");
    return;
  }
  if (target.dataset.action !== "toggle-category") {
    return;
  }
  const categoryId = target.dataset.id;
  if (!categoryId) {
    return;
  }
  const category = getCategoryById(categoryId);
  if (!category) {
    return;
  }
  const nextEnabled = category.enabled === false;
  if (!nextEnabled) {
    const confirmDisable = window.confirm(
      `${humanCategory(category.id)} uitschakelen? Dit geldt meteen voor alle gebruikers van ${CHILD_NAME}.`
    );
    if (!confirmDisable) {
      return;
    }
  }
  if (category.enabled !== false && getEnabledCategoryIds().length <= 1) {
    setCategoryConfigStatus("Minstens 1 categorie moet actief blijven.", false);
    return;
  }
  category.enabled = category.enabled === false;
  saveState();
  setCategoryConfigStatus(
    category.enabled === false
      ? `${humanCategory(category.id)} staat nu uitgeschakeld.`
      : `${humanCategory(category.id)} staat opnieuw actief.`,
    true
  );
  render();
}

function ensureCategoryStructures(stateRef) {
  const incoming = Array.isArray(stateRef.categories) ? stateRef.categories : [];
  const seeded = incoming.length > 0 ? incoming : defaultCategories;
  const unique = [];
  seeded.forEach((entry) => {
    const id = normalizeCategoryId(entry.id || entry.label);
    if (!id || unique.some((item) => item.id === id)) {
      return;
    }
    const colorHex = normalizeCategoryHexColor(entry.color);
    unique.push({
      id,
      label: String(entry.label ?? id),
      emoji: String(entry.emoji ?? "💠"),
      enabled: entry.enabled !== false,
      ...(colorHex ? { color: colorHex } : {}),
    });
  });
  if (unique.length === 0) {
    unique.push(...structuredClone(defaultCategories));
  }
  stateRef.categories = unique;

  stateRef.recurringBudgets ??= {};
  stateRef.recurringStartMonth ??= {};
  stateRef.recurringIntervalMonths ??= {};
  PARENTS.forEach((parent) => {
    stateRef.recurringBudgets[parent] ??= {};
    stateRef.recurringStartMonth[parent] ??= {};
    stateRef.recurringIntervalMonths[parent] ??= {};
    unique.forEach((category) => {
      if (typeof stateRef.recurringBudgets[parent][category.id] !== "number") {
        stateRef.recurringBudgets[parent][category.id] = 0;
      }
      if (typeof stateRef.recurringStartMonth[parent][category.id] !== "string") {
        stateRef.recurringStartMonth[parent][category.id] = null;
      }
      const intervalRaw = stateRef.recurringIntervalMonths[parent][category.id];
      stateRef.recurringIntervalMonths[parent][category.id] = clampRecurringIntervalMonths(
        intervalRaw === undefined || intervalRaw === null ? 1 : intervalRaw
      );
    });
  });

  const validCategoryIds = new Set(unique.map((c) => c.id));
  PARENTS.forEach((parent) => {
    ["recurringBudgets", "recurringStartMonth", "recurringIntervalMonths"].forEach((mapKey) => {
      const mapObj = stateRef[mapKey]?.[parent];
      if (!mapObj || typeof mapObj !== "object") {
        return;
      }
      Object.keys(mapObj).forEach((catId) => {
        if (!validCategoryIds.has(catId)) {
          delete mapObj[catId];
        }
      });
    });
  });

  stateRef.monthlyBudgets ??= {};
  Object.keys(stateRef.monthlyBudgets).forEach((month) => {
    const monthEntry = stateRef.monthlyBudgets[month];
    if (!monthEntry || typeof monthEntry !== "object") {
      stateRef.monthlyBudgets[month] = {};
      return;
    }
    unique.forEach((category) => {
      monthEntry[category.id] ??= createEmptyOwnerAmounts();
      PARENTS.forEach((parent) => {
        if (typeof monthEntry[category.id][parent] !== "number") {
          monthEntry[category.id][parent] = 0;
        }
      });
    });
  });

  (stateRef.transactions ?? []).forEach((tx) => {
    if (tx && typeof tx === "object") {
      delete tx.kledingSub;
    }
  });

  normalizeStateForSolo(stateRef);
  stampAppModeOnState(stateRef);
}

// State persistence and migrations
function mergeOwnerKeyedMaps(baseMap, parsedMap) {
  const merged = { ...baseMap, ...(parsedMap ?? {}) };
  PARENTS.forEach((owner) => {
    merged[owner] = { ...(baseMap?.[owner] ?? {}), ...(parsedMap?.[owner] ?? {}) };
  });
  return merged;
}

function mergeParentMessageEntry(parsedEntry, baseEntry) {
  const base = baseEntry ?? { text: "", expiresAt: null };
  if (typeof parsedEntry === "string") {
    return { text: parsedEntry, expiresAt: null };
  }
  return {
    text: parsedEntry?.text ?? base.text ?? "",
    expiresAt: parsedEntry?.expiresAt ?? base.expiresAt ?? null,
    readAt: parsedEntry?.readAt ?? base.readAt ?? null,
  };
}

function mergeCoachSettings(parsedCoach, baseCoach) {
  const base = baseCoach ?? {
    autoCoachEnabled: true,
    sensitivity: "normal",
    parentMessages: {},
  };
  const parsed = parsedCoach ?? {};
  const parentMessages = { ...base.parentMessages, ...(parsed.parentMessages ?? {}) };
  PARENTS.forEach((owner) => {
    parentMessages[owner] = mergeParentMessageEntry(
      parsed.parentMessages?.[owner],
      base.parentMessages?.[owner]
    );
  });
  return {
    ...base,
    ...parsed,
    autoCoachEnabled: parsed.autoCoachEnabled ?? base.autoCoachEnabled,
    sensitivity: parsed.sensitivity ?? base.sensitivity ?? "normal",
    parentMessages,
  };
}

function mergeParsedIntoBase(parsed) {
  const base = structuredClone(defaultState);

  if (parsed.pin && !parsed.pins) {
    base.pins = IS_SOLO_MODE
      ? { [SOLO_OWNER]: parsed.pin }
      : { mama: parsed.pin, papa: parsed.pin };
  }

  const merged = {
    ...base,
    ...parsed,
    pins: { ...base.pins, ...(parsed.pins ?? {}) },
    recurringBudgets: mergeOwnerKeyedMaps(base.recurringBudgets, parsed.recurringBudgets),
    recurringStartMonth: mergeOwnerKeyedMaps(base.recurringStartMonth, parsed.recurringStartMonth),
    recurringIntervalMonths: mergeOwnerKeyedMaps(
      base.recurringIntervalMonths,
      parsed.recurringIntervalMonths
    ),
    coachSettings: mergeCoachSettings(parsed.coachSettings, base.coachSettings),
  };
  delete merged.kledingSubSplitEnabled;
  delete merged.kledingSubSplits;
  ensureCategoryStructures(merged);
  return merged;
}

function replaceAppState(nextMerged) {
  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  Object.assign(state, nextMerged);
  ensureCategoryStructures(state);
}

async function hydrateFromCloudSnapshot() {
  cloudSyncState.syncEligible =
    looksLikeUuid(ACTIVE_CHILD_ID) && looksLikeUuid(ACTIVE_FAMILY_ID) && !CLOUD_SYNC_BLOCKED;
  cloudSyncState.lastSyncError = CLOUD_SYNC_BLOCKED
    ? "Solo mag niet dezelfde kind-ID als Lena gebruiken — maak een aparte child in Supabase."
    : "";

  if (!supabaseClient || !cloudSyncState.connected || !cloudSyncState.syncEligible) {
    renderCloudSyncStatus();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("child_budget_snapshots")
      .select("payload, updated_at")
      .eq("child_id", ACTIVE_CHILD_ID)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const localRev = Number(state.syncRevision) || 0;

    if (!data?.payload || typeof data.payload !== "object") {
      await pushCloudSnapshot({ silent: true });
      cloudSyncState.lastSyncedAt = Date.now();
      renderCloudSyncStatus();
      return;
    }

    const compatibility = payloadCompatibleWithCurrentApp(data.payload);
    if (!compatibility.ok) {
      const remoteMode = inferPayloadAppMode(data.payload);
      if (IS_SOLO_MODE && remoteMode === "family") {
        await pushCloudSnapshot({ silent: true });
        if (!cloudSyncState.lastSyncError) {
          cloudSyncState.lastSyncedAt = Date.now();
          renderCloudSyncStatus();
          return;
        }
      }
      cloudSyncState.lastSyncError = compatibility.reason;
      renderCloudSyncStatus();
      return;
    }

    const remoteMerged = mergeParsedIntoBase(data.payload);
    const remoteRev =
      Number(remoteMerged.syncRevision) || new Date(data.updated_at).getTime() || 0;

    if (remoteRev > localRev) {
      replaceAppState(remoteMerged);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      cloudSyncState.lastSyncedAt = Date.now();
      renderCloudSyncStatus();
      return;
    }

    if (localRev > remoteRev) {
      await pushCloudSnapshot({ silent: true });
      cloudSyncState.lastSyncedAt = Date.now();
    } else {
      cloudSyncState.lastSyncedAt = new Date(data.updated_at).getTime();
    }
  } catch (err) {
    cloudSyncState.lastSyncError = err?.message ?? String(err);
  }
  renderCloudSyncStatus();
}

async function pushCloudSnapshot(options = {}) {
  if (!supabaseClient || !cloudSyncState.connected || !cloudSyncState.syncEligible) {
    return;
  }
  try {
    state.syncRevision = Math.max(Number(state.syncRevision) || 0, Date.now());
    ensureCategoryStructures(state);
    stampAppModeOnState(state);
    const payload = JSON.parse(JSON.stringify(state));
    const { error } = await supabaseClient.from("child_budget_snapshots").upsert(
      {
        child_id: ACTIVE_CHILD_ID,
        family_id: ACTIVE_FAMILY_ID,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "child_id" }
    );
    if (error) {
      throw error;
    }
    cloudSyncState.lastSyncError = "";
    cloudSyncState.lastSyncedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    cloudSyncState.lastSyncError = err?.message ?? String(err);
    if (!options.silent) {
      console.warn("Cloud snapshot push mislukt", err);
    }
  }
  renderCloudSyncStatus();
}

function schedulePushCloudSnapshot() {
  if (!supabaseClient || !cloudSyncState.connected || !cloudSyncState.syncEligible) {
    return;
  }
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    cloudPushTimer = null;
    void pushCloudSnapshot({ silent: true });
  }, 900);
}

function flushScheduledCloudPush() {
  if (!cloudPushTimer) {
    return;
  }
  clearTimeout(cloudPushTimer);
  cloudPushTimer = null;
  void pushCloudSnapshot({ silent: true });
}

function readLocalStorageRaw() {
  let raw = localStorage.getItem(STORAGE_KEY);
  if (raw || STORAGE_KEY === LEGACY_STORAGE_KEY) {
    return raw;
  }
  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) {
    return null;
  }
  try {
    const legacyParsed = JSON.parse(legacyRaw);
    const legacyMode = inferPayloadAppMode(legacyParsed);
    if (legacyMode !== null && legacyMode !== APP_MODE) {
      return null;
    }
    return legacyRaw;
  } catch {
    return null;
  }
}

function loadState() {
  try {
    const raw = readLocalStorageRaw();
    if (!raw) {
      const fresh = structuredClone(defaultState);
      ensureCategoryStructures(fresh);
      return fresh;
    }
    const merged = mergeParsedIntoBase(JSON.parse(raw));
    const compatibility = payloadCompatibleWithCurrentApp(merged);
    if (!compatibility.ok) {
      const fresh = structuredClone(defaultState);
      ensureCategoryStructures(fresh);
      return fresh;
    }
    return merged;
  } catch {
    const fallback = structuredClone(defaultState);
    ensureCategoryStructures(fallback);
    return fallback;
  }
}

function saveState(options = {}) {
  ensureCategoryStructures(state);
  state.syncRevision = Math.max(Number(state.syncRevision) || 0, Date.now());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!options.skipRemote) {
    schedulePushCloudSnapshot();
  }
}

function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
  if (LEGACY_STORAGE_KEY !== STORAGE_KEY) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
  const fresh = structuredClone(defaultState);
  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  Object.assign(state, fresh);
  ensureCategoryStructures(state);
  session.loggedInParent = null;
  setParentPanelOpen(false);
  if (parentDialog.open) {
    parentDialog.close();
  }
  renderLoggedInParent();
  setParentMessageStatus("Alles gewist. Je start nu volledig opnieuw.", true);
  saveState({ skipRemote: false });
  render();
}

// Generic formatting/math utilities
function humanCategory(category) {
  const match = getCategoryById(category);
  if (match?.label) {
    return match.label;
  }
  const normalized = String(category ?? "").replace(/[-_]/g, " ").trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Categorie";
}

function formatMonth(value) {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
}

function formatMonthShort(value) {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("nl-BE", { month: "short" });
}

function formatDate(value) {
  const date = new Date(value);
  return date.toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
