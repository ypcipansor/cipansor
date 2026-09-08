import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import {
  ListWalletsQuery,
  TopUpWalletInput,
  DeductWalletInput,
  TransferWalletInput,
  RefundWalletInput,
  ListTransactionsQuery,
  BulkTopUpInput,
} from './wallet.schema';
import { ACCOUNT_MAPPING_KEYS, getAccountOrFallback } from '../finance/accounting-config.service';
import { JournalReferenceType } from '@cipansor/shared';

export class WalletService {
  /**
   * Get or create wallet for student
   */
  async getOrCreateWallet(studentId: string) {
    let wallet = await prisma.santriWallet.findUnique({
      where: { studentId },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            unit: { select: { id: true, name: true } },
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { class: { select: { id: true, name: true } } },
              take: 1,
            },
          },
        },
      },
    });

    if (!wallet) {
      wallet = await prisma.santriWallet.create({
        data: { studentId, balance: 0 },
        include: {
          student: {
            include: {
              user: { select: { name: true } },
              unit: { select: { id: true, name: true } },
              enrollments: {
                where: { status: 'ACTIVE' },
                include: { class: { select: { id: true, name: true } } },
                take: 1,
              },
            },
          },
        },
      });
    }

    return wallet;
  }

  /**
   * List all wallets with filters
   */
  async listWallets(query: ListWalletsQuery) {
    const { page, limit, search, unitId, classId, minBalance, maxBalance } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SantriWalletWhereInput = {};

    if (search) {
      where.student = {
        OR: [
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { nisn: { contains: search, mode: 'insensitive' } },
          { nik: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    if (unitId) {
      where.student = { ...(where.student as object), unitId };
    }

    if (classId) {
      where.student = {
        ...(where.student as object),
        enrollments: { some: { classId, status: 'ACTIVE' } },
      };
    }

    if (minBalance !== undefined || maxBalance !== undefined) {
      where.balance = {};
      if (minBalance !== undefined) where.balance.gte = minBalance;
      if (maxBalance !== undefined) where.balance.lte = maxBalance;
    }

    const [data, total] = await Promise.all([
      prisma.santriWallet.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: {
            include: {
              user: { select: { name: true } },
              unit: { select: { id: true, name: true } },
              enrollments: {
                where: { status: 'ACTIVE' },
                include: { class: { select: { id: true, name: true } } },
                take: 1,
              },
            },
          },
        },
        orderBy: { student: { user: { name: 'asc' } } },
      }),
      prisma.santriWallet.count({ where }),
    ]);

    return {
      data: data.map((w) => ({
        id: w.id,
        studentId: w.studentId,
        studentName: w.student.user.name,
        studentNisn: w.student.nisn,
        studentNik: w.student.nik,
        unitName: w.student.unit?.name,
        className: w.student.enrollments[0]?.class?.name,
        balance: Number(w.balance),
        lastTopUp: w.lastTopUp,
        createdAt: w.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get wallet by student ID
   */
  async getWalletByStudent(studentId: string) {
    return this.getOrCreateWallet(studentId);
  }

  /**
   * Top up wallet
   */
  async topUp(input: TopUpWalletInput, createdById?: string) {
    const { studentId, amount, description, paymentMethod = 'CASH' } = input;

    return prisma.$transaction(async (tx) => {
      let wallet = await tx.santriWallet.findUnique({
        where: { studentId },
        include: { student: { select: { unitId: true, user: { select: { name: true } } } } },
      });

      if (!wallet) {
        wallet = await tx.santriWallet.create({
          data: { studentId, balance: 0 },
          include: { student: { select: { unitId: true, user: { select: { name: true } } } } },
        });
      }

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + amount;

      const updatedWallet = await tx.santriWallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter,
          lastTopUp: new Date(),
        },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'TOPUP',
          amount,
          balanceBefore,
          balanceAfter,
          description: description || 'Top up saldo',
          createdById,
        },
      });

      if (wallet.student?.unitId) {
        const unitId = wallet.student.unitId;
        const studentName = wallet.student.user?.name || 'Santri';
        const isBank = ['BANK_TRANSFER', 'QRIS'].includes(paymentMethod);
        const assetMappingKey = isBank ? ACCOUNT_MAPPING_KEYS.BANK : ACCOUNT_MAPPING_KEYS.CASH;
        const assetFallbackCode = isBank ? '1102' : '1101';
        const assetFallbackName = isBank ? 'Bank' : 'Kas';

        const assetAccount = await getAccountOrFallback(
          unitId,
          assetMappingKey,
          assetFallbackCode,
          assetFallbackName
        );

        const liabilityAccount = await getAccountOrFallback(
          unitId,
          ACCOUNT_MAPPING_KEYS.WALLET_LIABILITY,
          '2102',
          'Titipan Uang Saku'
        );

        if (assetAccount && liabilityAccount) {
          const desc = `Top up e-wallet ${studentName} (${paymentMethod})`;

          await tx.journalEntry.create({
            data: {
              unitId,
              accountId: assetAccount.id,
              date: new Date(),
              description: desc,
              debit: amount,
              credit: 0,
              reference: transaction.id,
              referenceType: JournalReferenceType.PAYMENT,
              createdById: createdById || 'SYSTEM',
            },
          });

          await tx.journalEntry.create({
            data: {
              unitId,
              accountId: liabilityAccount.id,
              date: new Date(),
              description: desc,
              debit: 0,
              credit: amount,
              reference: transaction.id,
              referenceType: JournalReferenceType.PAYMENT,
              createdById: createdById || 'SYSTEM',
            },
          });
        }
      }

      return { wallet: updatedWallet, transaction };
    });
  }

  /**
   * Deduct from wallet
   */
  async deduct(input: DeductWalletInput, createdById?: string) {
    const { studentId, amount, description, referenceType, reference } = input;

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.santriWallet.findUnique({
        where: { studentId },
      });

      if (!wallet) {
        throw new Error('Wallet tidak ditemukan');
      }

      const balanceBefore = Number(wallet.balance);
      if (balanceBefore < amount) {
        throw new Error(`Saldo tidak mencukupi. Saldo: Rp ${balanceBefore.toLocaleString()}`);
      }

      const balanceAfter = balanceBefore - amount;

      const updatedWallet = await tx.santriWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'PURCHASE',
          amount,
          balanceBefore,
          balanceAfter,
          description: description || 'Pembelian',
          referenceType,
          reference,
          createdById,
        },
      });

      return { wallet: updatedWallet, transaction };
    });
  }

  /**
   * Transfer between wallets
   */
  async transfer(input: TransferWalletInput, createdById?: string) {
    const { fromStudentId, toStudentId, amount, description } = input;

    if (fromStudentId === toStudentId) {
      throw new Error('Tidak dapat transfer ke diri sendiri');
    }

    return prisma.$transaction(async (tx) => {
      const fromWallet = await tx.santriWallet.findUnique({
        where: { studentId: fromStudentId },
        include: { student: { include: { user: { select: { name: true } } } } },
      });

      if (!fromWallet) {
        throw new Error('Wallet pengirim tidak ditemukan');
      }

      const fromBalanceBefore = Number(fromWallet.balance);
      if (fromBalanceBefore < amount) {
        throw new Error(`Saldo tidak mencukupi. Saldo: Rp ${fromBalanceBefore.toLocaleString()}`);
      }

      let toWallet = await tx.santriWallet.findUnique({
        where: { studentId: toStudentId },
        include: { student: { include: { user: { select: { name: true } } } } },
      });

      if (!toWallet) {
        toWallet = await tx.santriWallet.create({
          data: { studentId: toStudentId, balance: 0 },
          include: { student: { include: { user: { select: { name: true } } } } },
        });
      }

      const toBalanceBefore = Number(toWallet.balance);
      const fromBalanceAfter = fromBalanceBefore - amount;
      const toBalanceAfter = toBalanceBefore + amount;

      await tx.santriWallet.update({
        where: { id: fromWallet.id },
        data: { balance: fromBalanceAfter },
      });

      await tx.santriWallet.update({
        where: { id: toWallet.id },
        data: { balance: toBalanceAfter },
      });

      const fromTransaction = await tx.walletTransaction.create({
        data: {
          walletId: fromWallet.id,
          type: 'TRANSFER',
          amount: -amount,
          balanceBefore: fromBalanceBefore,
          balanceAfter: fromBalanceAfter,
          description: description || `Transfer ke ${toWallet.student.user.name}`,
          referenceType: 'TRANSFER',
          reference: toWallet.id,
          createdById,
        },
      });

      const toTransaction = await tx.walletTransaction.create({
        data: {
          walletId: toWallet.id,
          type: 'TOPUP',
          amount,
          balanceBefore: toBalanceBefore,
          balanceAfter: toBalanceAfter,
          description: description || `Transfer dari ${fromWallet.student.user.name}`,
          referenceType: 'TRANSFER',
          reference: fromWallet.id,
          createdById,
        },
      });

      return { fromTransaction, toTransaction };
    });
  }

  /**
   * Refund to wallet
   */
  async refund(input: RefundWalletInput, createdById?: string) {
    const { studentId, amount, description, referenceType, reference } = input;

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.santriWallet.findUnique({
        where: { studentId },
      });

      if (!wallet) {
        throw new Error('Wallet tidak ditemukan');
      }

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + amount;

      const updatedWallet = await tx.santriWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amount,
          balanceBefore,
          balanceAfter,
          description,
          referenceType,
          reference,
          createdById,
        },
      });

      return { wallet: updatedWallet, transaction };
    });
  }

  /**
   * Bulk top up for multiple students
   */
  async bulkTopUp(input: BulkTopUpInput, createdById?: string) {
    const { studentIds, amount, description } = input;

    const results = {
      successful: [] as string[],
      failed: [] as { studentId: string; error: string }[],
    };

    for (const studentId of studentIds) {
      try {
        await this.topUp({ studentId, amount, description, paymentMethod: 'CASH' }, createdById);
        results.successful.push(studentId);
      } catch (error: any) {
        results.failed.push({ studentId, error: error.message });
      }
    }

    return results;
  }

  /**
   * List transactions
   */
  async listTransactions(query: ListTransactionsQuery) {
    const { page, limit, walletId, studentId, type, referenceType, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WalletTransactionWhereInput = {};

    if (walletId) {
      where.walletId = walletId;
    }

    if (studentId) {
      where.wallet = { studentId };
    }

    if (type) {
      where.type = type;
    }

    if (referenceType) {
      where.referenceType = referenceType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [data, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          wallet: {
            include: {
              student: {
                include: { user: { select: { name: true } } },
              },
            },
          },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    return {
      data: data.map((t) => ({
        id: t.id,
        walletId: t.walletId,
        studentName: t.wallet.student.user.name,
        type: t.type,
        amount: Number(t.amount),
        balanceBefore: Number(t.balanceBefore),
        balanceAfter: Number(t.balanceAfter),
        description: t.description,
        referenceType: t.referenceType,
        reference: t.reference,
        createdBy: t.createdBy?.name,
        createdAt: t.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get wallet summary/statistics
   */
  async getSummary(unitId?: string) {
    const walletWhere: Prisma.SantriWalletWhereInput = {};
    if (unitId) {
      walletWhere.student = { unitId };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [wallets, todayTransactions] = await Promise.all([
      prisma.santriWallet.findMany({
        where: walletWhere,
        select: { balance: true },
      }),
      prisma.walletTransaction.findMany({
        where: {
          createdAt: { gte: today },
          ...(unitId ? { wallet: { student: { unitId } } } : {}),
        },
        select: { type: true, amount: true },
      }),
    ]);

    const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);
    const averageBalance = wallets.length > 0 ? totalBalance / wallets.length : 0;
    const walletsWithLowBalance = wallets.filter((w) => Number(w.balance) < 50000).length;

    const todayTopUps = todayTransactions.filter((t) => t.type === 'TOPUP');
    const todayPurchases = todayTransactions.filter((t) => t.type === 'PURCHASE');

    return {
      totalWallets: wallets.length,
      totalBalance,
      averageBalance,
      walletsWithLowBalance,
      todayTransactions: todayTransactions.length,
      todayTopUps: todayTopUps.reduce((sum, t) => sum + Number(t.amount), 0),
      todayPurchases: todayPurchases.reduce((sum, t) => sum + Number(t.amount), 0),
    };
  }
}

export const walletService = new WalletService();
