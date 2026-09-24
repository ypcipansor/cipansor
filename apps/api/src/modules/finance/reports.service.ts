import { prisma } from '../../lib/prisma';
import { getTrialBalance } from './accounting.service';

type TrialBalanceRow = Awaited<ReturnType<typeof getTrialBalance>>[number];

const sumBalance = (list: TrialBalanceRow[]) =>
  list.reduce(
    (sum, i) => sum + (i.normalBalance === 'CREDIT' ? i.credit - i.debit : i.debit - i.credit),
    0
  );

/**
 * ISAK 35 — Laporan Aktivitas (Statement of Activities).
 * Revenues/expenses split into "tanpa pembatasan" (unrestricted) and
 * "dengan pembatasan" (restricted) based on AccountCode.netAssetCategory,
 * plus the resulting change in net assets and beginning/ending balances.
 */
export async function getStatementOfActivities(query: {
  unitId?: string;
  startDate: Date;
  endDate: Date;
}) {
  const trialBalance = await getTrialBalance(query);

  const revenues = trialBalance.filter((i) => i.type === 'REVENUE');
  const expenses = trialBalance.filter((i) => i.type === 'EXPENSE');

  const accounts = await prisma.accountCode.findMany({
    where: { id: { in: trialBalance.map((i) => i.accountId) } },
    select: { id: true, netAssetCategory: true },
  });
  const categoryById = new Map(accounts.map((a) => [a.id, a.netAssetCategory ?? 'UNRESTRICTED']));

  const splitByRestriction = (items: TrialBalanceRow[]) => {
    const unrestricted = items.filter((i) => categoryById.get(i.accountId) === 'UNRESTRICTED');
    const restricted = items.filter((i) => categoryById.get(i.accountId) !== 'UNRESTRICTED');
    return {
      unrestricted: { items: unrestricted, total: sumBalance(unrestricted) },
      restricted: { items: restricted, total: sumBalance(restricted) },
      total: sumBalance(items),
    };
  };

  const revenueSplit = splitByRestriction(revenues);
  const expenseSplit = splitByRestriction(expenses);

  const changeInNetAssets = {
    unrestricted: revenueSplit.unrestricted.total - expenseSplit.unrestricted.total,
    restricted: revenueSplit.restricted.total - expenseSplit.restricted.total,
    total: revenueSplit.total - expenseSplit.total,
  };

  // Beginning net assets: cumulative surplus/deficit plus direct equity
  // postings before the period start. Simplification: no closing entries
  // are posted in this system, so revenue/expense history IS the
  // accumulated surplus.
  const beginningBalances = await prisma.journalEntry.aggregate({
    where: {
      ...(query.unitId && { unitId: query.unitId }),
      date: { lt: query.startDate },
      account: { type: { in: ['REVENUE', 'EXPENSE', 'EQUITY'] } },
    },
    _sum: { debit: true, credit: true },
  });

  const beginning =
    (beginningBalances._sum.credit?.toNumber() || 0) -
    (beginningBalances._sum.debit?.toNumber() || 0);

  return {
    revenues: revenueSplit,
    expenses: expenseSplit,
    changeInNetAssets,
    netAssets: {
      beginning,
      ending: beginning + changeInNetAssets.total,
    },
  };
}

/**
 * PSAK 109 — Laporan Sumber dan Penyaluran Dana ZISWAF.
 * Accounts are tagged with AccountCode.ziswafFundType; receipts come from
 * REVENUE-type accounts, distributions from EXPENSE-type accounts.
 */
export async function getZiswafReport(query: { unitId?: string; startDate: Date; endDate: Date }) {
  const trialBalance = await getTrialBalance(query);

  const accounts = await prisma.accountCode.findMany({
    where: {
      id: { in: trialBalance.map((i) => i.accountId) },
      ziswafFundType: { not: null },
    },
    select: { id: true, ziswafFundType: true },
  });
  const fundTypeById = new Map(accounts.map((a) => [a.id, a.ziswafFundType]));

  const fundTypes = ['ZAKAT', 'INFAK_SEDEKAH', 'WAKAF', 'AMIL', 'NON_HALAL'] as const;

  return fundTypes.map((type) => {
    const fundEntries = trialBalance.filter((i) => fundTypeById.get(i.accountId) === type);

    const receipts = fundEntries.filter((i) => i.type === 'REVENUE');
    const distributions = fundEntries.filter((i) => i.type === 'EXPENSE');

    const totalReceipts = receipts.reduce((sum, i) => sum + (i.credit - i.debit), 0);
    const totalDistributions = distributions.reduce((sum, i) => sum + (i.debit - i.credit), 0);

    return {
      type,
      receipts: totalReceipts,
      distributions: totalDistributions,
      netChange: totalReceipts - totalDistributions,
    };
  });
}

/**
 * Laporan Perbandingan Anggaran (Budget vs Actual) per account.
 */
export async function getBudgetVsActualReport(query: { unitId: string; academicYearId: string }) {
  const budgets = await prisma.budget.findMany({
    where: {
      unitId: query.unitId,
      academicYearId: query.academicYearId,
    },
    include: { account: true },
  });

  const trialBalance = await getTrialBalance({ unitId: query.unitId });

  return budgets.map((b) => {
    const actual = trialBalance.find((i) => i.accountId === b.accountId);
    const actualAmount = actual
      ? actual.normalBalance === 'DEBIT'
        ? actual.debit - actual.credit
        : actual.credit - actual.debit
      : 0;
    const budgetAmount = b.amount.toNumber();

    return {
      accountCode: b.account.code,
      accountName: b.account.name,
      budget: budgetAmount,
      actual: actualAmount,
      variance: budgetAmount - actualAmount,
      percentage: budgetAmount > 0 ? (actualAmount / budgetAmount) * 100 : 0,
    };
  });
}

/**
 * Catatan Atas Laporan Keuangan (CALK): manual section notes plus the
 * unit-specific (or default) narrative template.
 */
export async function getCalkData(query: { unitId: string; periodId?: string }) {
  const [notes, template] = await Promise.all([
    prisma.reportNote.findMany({
      where: {
        unitId: query.unitId,
        periodId: query.periodId ?? null,
        reportType: 'CALK',
      },
      orderBy: { sectionKey: 'asc' },
    }),
    prisma.reportTemplate.findFirst({
      where: {
        OR: [{ unitId: query.unitId }, { isDefault: true }],
        type: 'CALK',
      },
      // Unit-specific template takes precedence over the default.
      orderBy: { unitId: { sort: 'desc', nulls: 'last' } },
    }),
  ]);

  return {
    template: template?.content || '',
    manualNotes: notes,
  };
}

/**
 * Create or update a CALK section note. Not a Prisma upsert: the
 * composite unique key contains the nullable periodId, and NULL never
 * equals NULL in Postgres, so upsert would insert duplicates for
 * period-less notes.
 */
export async function saveReportNote(data: {
  unitId: string;
  periodId?: string;
  reportType: string;
  sectionKey: string;
  content: string;
}) {
  const existing = await prisma.reportNote.findFirst({
    where: {
      unitId: data.unitId,
      periodId: data.periodId ?? null,
      reportType: data.reportType,
      sectionKey: data.sectionKey,
    },
  });

  if (existing) {
    return prisma.reportNote.update({
      where: { id: existing.id },
      data: { content: data.content },
    });
  }

  return prisma.reportNote.create({
    data: {
      unitId: data.unitId,
      periodId: data.periodId ?? null,
      reportType: data.reportType,
      sectionKey: data.sectionKey,
      content: data.content,
    },
  });
}
