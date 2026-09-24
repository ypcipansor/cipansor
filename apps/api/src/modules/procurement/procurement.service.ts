import { prisma } from '@/lib/prisma';
import {
  CreatePurchaseRequestInput,
  UpdatePurchaseRequestStatusInput,
  PurchaseRequestStatus,
  PurchaseRequest,
  FulfillPurchaseRequestInput,
} from '@cipansor/shared';
import { UserRole, AssetCondition, Prisma } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { generateUniqueCode, generateBulkUniqueCodes } from '@/utils/code-generator';
import { createNotification } from '../notifications/notifications.service';
import { getAccountOrFallback } from '../finance/accounting-config.service';

export const procurementService = {
  // Create a new purchase request
  create: async (input: CreatePurchaseRequestInput, userId: string): Promise<PurchaseRequest> => {
    // 1. Budget Availability Check
    const budgetRequests = new Map<string, number>();

    for (const item of input.items) {
      if (item.budgetId) {
        const currentAmount = budgetRequests.get(item.budgetId) || 0;
        budgetRequests.set(item.budgetId, currentAmount + item.quantity * item.estimatedPrice);
      }
    }

    if (budgetRequests.size > 0) {
      const budgetIds = Array.from(budgetRequests.keys());
      const budgets = await prisma.budget.findMany({
        where: { id: { in: budgetIds } },
      });

      for (const budget of budgets) {
        const requestedAmount = budgetRequests.get(budget.id) || 0;
        const availableAmount = Number(budget.amount) - Number(budget.usedAmount);

        if (requestedAmount > availableAmount) {
          throw Errors.validationError([
            {
              field: 'items',
              message: `Budget exceeded for budget ID ${budget.id}. Available: ${availableAmount}, Requested: ${requestedAmount}`,
            },
          ]);
        }
      }
    }

    // Generate code: PR-YYYYMM-XXXX
    const code = await generateUniqueCode('PR', 'purchase_requests');

    const totalEstimated = input.items.reduce(
      (sum, item) => sum + item.quantity * item.estimatedPrice,
      0
    );

    const request = await prisma.purchaseRequest.create({
      data: {
        unitId: input.unitId,
        code,
        requesterId: userId,
        date: new Date(input.date),
        description: input.description,
        totalEstimated,
        status: PurchaseRequestStatus.PENDING,
        items: {
          create: input.items.map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
            estimatedPrice: item.estimatedPrice,
            totalPrice: item.quantity * item.estimatedPrice,
            assetCategoryId: item.assetCategoryId,
            budgetId: item.budgetId,
          })),
        },
      },
      include: {
        unit: true,
        requester: true,
        items: {
          include: {
            assetCategory: true,
            budget: {
              include: {
                account: true,
              },
            },
          },
        },
      },
    });

    // Audit Log: Create
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PROCUREMENT_CREATE',
        entity: 'PURCHASE_REQUEST',
        entityId: request.id,
        newValues: request as any,
      },
    });

    return request as unknown as PurchaseRequest;
  },

  // Find all requests
  findAll: async (
    unitId?: string,
    status?: PurchaseRequestStatus,
    userId?: string,
    role?: string
  ) => {
    const where: Prisma.PurchaseRequestWhereInput = {};
    if (unitId) where.unitId = unitId;
    if (status) where.status = status;

    const adminRoles: string[] = [UserRole.SUPER_ADMIN, UserRole.UNIT_ADMIN];
    const isAdmin = role && adminRoles.includes(role);

    if (!isAdmin) {
      where.requesterId = userId;
    }

    const requests = await prisma.purchaseRequest.findMany({
      where,
      include: {
        unit: true,
        requester: true,
        items: true,
        approvedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests as unknown as PurchaseRequest[];
  },

  // Find single request
  findById: async (id: string) => {
    const request = await prisma.purchaseRequest.findUnique({
      where: { id },
      include: {
        unit: true,
        requester: true,
        approvedBy: true,
        items: {
          include: {
            assetCategory: true,
            budget: {
              include: {
                account: true,
              },
            },
          },
        },
      },
    });

    if (!request) throw Errors.notFound('Purchase Request');
    return request as unknown as PurchaseRequest;
  },

  // Get Audit Logs for a Request
  getAuditLogs: async (id: string) => {
    return prisma.auditLog.findMany({
      where: {
        entity: 'PURCHASE_REQUEST',
        entityId: id,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  // Update status (Approve/Reject)
  updateStatus: async (
    id: string,
    input: UpdatePurchaseRequestStatusInput,
    approverId: string,
    approverRole: string
  ) => {
    const request = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!request) throw Errors.notFound('Purchase Request');

    if (
      request.status !== PurchaseRequestStatus.PENDING &&
      request.status !== PurchaseRequestStatus.APPROVED
    ) {
      throw Errors.badRequest('Cannot update status of processed request');
    }

    // Tiered Approval Logic
    if (input.status === PurchaseRequestStatus.APPROVED) {
      const HIGH_VALUE_THRESHOLD = 10000000; // 10 Million
      const isHighValue = Number(request.totalEstimated) > HIGH_VALUE_THRESHOLD;
      const isSuperAdmin = approverRole === UserRole.SUPER_ADMIN;

      if (isHighValue && !isSuperAdmin) {
        throw Errors.forbidden(
          `Requests above ${HIGH_VALUE_THRESHOLD} require Foundation/Yayasan approval.`
        );
      }
    }

    const data: any = { status: input.status };

    if (input.status === PurchaseRequestStatus.APPROVED) {
      data.approvedById = approverId;
      data.approvedAt = new Date();
    } else if (input.status === PurchaseRequestStatus.REJECTED) {
      data.rejectionReason = input.rejectionReason;
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id },
      data,
      include: { items: true },
    });

    // Audit Log: Status Change
    await prisma.auditLog.create({
      data: {
        userId: approverId,
        action:
          input.status === PurchaseRequestStatus.APPROVED
            ? 'PROCUREMENT_APPROVE'
            : 'PROCUREMENT_REJECT',
        entity: 'PURCHASE_REQUEST',
        entityId: id,
        oldValues: { status: request.status } as any,
        newValues: { status: input.status, rejectionReason: input.rejectionReason } as any,
      },
    });

    return updated as unknown as PurchaseRequest;
  },

  // Fulfill request
  fulfill: async (id: string, input: FulfillPurchaseRequestInput, userId: string) => {
    const request = await prisma.purchaseRequest.findUnique({
      where: { id },
      include: {
        items: { include: { assetCategory: true, budget: { include: { account: true } } } },
      },
    });

    if (!request) throw Errors.notFound('Purchase Request');
    if (
      request.status !== PurchaseRequestStatus.APPROVED &&
      request.status !== PurchaseRequestStatus.ORDERED
    ) {
      throw Errors.badRequest('Request must be Approved or Ordered to be Fulfilled');
    }

    const paymentAccount = await prisma.accountCode.findUnique({
      where: { id: input.paymentAccountId },
    });
    if (!paymentAccount) {
      throw Errors.badRequest('Invalid payment account');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Strict budget block: aggregate the fulfillment total PER BUDGET
      // (several items can share one budget) and refuse the whole
      // fulfillment when any budget's remaining amount would be exceeded.
      const totalPerBudget = new Map<string, number>();
      for (const fulfillmentItem of input.items) {
        const prItem = request.items.find((i) => i.id === fulfillmentItem.itemId);
        if (!prItem?.budgetId) continue;
        totalPerBudget.set(
          prItem.budgetId,
          (totalPerBudget.get(prItem.budgetId) ?? 0) +
            fulfillmentItem.quantityReceived * fulfillmentItem.actualPrice
        );
      }
      if (totalPerBudget.size > 0) {
        const budgets = await tx.budget.findMany({
          where: { id: { in: [...totalPerBudget.keys()] } },
        });
        for (const budget of budgets) {
          const requested = totalPerBudget.get(budget.id) ?? 0;
          const remaining = Number(budget.amount) - Number(budget.usedAmount);
          if (requested > remaining) {
            throw Errors.badRequest(
              `Anggaran terlampaui (akun ${budget.accountId}): butuh ${requested.toLocaleString(
                'id-ID'
              )}, sisa ${remaining.toLocaleString('id-ID')}. Fulfillment diblokir.`
            );
          }
        }
      }

      const updatedRequest = await tx.purchaseRequest.update({
        where: { id },
        data: {
          status: PurchaseRequestStatus.RECEIVED,
          receivedAt: new Date(input.receiptDate),
        },
      });

      for (const fulfillmentItem of input.items) {
        const prItem = request.items.find((i) => i.id === fulfillmentItem.itemId);
        if (!prItem) continue;

        const totalItemPrice = fulfillmentItem.quantityReceived * fulfillmentItem.actualPrice;

        if (prItem.assetCategoryId) {
          // Generate codes in bulk for optimization and consistency within transaction
          const assetCodes = await generateBulkUniqueCodes(
            'AST',
            'assets',
            fulfillmentItem.quantityReceived,
            tx
          );

          for (let i = 0; i < fulfillmentItem.quantityReceived; i++) {
            const assetCode = assetCodes[i];
            let condition: AssetCondition = AssetCondition.GOOD;
            if (fulfillmentItem.condition === 'FAIR') condition = AssetCondition.FAIR;
            if (fulfillmentItem.condition === 'POOR') condition = AssetCondition.POOR;

            await tx.asset.create({
              data: {
                unitId: request.unitId,
                categoryId: prItem.assetCategoryId,
                code: assetCode,
                name: `${prItem.itemName} (${i + 1})`,
                purchaseDate: new Date(input.receiptDate),
                purchasePrice: fulfillmentItem.actualPrice,
                condition: condition,
                status: 'ACTIVE',
                notes: fulfillmentItem.notes || `Generated from PR: ${request.code}`,
                purchaseOrderNo: input.purchaseOrderNo,
                supplier: input.supplier,
                supplierId: input.supplierId,
                roomId: fulfillmentItem.roomId,
              },
            });
          }
        }

        // Accounting Integration: Every purchase must be recorded in the General Ledger.
        // Best Practice: If no budget is linked, fallback to a unit-level mapped expense account.
        let debitAccountId =
          prItem.budgetId && prItem.budget?.accountId ? prItem.budget.accountId : null;

        if (prItem.budgetId) {
          await tx.budget.update({
            where: { id: prItem.budgetId },
            data: { usedAmount: { increment: totalItemPrice } },
          });
        }

        // If no budget-linked account, try to find a general procurement expense account for the unit
        if (!debitAccountId) {
          const fallbackExpense = await getAccountOrFallback(
            request.unitId,
            'PROCUREMENT_EXPENSE',
            '5109', // Default code for general expenses
            'Beban Pengadaan',
            tx
          );
          debitAccountId = fallbackExpense?.id || null;
        }

        if (debitAccountId) {
          await tx.journalEntry.create({
            data: {
              unitId: request.unitId,
              accountId: debitAccountId,
              date: new Date(input.receiptDate),
              description: `Purchase: ${prItem.itemName} (PR: ${request.code}) - Qty: ${fulfillmentItem.quantityReceived}`,
              debit: totalItemPrice,
              credit: 0,
              reference: request.code,
              referenceType: 'PURCHASE_REQUEST',
              createdById: userId,
            },
          });

          await tx.journalEntry.create({
            data: {
              unitId: request.unitId,
              accountId: paymentAccount.id,
              date: new Date(input.receiptDate),
              description: `Payment: ${prItem.itemName} (PR: ${request.code})`,
              debit: 0,
              credit: totalItemPrice,
              reference: request.code,
              referenceType: 'PURCHASE_REQUEST',
              createdById: userId,
            },
          });
        } else {
          console.warn(
            `[Procurement] No debit account found for PR Item ${prItem.id}. Journal entries skipped.`
          );
        }
      }

      // Audit Log: Fulfill
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PROCUREMENT_FULFILL',
          entity: 'PURCHASE_REQUEST',
          entityId: id,
          newValues: { status: 'RECEIVED', receivedAt: input.receiptDate } as any,
        },
      });

      return updatedRequest;
    });

    try {
      await createNotification({
        userId: request.requesterId,
        title: 'Barang Telah Diterima',
        message: `Pengajuan pembelian ${request.code} telah diproses dan barang telah diterima.`,
        type: 'INFO',
        link: `/procurement/${request.id}`,
      } as any);
    } catch (error) {
      console.error('Failed to send notification', error);
    }

    return result;
  },
};
