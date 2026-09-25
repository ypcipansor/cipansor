import { prisma, type Db } from '../../lib/prisma';
import { Asset, Prisma } from '@prisma/client';

// Default Account Codes (Standard Indonesian Accounting)
const DEFAULT_ACCOUNTS = {
  FIXED_ASSET: '1200', // Aset Tetap
  ACCUM_DEPR: '1299', // Akumulasi Penyusutan
  DEPR_EXPENSE: '6200', // Beban Penyusutan
  CASH: '1101', // Kas
  BANK: '1102', // Bank
};

export async function createPurchaseJournal(asset: Asset, userId: string, tx: Db = prisma) {
  if (!asset.purchasePrice || Number(asset.purchasePrice) <= 0) return;

  const unitId = asset.unitId;
  const amount = new Prisma.Decimal(asset.purchasePrice);

  // 1. Find Debit Account (Fixed Asset)
  const assetAccount = await tx.accountCode.findFirst({
    where: {
      OR: [
        { code: DEFAULT_ACCOUNTS.FIXED_ASSET },
        { name: { contains: 'Aset Tetap', mode: 'insensitive' } },
        { name: { contains: 'Inventaris', mode: 'insensitive' } },
      ],
      isActive: true,
    },
  });

  // 2. Find Credit Account (Cash/Bank)
  const creditAccount = await tx.accountCode.findFirst({
    where: {
      OR: [{ code: DEFAULT_ACCOUNTS.CASH }, { name: { contains: 'Kas', mode: 'insensitive' } }],
      isActive: true,
    },
  });

  if (!assetAccount || !creditAccount) {
    throw new Error(`Asset Accounting: Missing accounts for Asset ${asset.code}`);
  }

  // Create Journal Entries
  // Debit Asset
  await tx.journalEntry.create({
    data: {
      unitId,
      date: asset.purchaseDate || new Date(),
      description: `Pembelian Aset: ${asset.name} (${asset.code})`,
      reference: asset.id,
      referenceType: 'ASSET_PURCHASE',
      accountId: assetAccount.id,
      debit: amount,
      credit: 0,
      createdById: userId,
    },
  });

  // Credit Cash
  await tx.journalEntry.create({
    data: {
      unitId,
      date: asset.purchaseDate || new Date(),
      description: `Kas Keluar: Pembelian Aset ${asset.code}`,
      reference: asset.id,
      referenceType: 'ASSET_PURCHASE',
      accountId: creditAccount.id,
      debit: 0,
      credit: amount,
      createdById: userId,
    },
  });
}

export async function createDepreciationJournal(
  asset: Asset,
  amount: number,
  date: Date,
  userId: string,
  tx: Db = prisma
) {
  if (amount <= 0) return;

  const unitId = asset.unitId;
  const decimalAmount = new Prisma.Decimal(amount);

  // 1. Find Expense Account
  const expenseAccount = await tx.accountCode.findFirst({
    where: {
      OR: [
        { code: DEFAULT_ACCOUNTS.DEPR_EXPENSE },
        { name: { contains: 'Beban Penyusutan', mode: 'insensitive' } },
      ],
      isActive: true,
    },
  });

  // 2. Find Accum Depr Account
  const accumAccount = await tx.accountCode.findFirst({
    where: {
      OR: [
        { code: DEFAULT_ACCOUNTS.ACCUM_DEPR },
        { name: { contains: 'Akumulasi Penyusutan', mode: 'insensitive' } },
      ],
      isActive: true,
    },
  });

  if (!expenseAccount || !accumAccount) {
    throw new Error(`Asset Accounting: Missing depreciation accounts`);
  }

  const desc = `Penyusutan Periode ${date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} - ${asset.code}`;

  // Debit Expense
  await tx.journalEntry.create({
    data: {
      unitId,
      date,
      description: desc,
      reference: asset.id,
      referenceType: 'ASSET_DEPRECIATION',
      accountId: expenseAccount.id,
      debit: decimalAmount,
      credit: 0,
      createdById: userId,
    },
  });

  // Credit Accum Depr
  await tx.journalEntry.create({
    data: {
      unitId,
      date,
      description: desc,
      reference: asset.id,
      referenceType: 'ASSET_DEPRECIATION',
      accountId: accumAccount.id,
      debit: 0,
      credit: decimalAmount,
      createdById: userId,
    },
  });
}
