/**
 * Single budget calculation engine.
 * Browser: window.BudgetEngine via script tag.
 * Node tests: module.exports.
 *
 * Source of truth is the owned-bucket simulation (mama/papa or solo).
 * Totals, rollover, and parent splits are views of the same run so they
 * cannot silently diverge.
 *
 * Quirk preserved: if recurringStartMonth is missing, contribution starts
 * at ctx.currentMonth (the app wall-clock month), not the first month in range.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.BudgetEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TX_FUNDING_MODES = ["auto", "other-same", "manual"];
  const ZERO_EPS = 0.004;

  function sum(values) {
    return values.reduce((acc, value) => acc + value, 0);
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

  function normalizeTxFundingMode(value) {
    return TX_FUNDING_MODES.includes(value) ? value : "auto";
  }

  function normalizeOwnerKey(ctx, raw) {
    if (ctx.isSoloMode) {
      return ctx.soloOwner || "self";
    }
    return raw === "papa" ? "papa" : "mama";
  }

  function compareTransactions(a, b) {
    if (a?.date !== b?.date) {
      return (a?.date || "") > (b?.date || "") ? 1 : -1;
    }
    const rank = (tx) => {
      if (tx?.systemTransfer) {
        return Number(tx.amount) >= 0 ? 0 : 1;
      }
      return 2;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return String(a?.id || "").localeCompare(String(b?.id || ""));
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

  function pruneZeroBuckets(buckets) {
    for (let i = buckets.length - 1; i >= 0; i -= 1) {
      if (Math.abs(buckets[i].amount) <= ZERO_EPS) {
        buckets.splice(i, 1);
      }
    }
  }

  function getMonthRange(ctx, upToMonth) {
    const state = ctx.state || {};
    const monthsWithData = [
      ...Object.keys(state.monthlyBudgets || {}),
      ...(state.transactions || []).map((tx) => tx.month),
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

  function getRecurringIntervalFor(ctx, parent, category) {
    return clampRecurringIntervalMonths(ctx.state?.recurringIntervalMonths?.[parent]?.[category]);
  }

  function getBudgetAmountForMonth(ctx, month, category, parent) {
    const state = ctx.state || {};
    const explicit = state.monthlyBudgets?.[month]?.[category]?.[parent];
    const recurringAmount = state.recurringBudgets?.[parent]?.[category] ?? 0;
    const hasRecurring = Math.abs(recurringAmount) > ZERO_EPS;

    if (typeof explicit === "number" && Math.abs(explicit) > ZERO_EPS) {
      return explicit;
    }
    if (!hasRecurring) {
      return typeof explicit === "number" ? explicit : 0;
    }
    if (Math.abs(recurringAmount) <= ZERO_EPS) {
      return 0;
    }
    const configuredStart = state.recurringStartMonth?.[parent]?.[category];
    const startMonth = configuredStart || ctx.currentMonth;
    if (month < startMonth) {
      return 0;
    }
    const interval = getRecurringIntervalFor(ctx, parent, category);
    const diff = monthIndexFromKey(month) - monthIndexFromKey(startMonth);
    if (diff < 0 || diff % interval !== 0) {
      return 0;
    }
    return recurringAmount;
  }

  function applyOwnedExpenseToBuckets(ctx, buckets, tx, category) {
    const owner = normalizeOwnerKey(ctx, tx.createdBy);
    const usageEntries = Array.isArray(tx.budgetUsage)
      ? tx.budgetUsage
      : tx.borrowAmount > 0 &&
          (tx.borrowFromParent === "mama" ||
            tx.borrowFromParent === "papa" ||
            tx.borrowFromParent === (ctx.soloOwner || "self"))
        ? [{ fromParent: tx.borrowFromParent, fromCategory: category, amount: tx.borrowAmount }]
        : [];
    const fundingMode = normalizeTxFundingMode(tx.fundingMode);
    let toSpend = Math.abs(tx.amount);
    const usageSum = usageEntries.reduce((acc, entry) => acc + (Number(entry.amount) || 0), 0);
    const usagePlanComplete = usageEntries.length > 0 && usageSum >= toSpend - 0.02;
    const hasCrossCategoryUsage = usageEntries.some((entry) => entry.fromCategory !== category);

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

    if (usagePlanComplete || fundingMode === "other-same" || fundingMode === "manual") {
      usageEntries
        .filter((entry) => entry.fromCategory === category)
        .forEach((entry) => {
          if (toSpend <= 0) {
            return;
          }
          const fromParent = normalizeOwnerKey(ctx, entry.fromParent || owner);
          const entryAmount = Math.min(toSpend, Number(entry.amount) || 0);
          const leftover = spendFromParentBuckets(fromParent, entryAmount);
          toSpend -= entryAmount - leftover;
        });
      // Cross-category funding arrives via linked transferIn (credited to spender).
      if (toSpend > ZERO_EPS && hasCrossCategoryUsage) {
        toSpend = spendFromParentBuckets(owner, toSpend);
      }
    } else {
      toSpend = spendFromParentBuckets(owner, toSpend);

      usageEntries
        .filter((entry) => entry.fromCategory === category && normalizeOwnerKey(ctx, entry.fromParent) !== owner)
        .forEach((entry) => {
          if (toSpend <= 0) {
            return;
          }
          const entryAmount = Math.min(toSpend, Number(entry.amount) || 0);
          const leftover = spendFromParentBuckets(normalizeOwnerKey(ctx, entry.fromParent), entryAmount);
          toSpend -= entryAmount - leftover;
        });
    }

    if (toSpend > 0) {
      addOwnedBucket(buckets, tx.month, owner, -toSpend);
    }
  }

  function simulateOwnedCategory(ctx, category, upToMonth, options = {}) {
    const parents = ctx.parents || [];
    const excludedTxIds = Array.isArray(options.excludeTxIds)
      ? new Set(options.excludeTxIds.filter(Boolean))
      : new Set();
    const months = getMonthRange(ctx, upToMonth);
    const buckets = [];
    const timeline = [];

    months.forEach((month) => {
      parents.forEach((owner) => {
        const ownerBudget = getBudgetAmountForMonth(ctx, month, category, owner);
        if (Math.abs(ownerBudget) > ZERO_EPS) {
          addOwnedBucket(buckets, month, owner, ownerBudget);
        }
      });

      const txs = (ctx.state?.transactions || [])
        .filter((tx) => tx.month === month && tx.category === category && !excludedTxIds.has(tx.id))
        .sort(compareTransactions);

      txs.forEach((tx) => {
        const owner = normalizeOwnerKey(ctx, tx.createdBy);
        if (tx.amount >= 0) {
          addOwnedBucket(buckets, tx.month, owner, tx.amount);
          pruneZeroBuckets(buckets);
          return;
        }
        applyOwnedExpenseToBuckets(ctx, buckets, tx, category);
        pruneZeroBuckets(buckets);
      });

      timeline.push({
        month,
        total: sum(buckets.map((bucket) => bucket.amount)),
      });
    });

    return { buckets, timeline };
  }

  function collapseOwnedBuckets(ownedBuckets) {
    const buckets = [];
    ownedBuckets.forEach((bucket) => {
      addToBucket(buckets, bucket.sourceMonth, bucket.amount);
    });
    pruneZeroBuckets(buckets);
    return buckets;
  }

  function simulateCategory(ctx, category, upToMonth, options = {}) {
    const owned = simulateOwnedCategory(ctx, category, upToMonth, options);
    return {
      buckets: collapseOwnedBuckets(owned.buckets),
      ownedBuckets: owned.buckets,
      timeline: owned.timeline,
    };
  }

  function getParentRemainingSplit(ctx, category, upToMonth, options = {}) {
    const parents = ctx.parents || [];
    const { buckets } = simulateOwnedCategory(ctx, category, upToMonth, options);
    const split = {};
    parents.forEach((owner) => {
      split[owner] = sum(buckets.filter((bucket) => bucket.owner === owner).map((bucket) => bucket.amount));
    });
    return split;
  }

  function sumOwnerSplit(ctx, split) {
    return (ctx.parents || []).reduce((acc, owner) => acc + (split[owner] ?? 0), 0);
  }

  return {
    TX_FUNDING_MODES,
    ZERO_EPS,
    sum,
    clampRecurringIntervalMonths,
    monthIndexFromKey,
    nextMonth,
    previousMonth,
    normalizeTxFundingMode,
    normalizeOwnerKey,
    compareTransactions,
    addToBucket,
    addOwnedBucket,
    pruneZeroBuckets,
    getMonthRange,
    getRecurringIntervalFor,
    getBudgetAmountForMonth,
    simulateOwnedCategory,
    simulateCategory,
    getParentRemainingSplit,
    sumOwnerSplit,
  };
});
