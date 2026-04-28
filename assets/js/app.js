const defaultState = {
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
  transactions: [],
  coachSettings: {
    autoCoachEnabled: true,
    sensitivity: "normal",
    parentMessages: {
      mama: { text: "", expiresAt: null },
      papa: { text: "", expiresAt: null },
    },
  },
};

const currency = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
});

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const APP_BUILD_VERSION = "2026-04-28-1623";
const urlParams = new URLSearchParams(window.location.search);
const appConfig = window.__SUPABASE_CONFIG__ ?? {};
const ACTIVE_FAMILY_ID = (urlParams.get("family") || appConfig.familyId || "default-family").trim();
const ACTIVE_CHILD_ID = (urlParams.get("child") || appConfig.childId || "default-child").trim();
const CHILD_NAME = (urlParams.get("childName") || appConfig.childName || "Lena").trim();
const defaultAppName = `${CHILD_NAME.toLowerCase().replace(/\s+/g, "-")}_budget`;
const APP_NAME = (urlParams.get("appName") || appConfig.appName || defaultAppName).trim();
const STORAGE_KEY = `child-budget-v1:${ACTIVE_FAMILY_ID}:${ACTIVE_CHILD_ID}`;
window.__ACTIVE_APP_CONTEXT__ = {
  familyId: ACTIVE_FAMILY_ID,
  childId: ACTIVE_CHILD_ID,
};

const state = loadState();
const chartRef = { instance: null };

const totalRemainingEl = document.getElementById("totalRemaining");
const monthLabelEl = document.getElementById("monthLabel");
const topAvailabilityBreakdownEl = document.getElementById("topAvailabilityBreakdown");
const coachAlertsEl = document.getElementById("coachAlerts");
const speedRingsEl = document.getElementById("speedRings");
const clearOverviewEl = document.getElementById("clearOverview");
const rolloverBreakdownEl = document.getElementById("rolloverBreakdown");
const appTitleEl = document.getElementById("appTitle");
const appBuildMetaEl = document.getElementById("appBuildMeta");
const heroEyebrowEl = document.getElementById("heroEyebrow");
const heroGreetingEl = document.getElementById("heroGreeting");
const parentMessageLabelEl = document.getElementById("parentMessageLabel");
const lenaViewEl = document.getElementById("lenaView");
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
const autoRenewCountdownEl = document.getElementById("autoRenewCountdown");
const autoRenewOverviewEl = document.getElementById("autoRenewOverview");

const txForm = document.getElementById("transactionForm");
const txDateInput = document.getElementById("txDate");
const txCategoryInput = document.getElementById("txCategory");
const txTypeInput = document.getElementById("txType");
const txModeLabel = document.getElementById("txModeLabel");
const txTopupDetails = document.getElementById("txTopupDetails");
const txAmountInput = document.getElementById("txAmount");
const txAmountModeHint = document.getElementById("txAmountModeHint");
const txNoteInput = document.getElementById("txNote");
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
const parentMessageForm = document.getElementById("parentMessageForm");
const parentMessageInput = document.getElementById("parentMessageInput");
const parentMessageDaysInput = document.getElementById("parentMessageDays");
const coachSensitivityInput = document.getElementById("coachSensitivity");
const autoCoachEnabledInput = document.getElementById("autoCoachEnabled");
const parentMessageStatusEl = document.getElementById("parentMessageStatus");
const toggleDetailsBtn = document.getElementById("toggleDetailsBtn");
const extraInsightsEl = document.getElementById("extraInsights");
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
};
const supabaseClient = createSupabaseClient();

init();

