const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const BudgetEngine = require("../assets/js/budget-engine.js");

function familyCtx(overrides = {}) {
  const { state, ...rest } = overrides;
  return {
    parents: ["mama", "papa"],
    soloOwner: "self",
    isSoloMode: false,
    currentMonth: "2026-08",
    ...rest,
    state: {
      monthlyBudgets: {},
      recurringBudgets: { mama: {}, papa: {} },
      recurringStartMonth: { mama: {}, papa: {} },
      recurringIntervalMonths: { mama: {}, papa: {} },
      transactions: [],
      ...state,
    },
  };
}

function soloCtx(overrides = {}) {
  const { state, ...rest } = overrides;
  return {
    parents: ["self"],
    soloOwner: "self",
    isSoloMode: true,
    currentMonth: "2026-08",
    ...rest,
    state: {
      monthlyBudgets: {},
      recurringBudgets: { self: {} },
      recurringStartMonth: { self: {} },
      recurringIntervalMonths: { self: {} },
      transactions: [],
      ...state,
    },
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

describe("family split", () => {
  it("keeps mama and papa remaining separate for the same category", () => {
    const ctx = familyCtx({
      state: {
        monthlyBudgets: {
          "2026-08": {
            zakgeld: { mama: 10, papa: 15 },
          },
        },
        transactions: [],
      },
    });
    const split = BudgetEngine.getParentRemainingSplit(ctx, "zakgeld", "2026-08");
    assert.equal(round2(split.mama), 10);
    assert.equal(round2(split.papa), 15);
    const sim = BudgetEngine.simulateCategory(ctx, "zakgeld", "2026-08");
    assert.equal(round2(BudgetEngine.sum(sim.buckets.map((b) => b.amount))), 25);
    assert.equal(round2(BudgetEngine.sumOwnerSplit(ctx, split)), 25);
  });

  it("spends an auto expense from the acting parent only", () => {
    const ctx = familyCtx({
      state: {
        monthlyBudgets: {
          "2026-08": {
            kleding: { mama: 20, papa: 20 },
          },
        },
        transactions: [
          {
            id: "tx-mama-6",
            month: "2026-08",
            date: "2026-08-10",
            category: "kleding",
            amount: -6,
            createdBy: "mama",
            fundingMode: "auto",
          },
        ],
      },
    });
    const split = BudgetEngine.getParentRemainingSplit(ctx, "kleding", "2026-08");
    assert.equal(round2(split.mama), 14);
    assert.equal(round2(split.papa), 20);
    const sim = BudgetEngine.simulateCategory(ctx, "kleding", "2026-08");
    assert.equal(round2(BudgetEngine.sum(sim.buckets.map((b) => b.amount))), 34);
  });

  it("honors other-same usage so papa pays inside the same category", () => {
    const ctx = familyCtx({
      state: {
        monthlyBudgets: {
          "2026-08": {
            kleding: { mama: 10, papa: 10 },
          },
        },
        transactions: [
          {
            id: "tx-other",
            month: "2026-08",
            date: "2026-08-12",
            category: "kleding",
            amount: -8,
            createdBy: "mama",
            fundingMode: "other-same",
            budgetUsage: [{ fromParent: "papa", fromCategory: "kleding", amount: 8 }],
          },
        ],
      },
    });
    const split = BudgetEngine.getParentRemainingSplit(ctx, "kleding", "2026-08");
    assert.equal(round2(split.mama), 10);
    assert.equal(round2(split.papa), 2);
  });
});

describe("rollover", () => {
  it("carries unused family budget into the next month", () => {
    const ctx = familyCtx({
      currentMonth: "2026-08",
      state: {
        monthlyBudgets: {
          "2026-07": { zakgeld: { mama: 10, papa: 5 } },
          "2026-08": { zakgeld: { mama: 10, papa: 5 } },
        },
        transactions: [
          {
            id: "tx-july",
            month: "2026-07",
            date: "2026-07-20",
            category: "zakgeld",
            amount: -4,
            createdBy: "mama",
            fundingMode: "auto",
          },
        ],
      },
    });
    const julySplit = BudgetEngine.getParentRemainingSplit(ctx, "zakgeld", "2026-07");
    assert.equal(round2(julySplit.mama), 6);
    assert.equal(round2(julySplit.papa), 5);

    const august = BudgetEngine.simulateCategory(ctx, "zakgeld", "2026-08");
    const augustSplit = BudgetEngine.getParentRemainingSplit(ctx, "zakgeld", "2026-08");
    assert.equal(round2(augustSplit.mama), 16);
    assert.equal(round2(augustSplit.papa), 10);
    assert.equal(round2(BudgetEngine.sum(august.buckets.map((b) => b.amount))), 26);

    const julyLeftover = august.buckets
      .filter((bucket) => bucket.sourceMonth === "2026-07")
      .reduce((acc, bucket) => acc + bucket.amount, 0);
    assert.equal(round2(julyLeftover), 11);
  });

  it("rolls recurring solo budget forward when the month range includes the start month", () => {
    const ctx = soloCtx({
      currentMonth: "2026-08",
      state: {
        // Quirk: getMonthRange starts at the earliest monthlyBudgets/tx month,
        // not recurringStartMonth. A July key is needed so July is simulated.
        monthlyBudgets: { "2026-07": {}, "2026-08": {} },
        recurringBudgets: { self: { zakgeld: 12 } },
        recurringStartMonth: { self: { zakgeld: "2026-07" } },
        recurringIntervalMonths: { self: { zakgeld: 1 } },
        transactions: [],
      },
    });
    const july = BudgetEngine.getParentRemainingSplit(ctx, "zakgeld", "2026-07");
    const august = BudgetEngine.getParentRemainingSplit(ctx, "zakgeld", "2026-08");
    assert.equal(round2(july.self), 12);
    assert.equal(round2(august.self), 24);
  });
});

describe("one engine", () => {
  it("keeps simulateCategory total equal to the parent split sum", () => {
    const ctx = familyCtx({
      currentMonth: "2026-08",
      state: {
        monthlyBudgets: {
          "2026-07": { zakgeld: { mama: 8, papa: 8 } },
          "2026-08": { zakgeld: { mama: 8, papa: 8 } },
        },
        transactions: [
          {
            id: "a",
            month: "2026-07",
            date: "2026-07-04",
            category: "zakgeld",
            amount: -3,
            createdBy: "papa",
            fundingMode: "auto",
          },
          {
            id: "b",
            month: "2026-08",
            date: "2026-08-02",
            category: "zakgeld",
            amount: 4,
            createdBy: "mama",
          },
          {
            id: "c",
            month: "2026-08",
            date: "2026-08-09",
            category: "zakgeld",
            amount: -10,
            createdBy: "mama",
            fundingMode: "other-same",
            budgetUsage: [{ fromParent: "papa", fromCategory: "zakgeld", amount: 10 }],
          },
        ],
      },
    });
    const sim = BudgetEngine.simulateCategory(ctx, "zakgeld", "2026-08");
    const split = BudgetEngine.getParentRemainingSplit(ctx, "zakgeld", "2026-08");
    const total = round2(BudgetEngine.sum(sim.buckets.map((b) => b.amount)));
    const splitSum = round2(BudgetEngine.sumOwnerSplit(ctx, split));
    assert.equal(total, splitSum);
    assert.equal(round2(split.mama), 20);
    assert.equal(round2(split.papa), 3);
  });
});