// App bootstrap and top-level UI state
function init() {
  applyBranding();
  monthLabelEl.textContent = formatMonth(currentMonth);
  budgetMonthInput.value = currentMonth;
  txDateInput.value = new Date().toISOString().slice(0, 10);
  renderLoggedInParent();
  setParentPanelOpen(false);
  initializeCloudConnection();
  renderBuildMeta();
  applyResponsiveButtonLabels();
  window.addEventListener("resize", applyResponsiveButtonLabels);

  parentModeBtn.addEventListener("click", () => parentDialog.showModal());
  cancelPinBtn.addEventListener("click", () => {
    pinError.textContent = "";
    pinInput.value = "";
    loginParentInput.value = "mama";
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
    if (session.loggedInParent !== "papa") {
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

  toggleDetailsBtn.addEventListener("click", () => {
    const isHidden = extraInsightsEl.classList.toggle("hidden");
    setDetailsButtonText(isHidden);
  });
  autoRenewOverviewEl.addEventListener("click", handleAutoRenewActionClick);
  parentTxFilterParentInput.addEventListener("change", () => renderTransactions());
  parentTxFilterCategoryInput.addEventListener("change", () => renderTransactions());
  parentTransactionListEl.addEventListener("click", handleParentTransactionAction);
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

  applyInitialViewMode();

  pinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedParent = loginParentInput.value;
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

    if (!month || Number.isNaN(amount)) {
      return;
    }

    state.monthlyBudgets[month] ??= {
      zakgeld: { mama: 0, papa: 0 },
      kleding: { mama: 0, papa: 0 },
    };
    state.monthlyBudgets[month][category][parent] = amount;
    if (budgetAutoRenewInput.checked) {
      state.recurringBudgets[parent][category] = amount;
      state.recurringStartMonth[parent][category] = month;
    }
    saveState();
    render();
    budgetAmountInput.value = "";
    budgetAutoRenewInput.checked = false;
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

    if (!date || Number.isNaN(rawAmount) || rawAmount <= 0) {
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
      existing.borrowFromParent = null;
      existing.borrowAmount = 0;
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
      state.transactions.push({
        id: txId,
        date,
        month,
        category,
        amount,
        note: txNoteInput.value.trim(),
        createdBy: session.loggedInParent,
        budgetUsage,
        linkedTransferIds,
      });
    }
    state.transactions.sort((a, b) => (a.date > b.date ? 1 : -1));

    saveState();
    render();
    resetTransactionFormState();
  });

  changePinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!session.loggedInParent) {
      setChangePinMessage("Log eerst in als ouder.", false);
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
      setParentMessageStatus("Log eerst in als ouder.", false);
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
    renderParentCoachSummary();
  });

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
  if (cloudSyncState.connected) {
    return { dotClass: "online", label: "cloud online" };
  }
  return { dotClass: "offline", label: "cloud offline" };
}

function applyBranding() {
  if (appTitleEl) {
    appTitleEl.textContent = APP_NAME;
  }
  if (heroEyebrowEl) {
    heroEyebrowEl.textContent = APP_NAME;
  }
  if (heroGreetingEl) {
    heroGreetingEl.innerHTML = `Hey ${escapeHtml(CHILD_NAME)} <span class="wave">✨</span>`;
  }
  if (parentMessageLabelEl) {
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
  if (cloudSyncState.connected) {
    cloudSyncStatusEl.textContent = "Cloud sync: verbonden met Supabase";
    cloudSyncStatusEl.classList.remove("error");
    cloudSyncStatusEl.classList.add("positive");
    renderBuildMeta();
    return;
  }
  cloudSyncStatusEl.textContent = `Cloud sync: niet verbonden (${cloudSyncState.lastError})`;
  cloudSyncStatusEl.classList.remove("positive");
  cloudSyncStatusEl.classList.add("error");
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
  if (lenaViewEl) {
    lenaViewEl.setAttribute("data-parent-open", isOpen ? "true" : "false");
  }
}

function setDetailsButtonText(isHidden) {
  toggleDetailsBtn.textContent = isHidden ? "Toon extra details" : "Verberg extra details";
}

function renderLoggedInParent() {
  if (!session.loggedInParent) {
    loggedInAsEl.textContent = "";
    resetAllDataBtn.classList.add("hidden");
    return;
  }
  const name = session.loggedInParent === "mama" ? "Mama" : "Papa";
  loggedInAsEl.textContent = `Aangemeld als: ${name}`;
  resetAllDataBtn.classList.toggle("hidden", session.loggedInParent !== "papa");
  setChangePinMessage("", true);
  hydrateParentCoachForm();
  setParentMessageStatus("", true);
}

function setChangePinMessage(message, isSuccess) {
  changePinMessageEl.textContent = message;
  changePinMessageEl.classList.toggle("positive", Boolean(message) && isSuccess);
  changePinMessageEl.classList.toggle("error", Boolean(message) && !isSuccess);
}

// Main render pipeline
function render() {
  const categories = ["zakgeld", "kleding"];
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
  renderParentCoachSummary();
  renderParentMiniDashboard(categoryData);
  renderAutoRenewOverview();

  renderBreakdown(categoryData);
  renderTransactions();
  renderChart(categoryData);
}

// Parent budget configuration (auto-renew)
function renderAutoRenewOverview() {
  const entries = [];
  ["mama", "papa"].forEach((parent) => {
    ["kleding", "zakgeld"].forEach((category) => {
      const amount = state.recurringBudgets?.[parent]?.[category] ?? 0;
      if (Math.abs(amount) > 0.004) {
        entries.push({ parent, category, amount });
      }
    });
  });

  const daysLeft = daysUntilNextMonth();
  autoRenewCountdownEl.textContent = `Automatische verlenging over ${daysLeft} dag${daysLeft === 1 ? "" : "en"} (op 1ste van volgende maand).`;

  if (entries.length === 0) {
    autoRenewOverviewEl.innerHTML = `<p class="muted">Nog geen automatische verlenging ingesteld.</p>`;
    return;
  }

  autoRenewOverviewEl.innerHTML = entries
    .map((entry) => {
      const parentLabel = entry.parent === "mama" ? "Mama" : "Papa";
      const catLabel = entry.category === "kleding" ? "👗 Kleding" : "💜 Zakgeld";
      return `
        <div class="auto-renew-row">
          <span>${parentLabel} · ${catLabel}</span>
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
    saveState();
    render();
    return;
  }

  if (action === "edit") {
    const amount = Number(target.dataset.amount ?? "0");
    budgetCategoryInput.value = category;
    budgetAmountInput.value = Number.isNaN(amount) ? "" : String(amount);
    budgetAutoRenewInput.checked = true;
    budgetAmountInput.focus();
    setParentMessageStatus(
      `Klaar om auto-bedrag voor ${parent === "mama" ? "mama" : "papa"} · ${humanCategory(category).toLowerCase()} te wijzigen.`,
      true
    );
  }
}

// Top Lena dashboard blocks
function renderTopAvailability(categoryData) {
  const kledingAvailable = categoryData.find((entry) => entry.category === "kleding")?.totalRemaining ?? 0;
  const zakgeldAvailable = categoryData.find((entry) => entry.category === "zakgeld")?.totalRemaining ?? 0;
  const kledingSplit = getParentRemainingSplit("kleding", currentMonth);
  const zakgeldSplit = getParentRemainingSplit("zakgeld", currentMonth);

  topAvailabilityBreakdownEl.innerHTML = `
    <div class="top-availability-pill kleding">
      <span>👗 Kleding</span>
      <strong class="${kledingAvailable >= 0 ? "positive" : "negative"}">${currency.format(kledingAvailable)}</strong>
      <div class="top-availability-split">
        <span class="parent-mini-pill mama">mama ${currency.format(kledingSplit.mama)}</span>
        <span class="parent-mini-pill papa">papa ${currency.format(kledingSplit.papa)}</span>
      </div>
    </div>
    <div class="top-availability-pill zakgeld">
      <span>💜 Zakgeld</span>
      <strong class="${zakgeldAvailable >= 0 ? "positive" : "negative"}">${currency.format(zakgeldAvailable)}</strong>
      <div class="top-availability-split">
        <span class="parent-mini-pill mama">mama ${currency.format(zakgeldSplit.mama)}</span>
        <span class="parent-mini-pill papa">papa ${currency.format(zakgeldSplit.papa)}</span>
      </div>
    </div>
  `;
}

function renderSpeedRings() {
  const todayDate = new Date();
  const elapsedRatio = todayDate.getDate() / new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const categories = ["kleding", "zakgeld"];

  speedRingsEl.innerHTML = categories
    .map((category) => {
      const usage = getCurrentMonthUsage(category);
      const speedRatio = elapsedRatio > 0 ? usage.usedRatio / elapsedRatio : 0;
      const fill = `${Math.min(speedRatio * 100, 100).toFixed(0)}%`;
      const mood = getSpeedMood(speedRatio);
      const paceText = mood === "slow" ? "rustig" : mood === "fast" ? "snel" : "on track";
      const color = mood === "slow" ? "#66bf94" : mood === "fast" ? "#ef7f9f" : "#f0a253";

      return `
        <div class="speed-ring-card">
          <div class="speed-ring" style="--fill:${fill}; --ring-color:${color};"></div>
          <div class="speed-ring-value">${Math.round(usage.usedRatio * 100)}%</div>
          <div class="speed-ring-label">${humanCategory(category)}</div>
          <div class="speed-ring-meta">Tempo: ${paceText}</div>
        </div>
      `;
    })
    .join("");
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
    item.className = `coach-item ${alert.toneClass} ${alert.showCoachTag === false ? "no-coach-tag" : ""}`;
    const coachText = alert.showCoachTag === false ? alert.text : personalizeAutomaticCoachText(alert.text);
    item.innerHTML = `
      <p class="coach-title">${alert.title}</p>
      <p class="coach-text">${coachText}</p>
    `;
    coachAlertsEl.appendChild(item);
  });
}

function buildAutomaticCoachAlerts() {
  const todayDate = new Date();
  const dayOfMonth = todayDate.getDate();
  const daysInMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const categories = ["kleding", "zakgeld"];
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
  const monthBudget =
    getBudgetAmountForMonth(currentMonth, category, "mama") +
    getBudgetAmountForMonth(currentMonth, category, "papa");

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
    ...list[idx],
  };
}

function buildParentMessageAlerts() {
  const messages = state.coachSettings.parentMessages ?? {};
  const alerts = [];
  if (messages.mama?.text) {
    alerts.push({
      toneClass: "coach-soft",
      title: "💌 Bericht van mama",
      text: escapeHtml(messages.mama.text),
      showCoachTag: false,
    });
  }
  if (messages.papa?.text) {
    alerts.push({
      toneClass: "coach-soft",
      title: "💌 Bericht van papa",
      text: escapeHtml(messages.papa.text),
      showCoachTag: false,
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
  const kleding = getCurrentMonthUsage("kleding");
  const zakgeld = getCurrentMonthUsage("zakgeld");
  const autoCoachText = state.coachSettings.autoCoachEnabled ? "Aan" : "Uit";
  const sensitivity = state.coachSettings.sensitivity ?? "normal";
  const sensitivityText = sensitivity === "calm" ? "Rustig" : sensitivity === "strict" ? "Streng" : "Normaal";
  const parentMessages = state.coachSettings.parentMessages ?? {};
  const mamaUntil = formatMessageExpiry(parentMessages.mama?.expiresAt);
  const papaUntil = formatMessageExpiry(parentMessages.papa?.expiresAt);

  parentCoachSummaryEl.innerHTML = `
    <div class="coach-summary-row coach-summary-shared">ℹ️ Gedeeld: automatische coach en gevoeligheid gelden voor mama + papa samen.</div>
    <div class="coach-summary-row">👗 Kleding: ${Math.round(kleding.usedRatio * 100)}% gebruikt (${currency.format(kleding.usedFromMonthBudget)} / ${currency.format(kleding.monthBudget)})</div>
    <div class="coach-summary-row">💜 Zakgeld: ${Math.round(zakgeld.usedRatio * 100)}% gebruikt (${currency.format(zakgeld.usedFromMonthBudget)} / ${currency.format(zakgeld.monthBudget)})</div>
    <div class="coach-summary-row">🔔 Automatische coach (gedeeld): ${autoCoachText}</div>
    <div class="coach-summary-row">🎚️ Gevoeligheid (gedeeld): ${sensitivityText}</div>
    <div class="coach-summary-row">💌 Mama-boodschap: ${mamaUntil}</div>
    <div class="coach-summary-row">💌 Papa-boodschap: ${papaUntil}</div>
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
  ["mama", "papa"].forEach((parent) => {
    const entry = state.coachSettings.parentMessages?.[parent];
    if (!entry?.text || !entry?.expiresAt) {
      return;
    }
    if (new Date(entry.expiresAt).getTime() < nowMs) {
      state.coachSettings.parentMessages[parent] = { text: "", expiresAt: null };
      changed = true;
    }
  });
  if (changed) {
    saveState();
  }
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
  const kleding = getCategorySnapshot("kleding", categoryData);
  const zakgeld = getCategorySnapshot("zakgeld", categoryData);
  const kledingSplit = getParentRemainingSplit("kleding", currentMonth);
  const zakgeldSplit = getParentRemainingSplit("zakgeld", currentMonth);

  clearOverviewEl.innerHTML = `
    <div class="overview-matrix">
      <div class="overview-matrix-head empty"></div>
      <div class="overview-matrix-head kleding">👗 Kleding</div>
      <div class="overview-matrix-head zakgeld">💜 Zakgeld</div>

      <div class="overview-matrix-label">Nieuw</div>
      <div class="overview-matrix-value kleding">${currency.format(kleding.monthBudget)}</div>
      <div class="overview-matrix-value zakgeld">${currency.format(zakgeld.monthBudget)}</div>

      <div class="overview-matrix-label">Over van vorige maanden</div>
      <div class="overview-matrix-value ${kleding.rolloverFromPrev >= 0 ? "positive" : "negative"}">${currency.format(kleding.rolloverFromPrev)}</div>
      <div class="overview-matrix-value ${zakgeld.rolloverFromPrev >= 0 ? "positive" : "negative"}">${currency.format(zakgeld.rolloverFromPrev)}</div>

      <div class="overview-matrix-label total">Beschikbaar</div>
      <div class="overview-matrix-value kleding total">
        ${currency.format(kleding.availableNow)}
        <div class="overview-split-mini">
          <span class="parent-mini-pill mama">mama ${currency.format(kledingSplit.mama)}</span>
          <span class="parent-mini-pill papa">papa ${currency.format(kledingSplit.papa)}</span>
        </div>
      </div>
      <div class="overview-matrix-value zakgeld total">
        ${currency.format(zakgeld.availableNow)}
        <div class="overview-split-mini">
          <span class="parent-mini-pill mama">mama ${currency.format(zakgeldSplit.mama)}</span>
          <span class="parent-mini-pill papa">papa ${currency.format(zakgeldSplit.papa)}</span>
        </div>
      </div>
    </div>
  `;
}

function getCategorySnapshot(category, categoryData) {
  const monthBudget =
    getBudgetAmountForMonth(currentMonth, category, "mama") +
    getBudgetAmountForMonth(currentMonth, category, "papa");

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
    const mamaBudget = getBudgetAmountForMonth(month, category, "mama");
    const papaBudget = getBudgetAmountForMonth(month, category, "papa");
    if (Math.abs(mamaBudget) > 0.004) {
      addOwnedBucket(buckets, month, "mama", mamaBudget);
    }
    if (Math.abs(papaBudget) > 0.004) {
      addOwnedBucket(buckets, month, "papa", papaBudget);
    }

    const txs = state.transactions
      .filter((tx) => tx.month === month && tx.category === category && !excludedTxIds.has(tx.id))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    txs.forEach((tx) => {
      const owner = tx.createdBy === "papa" ? "papa" : "mama";
      if (tx.amount >= 0) {
        addOwnedBucket(buckets, tx.month, owner, tx.amount);
        pruneZeroBuckets(buckets);
        return;
      }

      let toSpend = Math.abs(tx.amount);
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

      const usageEntries = Array.isArray(tx.budgetUsage)
        ? tx.budgetUsage
        : tx.borrowAmount > 0 && (tx.borrowFromParent === "mama" || tx.borrowFromParent === "papa")
          ? [{ fromParent: tx.borrowFromParent, fromCategory: category, amount: tx.borrowAmount }]
          : [];

      usageEntries
        .filter((entry) => entry.fromCategory === category && entry.fromParent !== owner)
        .forEach((entry) => {
          if (toSpend <= 0) {
            return;
          }
          let requested = Math.min(toSpend, Number(entry.amount) || 0);
          const otherPositiveBuckets = buckets
            .filter((bucket) => bucket.owner === entry.fromParent && bucket.amount > 0)
            .sort((a, b) => a.sourceMonth.localeCompare(b.sourceMonth));

          otherPositiveBuckets.forEach((bucket) => {
            if (requested <= 0) {
              return;
            }
            const used = Math.min(bucket.amount, requested);
            bucket.amount -= used;
            requested -= used;
          });
          toSpend -= Math.min(toSpend, (Number(entry.amount) || 0) - requested);
        });

      if (toSpend > 0) {
        addOwnedBucket(buckets, month, owner, -toSpend);
      }
      pruneZeroBuckets(buckets);
    });
  });

  return {
    mama: sum(buckets.filter((bucket) => bucket.owner === "mama").map((bucket) => bucket.amount)),
    papa: sum(buckets.filter((bucket) => bucket.owner === "papa").map((bucket) => bucket.amount)),
  };
}

async function resolveBudgetUsageDecision({
  category,
  month,
  requestedAmount,
  actingParent,
  excludeTxId,
  excludeLinkedTransferIds = [],
}) {
  if (actingParent !== "mama" && actingParent !== "papa") {
    return { usage: [], cancelledByUser: false };
  }
  const otherParent = actingParent === "mama" ? "papa" : "mama";
  const otherCategory = category === "kleding" ? "zakgeld" : "kleding";
  const excludeTxIds = [excludeTxId, ...excludeLinkedTransferIds].filter(Boolean);

  const sameCategorySplit = getParentRemainingSplit(category, month, { excludeTxIds });
  let remaining = requestedAmount;
  const ownSameCategory = Math.max(0, sameCategorySplit[actingParent] ?? 0);
  remaining = Math.max(0, remaining - ownSameCategory);
  const usage = [];

  while (remaining > 0) {
    const ownPhase = remaining > 0;
    const ownCandidates = [{ fromParent: actingParent, fromCategory: otherCategory }];
    const otherParentCandidates = [
      { fromParent: otherParent, fromCategory: category },
      { fromParent: otherParent, fromCategory: otherCategory },
    ];

    const ownCandidateAvailability = ownCandidates.map((candidate) => {
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

    const shouldStayInOwnParent = ownPhase && ownCandidateAvailability.some((entry) => entry.selectable);
    const phaseCandidates = shouldStayInOwnParent ? ownCandidates : otherParentCandidates;

    const options = phaseCandidates
      .map((candidate) => {
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

async function chooseBudgetSourceOption({ actingParent, category, remaining, options }) {
  if (!budgetSourceDialog || !budgetSourceMessageEl || !budgetSourceOptionsEl) {
    return options[0] ?? null;
  }
  const selectable = options.filter((option) => option.selectable);
  const recommended = [...selectable].sort((a, b) => b.available - a.available)[0] ?? selectable[0] ?? options[0];
  budgetSourceChoiceState.options = options.map((option, index) => ({
    ...option,
    id: `${option.fromParent}-${option.fromCategory}-${index}`,
  }));
  budgetSourceChoiceState.recommendedId = `${recommended.fromParent}-${recommended.fromCategory}-${options.indexOf(recommended)}`;
  budgetSourceChoiceState.selectedId = budgetSourceChoiceState.recommendedId;

  budgetSourceMessageEl.textContent =
    `Tekort op ${actingParent} ${humanCategory(category).toLowerCase()}: ${currency.format(remaining)}.`;
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
      return `
        <button type="button" class="budget-source-option ${isActive ? "active" : ""} ${option.selectable ? "" : "disabled"}" data-option-id="${option.id}">
          <span>${option.fromParent} ${cat}</span>
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
  const kledingSplit = getParentRemainingSplit("kleding", currentMonth);
  const zakgeldSplit = getParentRemainingSplit("zakgeld", currentMonth);
  const transferStats = getCrossParentTransferStats(currentMonth);
  const integrity = checkCalculationIntegrity(categoryData);

  const renderParentCard = (parentKey, emoji) => {
    const label = parentKey === "mama" ? "Mama" : "Papa";
    const kleding = kledingSplit[parentKey] ?? 0;
    const zakgeld = zakgeldSplit[parentKey] ?? 0;
    const totaal = kleding + zakgeld;
    const stats = transferStats[parentKey];
    return `
      <article class="parent-mini-card ${parentKey}">
        <h4>${emoji} ${label}</h4>
        <div class="parent-mini-grid">
          <div><span>Kleding</span><strong class="${kleding >= 0 ? "positive" : "negative"}">${currency.format(kleding)}</strong></div>
          <div><span>Zakgeld</span><strong class="${zakgeld >= 0 ? "positive" : "negative"}">${currency.format(zakgeld)}</strong></div>
          <div class="wide"><span>Totaal</span><strong class="${totaal >= 0 ? "positive" : "negative"}">${currency.format(totaal)}</strong></div>
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
  const kledingTotal = categoryData.find((entry) => entry.category === "kleding")?.totalRemaining ?? 0;
  const zakgeldTotal = categoryData.find((entry) => entry.category === "zakgeld")?.totalRemaining ?? 0;
  const kledingSplit = getParentRemainingSplit("kleding", currentMonth);
  const zakgeldSplit = getParentRemainingSplit("zakgeld", currentMonth);

  const checks = [
    {
      label: "kleding",
      diff: Math.abs(kledingTotal - (kledingSplit.mama + kledingSplit.papa)),
    },
    {
      label: "zakgeld",
      diff: Math.abs(zakgeldTotal - (zakgeldSplit.mama + zakgeldSplit.papa)),
    },
    {
      label: "totaal",
      diff: Math.abs(
        kledingTotal + zakgeldTotal - (kledingSplit.mama + kledingSplit.papa + zakgeldSplit.mama + zakgeldSplit.papa)
      ),
    },
  ];

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
      const emoji = tx.category === "zakgeld" ? "💜" : "👗";
      const dateLabel = formatDate(tx.date);
      const parentName = tx.createdBy === "mama" ? "mama" : tx.createdBy === "papa" ? "papa" : "ouder";
      const usageEntries = Array.isArray(tx.budgetUsage)
        ? tx.budgetUsage.filter((entry) => Number(entry.amount) > 0)
        : tx.amount < 0 && tx.borrowAmount > 0 && (tx.borrowFromParent === "mama" || tx.borrowFromParent === "papa")
          ? [{ fromParent: tx.borrowFromParent, fromCategory: tx.category, amount: tx.borrowAmount }]
          : [];
      const usagePills = usageEntries
        .map((entry) => {
          const cat = entry.fromCategory === "kleding" ? "kleding" : "zakgeld";
          const crossParentNote =
            (tx.createdBy === "mama" || tx.createdBy === "papa") && entry.fromParent !== tx.createdBy
              ? ` (bij ${tx.createdBy} transactie)`
              : "";
          return `<span class="tx-usage-pill">${currency.format(entry.amount)} van ${entry.fromParent} ${humanCategory(cat).toLowerCase()}${crossParentNote}</span>`;
        })
        .join("");
      return `
        <div class="tx-item">
          <div class="tx-icon tx-icon-${tx.category}">${emoji}</div>
          <div class="tx-body">
            <strong>${humanCategory(tx.category)}${includeParentName ? ` · ${parentName}` : ""}</strong>
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
    txCategoryInput.value = tx.category;
    const editMode = tx.amount < 0 ? "expense" : "topup";
    setTransactionMode(editMode);
    txTopupArmed = editMode === "topup";
    txAmountInput.value = String(Math.abs(tx.amount));
    txNoteInput.value = tx.note ?? "";
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
    state.transactions.push({
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
    });
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
  txCategoryInput.value = "zakgeld";
  setTransactionMode("expense");
  txTopupArmed = false;
  txAmountInput.value = "";
  txNoteInput.value = "";
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
    txCategoryInput.value = "kleding";
    setTransactionMode("expense");
    txAmountInput.focus();
    return;
  }
  if (preset === "zakgeld-expense") {
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
    const fromCategory = entry.fromCategory === "kleding" ? "kleding" : "zakgeld";
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

function simulateCategory(category, upToMonth) {
  const months = getMonthRange(upToMonth);
  const buckets = [];
  const timeline = [];

  months.forEach((month) => {
    const contribution =
      getBudgetAmountForMonth(month, category, "mama") +
      getBudgetAmountForMonth(month, category, "papa");
    if (Math.abs(contribution) > 0.004) {
      addToBucket(buckets, month, contribution);
    }

    const txs = state.transactions
      .filter((tx) => tx.month === month && tx.category === category)
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    txs.forEach((tx) => {
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
          addToBucket(buckets, month, -toSpend);
        }
      }
      pruneZeroBuckets(buckets);
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
  return month >= startMonth ? recurringAmount : 0;
}

function pruneZeroBuckets(buckets) {
  for (let i = buckets.length - 1; i >= 0; i -= 1) {
    if (Math.abs(buckets[i].amount) <= 0.004) {
      buckets.splice(i, 1);
    }
  }
}

// State persistence and migrations
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultState);
    }
    const parsed = JSON.parse(raw);
    const base = structuredClone(defaultState);

    if (parsed.pin && !parsed.pins) {
      base.pins = { mama: parsed.pin, papa: parsed.pin };
    }

    return {
      ...base,
      ...parsed,
      pins: { ...base.pins, ...(parsed.pins ?? {}) },
      recurringBudgets: {
        ...base.recurringBudgets,
        ...(parsed.recurringBudgets ?? {}),
        mama: { ...base.recurringBudgets.mama, ...(parsed.recurringBudgets?.mama ?? {}) },
        papa: { ...base.recurringBudgets.papa, ...(parsed.recurringBudgets?.papa ?? {}) },
      },
      recurringStartMonth: {
        ...base.recurringStartMonth,
        ...(parsed.recurringStartMonth ?? {}),
        mama: { ...base.recurringStartMonth.mama, ...(parsed.recurringStartMonth?.mama ?? {}) },
        papa: { ...base.recurringStartMonth.papa, ...(parsed.recurringStartMonth?.papa ?? {}) },
      },
      coachSettings: {
        ...base.coachSettings,
        ...(parsed.coachSettings ?? {}),
        autoCoachEnabled: parsed.coachSettings?.autoCoachEnabled ?? base.coachSettings.autoCoachEnabled,
        parentMessages: {
          ...base.coachSettings.parentMessages,
          ...(parsed.coachSettings?.parentMessages ?? {}),
          mama: {
            ...base.coachSettings.parentMessages.mama,
            ...(parsed.coachSettings?.parentMessages?.mama ?? {}),
            text:
              typeof parsed.coachSettings?.parentMessages?.mama === "string"
                ? parsed.coachSettings.parentMessages.mama
                : parsed.coachSettings?.parentMessages?.mama?.text ??
                  base.coachSettings.parentMessages.mama.text,
            expiresAt:
              typeof parsed.coachSettings?.parentMessages?.mama === "string"
                ? null
                : parsed.coachSettings?.parentMessages?.mama?.expiresAt ??
                  base.coachSettings.parentMessages.mama.expiresAt,
          },
          papa: {
            ...base.coachSettings.parentMessages.papa,
            ...(parsed.coachSettings?.parentMessages?.papa ?? {}),
            text:
              typeof parsed.coachSettings?.parentMessages?.papa === "string"
                ? parsed.coachSettings.parentMessages.papa
                : parsed.coachSettings?.parentMessages?.papa?.text ??
                  base.coachSettings.parentMessages.papa.text,
            expiresAt:
              typeof parsed.coachSettings?.parentMessages?.papa === "string"
                ? null
                : parsed.coachSettings?.parentMessages?.papa?.expiresAt ??
                  base.coachSettings.parentMessages.papa.expiresAt,
          },
        },
      },
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = structuredClone(defaultState);
  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  Object.assign(state, fresh);
  session.loggedInParent = null;
  setParentPanelOpen(false);
  if (parentDialog.open) {
    parentDialog.close();
  }
  renderLoggedInParent();
  setParentMessageStatus("Alles gewist. Je start nu volledig opnieuw.", true);
  render();
}

// Generic formatting/math utilities
function humanCategory(category) {
  return category === "zakgeld" ? "Zakgeld" : "Kledingsbudget";
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
