import { prisma } from '../../lib/prisma';
import {
  PaymentStatus,
  PaymentMethod,
  PaymentVerificationStatus,
  Prisma,
  NotificationType,
  UserRole,
} from '@prisma/client';
import * as notificationService from '../notifications/notifications.service';
import { eventBus } from '@/lib/event-bus';
import { AccountType, JournalReferenceType } from '@cipansor/shared';
import { ACCOUNT_MAPPING_KEYS, getAccountOrFallback } from './accounting-config.service';
import {
  CreatePaymentTypeDto,
  UpdatePaymentTypeDto,
  QueryPaymentTypeDto,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  QueryInvoiceDto,
  CreatePaymentDto,
  QueryPaymentDto,
} from './finance.schema';
import { seesAllUnits } from '@/utils/resolve-unit-id';

// =====================================
// PAYMENT TYPE SERVICE
// =====================================

export async function createPaymentType(data: CreatePaymentTypeDto) {
  const { unitId, ...rest } = data;
  return prisma.paymentType.create({
    data: {
      name: rest.name,
      code: rest.code,
      description: rest.description,
      isRecurring: rest.isRecurring,
      isActive: rest.isActive,
      amount: new Prisma.Decimal(data.amount),
      unit: { connect: { id: unitId } },
      account: rest.accountId ? { connect: { id: rest.accountId } } : undefined,
    },
    include: { unit: { select: { id: true, name: true } } },
  });
}

export async function getPaymentTypes(query: QueryPaymentTypeDto) {
  const { unitId, isActive, isRecurring, search, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(unitId && { unitId }),
    ...(isActive !== undefined && { isActive }),
    ...(isRecurring !== undefined && { isRecurring }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { code: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.paymentType.findMany({
      where,
      include: { unit: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    }),
    prisma.paymentType.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPaymentTypeById(id: string) {
  return prisma.paymentType.findUnique({
    where: { id },
    include: { unit: { select: { id: true, name: true } } },
  });
}

export async function updatePaymentType(id: string, data: UpdatePaymentTypeDto) {
  const { accountId, ...restData } = data;
  return prisma.paymentType.update({
    where: { id },
    data: {
      ...restData,
      ...(restData.amount && { amount: new Prisma.Decimal(restData.amount) }),
      ...(accountId && { account: { connect: { id: accountId } } }),
    },
    include: { unit: { select: { id: true, name: true } } },
  });
}

export async function deletePaymentType(id: string) {
  return prisma.paymentType.update({
    where: { id },
    data: { isActive: false },
  });
}

// =====================================
// INVOICE SERVICE
// =====================================

async function generateInvoiceNumber(
  unitId?: string,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');

  const dbClient: any = tx || prisma;

  const lastInvoice = await dbClient.invoice.findFirst({
    where: {
      invoiceNumber: { startsWith: `INV-${year}${month}` },
    },
    orderBy: { invoiceNumber: 'desc' },
  });

  let sequence = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
    sequence = lastSeq + 1;
  }

  return `INV-${year}${month}-${String(sequence).padStart(5, '0')}`;
}

export async function createInvoice(data: CreateInvoiceDto, tx?: Prisma.TransactionClient) {
  let invoice;
  let retries = tx ? 1 : 3;
  const dbClient: any = tx || prisma;

  while (retries > 0) {
    try {
      const invoiceNumber = await generateInvoiceNumber(undefined, tx);

      const { studentId, paymentTypeId, ...invoiceData } = data;

      // Snapshot the billing unit at invoice creation so historical finance stays
      // in the unit that billed it even if the student is later re-enrolled
      // elsewhere (which would change students.unit_id).
      const invoiceStudent = await dbClient.student.findUnique({
        where: { id: studentId },
        select: { unitId: true },
      });

      let finalAmount = new Prisma.Decimal(data.amount);
      const scholarships = await dbClient.scholarshipRecipient.findMany({
        where: {
          studentId,
          status: 'ACTIVE',
          startDate: { lte: new Date() },
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
        include: {
          scholarship: {
            include: {
              discounts: true,
            },
          },
        },
      });

      for (const rec of scholarships) {
        for (const discount of rec.scholarship.discounts) {
          if (discount.componentId === paymentTypeId) {
            if (discount.discountType === 'PERCENTAGE') {
              const deduction = finalAmount.mul(discount.discountValue).div(100);
              finalAmount = finalAmount.sub(deduction);
            } else {
              finalAmount = finalAmount.sub(discount.discountValue);
            }
          }
        }
      }

      invoice = await dbClient.invoice.create({
        data: {
          ...invoiceData,
          invoiceNumber,
          amount: finalAmount.lt(0) ? 0 : finalAmount,
          dueDate: new Date(data.dueDate),
          unitId: invoiceStudent?.unitId ?? null,
          student: { connect: { id: studentId } },
          paymentType: { connect: { id: paymentTypeId } },
        },
        include: {
          student: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              unit: { select: { id: true, name: true } },
            },
          },
          paymentType: { select: { id: true, name: true, code: true } },
        },
      });
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        retries--;
        if (retries === 0) throw error;
        continue;
      }
      throw error;
    }
  }

  if (invoice && !tx) {
    try {
      const formatter = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      });

      await notificationService.createNotification({
        userId: invoice.student.user.id,
        title: 'Tagihan Baru',
        message: `Tagihan baru ${invoice.paymentType.name} sebesar ${formatter.format(
          invoice.amount.toNumber()
        )} telah dibuat. Jatuh tempo: ${new Date(invoice.dueDate).toLocaleDateString('id-ID')}`,
        type: 'PAYMENT' as any,
        link: `/finance/bills/${invoice.id}`,
        priority: 'HIGH',
        channels: ['IN_APP', 'EMAIL'],
        recipientType: 'INDIVIDUAL',
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  return invoice;
}

export async function getInvoices(query: QueryInvoiceDto) {
  const { studentId, paymentTypeId, status, startDate, endDate, overdue, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.InvoiceWhereInput = {
    ...(studentId && { studentId }),
    ...(paymentTypeId && { paymentTypeId }),
    ...(status && { status }),
    ...(startDate || endDate
      ? {
          dueDate: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }
      : {}),
  };

  if (overdue === true) {
    where.dueDate = { lt: new Date() };
    where.status = { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] };
  }

  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        paymentType: { select: { id: true, name: true, code: true } },
        _count: { select: { payments: true } },
      },
      orderBy: { dueDate: 'asc' },
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getInvoiceById(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
        },
      },
      paymentType: { select: { id: true, name: true, code: true, amount: true } },
      payments: {
        orderBy: { paidAt: 'desc' },
      },
    },
  });
}

export async function updateInvoice(id: string, data: UpdateInvoiceDto) {
  return prisma.invoice.update({
    where: { id },
    data: {
      ...data,
      ...(data.amount && { amount: new Prisma.Decimal(data.amount) }),
      ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true } },
        },
      },
      paymentType: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function deleteInvoice(id: string) {
  return prisma.invoice.update({
    where: { id },
    data: { status: PaymentStatus.CANCELLED },
  });
}

// =====================================
// PAYMENT SERVICE
// =====================================

export async function createPayment(data: CreatePaymentDto, userId: string = 'SYSTEM') {
  const payment = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: data.invoiceId },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
          },
        },
        paymentType: { select: { id: true, name: true, accountId: true } },
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const { invoiceId, ...paymentData } = data;
    const payment = await tx.payment.create({
      data: {
        method: paymentData.method,
        referenceNo: paymentData.referenceNo,
        notes: paymentData.notes,
        amount: new Prisma.Decimal(data.amount),
        invoice: { connect: { id: invoiceId } },
      },
      include: {
        invoice: {
          include: {
            student: {
              include: {
                user: { select: { id: true, name: true } },
              },
            },
            paymentType: { select: { id: true, name: true } },
          },
        },
      },
    });

    const newPaidAmount = invoice.paidAmount.add(new Prisma.Decimal(data.amount));
    let newStatus: PaymentStatus;

    if (newPaidAmount.gte(invoice.amount)) {
      newStatus = PaymentStatus.PAID;
    } else if (newPaidAmount.gt(0)) {
      newStatus = PaymentStatus.PARTIAL;
    } else {
      newStatus = PaymentStatus.PENDING;
    }

    await tx.invoice.update({
      where: { id: data.invoiceId },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus,
      },
    });

    if (invoice.paymentType.accountId && invoice.unitId) {
      const isBank = ['BANK_TRANSFER', 'VIRTUAL_ACCOUNT', 'QRIS', 'EWALLET'].includes(
        payment.method
      );
      const mappingKey = isBank ? ACCOUNT_MAPPING_KEYS.BANK : ACCOUNT_MAPPING_KEYS.CASH;
      const fallbackCode = isBank ? '1102' : '1101';
      const fallbackName = isBank ? 'Bank' : 'Kas';

      const assetAccount = await getAccountOrFallback(
        invoice.unitId,
        mappingKey,
        fallbackCode,
        fallbackName
      );

      if (assetAccount) {
        const descriptionPrefix = `Pembayaran ${invoice.invoiceNumber}`;

        await tx.journalEntry.create({
          data: {
            unitId: invoice.unitId,
            accountId: assetAccount.id,
            date: new Date(),
            description: `${descriptionPrefix} (${payment.method})`,
            debit: payment.amount,
            credit: 0,
            reference: payment.id,
            referenceType: JournalReferenceType.PAYMENT,
            createdById: userId,
          },
        });

        await tx.journalEntry.create({
          data: {
            unitId: invoice.unitId,
            accountId: invoice.paymentType.accountId,
            date: new Date(),
            description: `Pendapatan ${invoice.paymentType.name} - ${invoice.student.user.name}`,
            debit: 0,
            credit: payment.amount,
            reference: payment.id,
            referenceType: JournalReferenceType.PAYMENT,
            createdById: userId,
          },
        });
      }
    }

    return payment;
  });

  try {
    const formatter = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    });

    await notificationService.createNotification({
      userId: payment.invoice.student.user.id,
      title: 'Pembayaran Berhasil',
      message: `Pembayaran untuk tagihan ${payment.invoice.paymentType.name} sebesar ${formatter.format(
        payment.amount.toNumber()
      )} telah diterima.`,
      type: NotificationType.PAYMENT,
      link: `/finance/bills/${payment.invoice.id}`,
      priority: 'HIGH',
      channels: ['IN_APP', 'EMAIL'],
      recipientType: 'INDIVIDUAL',
    });
  } catch (error) {
    console.error('Failed to send payment notification:', error);
  }

  try {
    const studentWithUnit = await prisma.student.findUnique({
      where: { id: payment.invoice.studentId },
      include: { unit: { select: { id: true, name: true } } },
    });

    if (studentWithUnit) {
      eventBus.emit('finance:payment-received', {
        id: payment.id,
        invoiceId: payment.invoiceId,
        studentId: payment.invoice.studentId,
        studentName: payment.invoice.student.user.name,
        unitId: studentWithUnit.unitId,
        unitName: studentWithUnit.unit?.name || '',
        amount: payment.amount.toNumber(),
        paymentMethod: payment.method,
        paidAt: payment.paidAt || new Date(),
        processedById: 'SYSTEM',
      });
    }
  } catch (error) {
    console.error('Failed to emit payment event:', error);
  }

  return payment;
}

// =================================================================
// PAYMENT PROOF + TWO-STEP VERIFICATION
// =================================================================

interface VerifierContext {
  sub: string;
  role: string;
  roleCode?: string | null;
  unitId: string | null;
}

export async function submitPaymentProof(
  input: {
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    referenceNo?: string;
    proofUrl: string;
    notes?: string;
  },
  currentUser: VerifierContext
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      student: { select: { id: true, userId: true, unitId: true } },
      paymentType: { select: { name: true } },
    },
  });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === PaymentStatus.PAID || invoice.status === PaymentStatus.CANCELLED) {
    throw new Error('Invoice is not payable');
  }

  if (currentUser.role === UserRole.PARENT) {
    const link = await prisma.studentParent.findUnique({
      where: {
        studentId_parentId: { studentId: invoice.student.id, parentId: currentUser.sub },
      },
    });
    if (!link) throw new Error("Access denied: not your child's invoice");
  } else if (currentUser.role === UserRole.STUDENT) {
    if (invoice.student.userId !== currentUser.sub) {
      throw new Error('Access denied: not your invoice');
    }
  }

  const remaining = invoice.amount.sub(invoice.paidAmount);
  if (new Prisma.Decimal(input.amount).gt(remaining)) {
    throw new Error('Amount exceeds the remaining invoice balance');
  }

  const payment = await prisma.payment.create({
    data: {
      invoiceId: input.invoiceId,
      amount: new Prisma.Decimal(input.amount),
      method: input.method,
      referenceNo: input.referenceNo,
      notes: input.notes,
      proofUrl: input.proofUrl,
      verificationStatus: PaymentVerificationStatus.PENDING_VERIFICATION,
    },
  });

  try {
    await notificationService.createNotification({
      userId: currentUser.sub,
      title: 'Bukti Pembayaran Diterima',
      message: `Bukti pembayaran ${invoice.paymentType.name} sedang menunggu verifikasi Tata Usaha.`,
      type: NotificationType.PAYMENT,
      link: `/finance/bills/${invoice.id}`,
      priority: 'LOW',
      channels: ['IN_APP'],
      recipientType: 'INDIVIDUAL',
    });
  } catch (error) {
    console.error('Failed to send proof-received notification:', error);
  }

  return payment;
}

export async function getPendingVerifications(
  currentUser: VerifierContext,
  query: { page?: number; limit?: number; status?: PaymentVerificationStatus }
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const status = query.status ?? PaymentVerificationStatus.PENDING_VERIFICATION;

  const where: Prisma.PaymentWhereInput = {
    verificationStatus: status,
    ...(seesAllUnits(currentUser) ? {} : { invoice: { unitId: currentUser.unitId ?? 'none' } }),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        invoice: {
          include: {
            student: {
              select: {
                id: true,
                nisn: true,
                nik: true,
                unitId: true,
                user: { select: { name: true } },
              },
            },
            paymentType: { select: { name: true } },
          },
        },
        tuVerifiedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    data: payments,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function verifyPayment(
  paymentId: string,
  action: 'TU_APPROVE' | 'FINAL_APPROVE' | 'REJECT',
  currentUser: VerifierContext,
  rejectionReason?: string
) {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: {
            student: {
              include: { user: { select: { id: true, name: true } } },
            },
            paymentType: { select: { id: true, name: true, accountId: true } },
          },
        },
      },
    });
    if (!payment) throw new Error('Payment not found');

    if (
      currentUser.role !== UserRole.SUPER_ADMIN &&
      (payment.invoice.unitId ?? payment.invoice.student.unitId) !== currentUser.unitId
    ) {
      throw new Error('Access denied: payment belongs to another unit');
    }

    const status = payment.verificationStatus;

    if (action === 'TU_APPROVE') {
      if (status !== PaymentVerificationStatus.PENDING_VERIFICATION) {
        throw new Error(`Cannot TU-approve a payment in status ${status}`);
      }
      return tx.payment.update({
        where: { id: paymentId },
        data: {
          verificationStatus: PaymentVerificationStatus.TU_APPROVED,
          tuVerifiedAt: new Date(),
          tuVerifiedById: currentUser.sub,
          rejectionReason: null,
        },
      });
    }

    if (action === 'REJECT') {
      if (
        status !== PaymentVerificationStatus.PENDING_VERIFICATION &&
        status !== PaymentVerificationStatus.TU_APPROVED
      ) {
        throw new Error(`Cannot reject a payment in status ${status}`);
      }
      return tx.payment.update({
        where: { id: paymentId },
        data: {
          verificationStatus: PaymentVerificationStatus.REJECTED,
          rejectionReason: rejectionReason ?? 'Bukti pembayaran tidak valid',
        },
      });
    }

    if (status !== PaymentVerificationStatus.TU_APPROVED) {
      throw new Error(`Cannot final-approve a payment in status ${status}`);
    }
    if (payment.tuVerifiedById === currentUser.sub) {
      throw new Error('Separation of duties: final approver must differ from the TU verifier');
    }

    const invoice = payment.invoice;
    const newPaidAmount = invoice.paidAmount.add(payment.amount);
    const newStatus: PaymentStatus = newPaidAmount.gte(invoice.amount)
      ? PaymentStatus.PAID
      : PaymentStatus.PARTIAL;

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaidAmount, status: newStatus },
    });

    if (invoice.paymentType.accountId && invoice.unitId) {
      const isBank = ['BANK_TRANSFER', 'VIRTUAL_ACCOUNT', 'QRIS', 'EWALLET'].includes(
        payment.method
      );
      const mappingKey = isBank ? ACCOUNT_MAPPING_KEYS.BANK : ACCOUNT_MAPPING_KEYS.CASH;
      const assetAccount = await getAccountOrFallback(
        invoice.unitId,
        mappingKey,
        isBank ? '1102' : '1101',
        isBank ? 'Bank' : 'Kas'
      );
      if (assetAccount) {
        await tx.journalEntry.create({
          data: {
            unitId: invoice.unitId,
            accountId: assetAccount.id,
            date: new Date(),
            description: `Pembayaran ${invoice.invoiceNumber} (${payment.method})`,
            debit: payment.amount,
            credit: 0,
            reference: payment.id,
            referenceType: JournalReferenceType.PAYMENT,
            createdById: currentUser.sub,
          },
        });
        await tx.journalEntry.create({
          data: {
            unitId: invoice.unitId,
            accountId: invoice.paymentType.accountId,
            date: new Date(),
            description: `Pendapatan ${invoice.paymentType.name} - ${invoice.student.user.name}`,
            debit: 0,
            credit: payment.amount,
            reference: payment.id,
            referenceType: JournalReferenceType.PAYMENT,
            createdById: currentUser.sub,
          },
        });
      }
    }

    return tx.payment.update({
      where: { id: paymentId },
      data: {
        verificationStatus: PaymentVerificationStatus.FINAL_APPROVED,
        finalVerifiedAt: new Date(),
        finalVerifiedById: currentUser.sub,
      },
    });
  });

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: {
            student: {
              select: {
                userId: true,
                parents: { select: { parentId: true } },
              },
            },
            paymentType: { select: { name: true } },
          },
        },
      },
    });
    if (payment) {
      const recipients = [
        payment.invoice.student.userId,
        ...payment.invoice.student.parents.map((link) => link.parentId),
      ];
      const formatter = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      });
      const isApproved = payment.verificationStatus === PaymentVerificationStatus.FINAL_APPROVED;
      const isRejected = payment.verificationStatus === PaymentVerificationStatus.REJECTED;
      if (isApproved || isRejected) {
        await Promise.allSettled(
          recipients.map((userId) =>
            notificationService.createNotification({
              userId,
              title: isApproved ? 'Pembayaran SPP Berhasil' : 'Bukti Pembayaran Ditolak',
              message: isApproved
                ? `Pembayaran ${payment.invoice.paymentType.name} sebesar ${formatter.format(
                    payment.amount.toNumber()
                  )} telah diverifikasi dan tercatat.`
                : `Bukti pembayaran ${payment.invoice.paymentType.name} ditolak: ${
                    payment.rejectionReason ?? '-'
                  }. Silakan unggah ulang bukti yang valid.`,
              type: NotificationType.PAYMENT,
              link: `/finance/bills/${payment.invoiceId}`,
              priority: 'HIGH',
              channels: isApproved ? ['IN_APP', 'EMAIL', 'WHATSAPP'] : ['IN_APP'],
              recipientType: 'INDIVIDUAL',
            })
          )
        );
      }
    }
  } catch (error) {
    console.error('Failed to send verification notification:', error);
  }

  return result;
}

export async function getPayments(query: QueryPaymentDto) {
  const { invoiceId, method, startDate, endDate, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(invoiceId && { invoiceId }),
    ...(method && { method }),
    ...(startDate || endDate
      ? {
          paidAt: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        invoice: {
          include: {
            student: {
              include: {
                user: { select: { id: true, name: true } },
              },
            },
            paymentType: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPaymentById(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      invoice: {
        include: {
          student: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          paymentType: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });
}

// =====================================
// ANALYTICS
// =====================================

export async function getStudentFinanceSummary(studentId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { studentId },
    include: {
      paymentType: { select: { id: true, name: true } },
    },
  });

  const total = invoices.reduce((sum, inv) => sum.add(inv.amount), new Prisma.Decimal(0));
  const paid = invoices.reduce((sum, inv) => sum.add(inv.paidAmount), new Prisma.Decimal(0));
  const pending = total.sub(paid);

  const overdue = invoices.filter(
    (inv) =>
      (inv.status === PaymentStatus.PENDING || inv.status === PaymentStatus.PARTIAL) &&
      new Date(inv.dueDate) < new Date()
  );

  return {
    total: total.toNumber(),
    paid: paid.toNumber(),
    pending: pending.toNumber(),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, inv) => sum + inv.amount.sub(inv.paidAmount).toNumber(), 0),
  };
}

export async function getUnitFinanceStats(unitId: string, month?: string) {
  const dateFilter = month
    ? {
        dueDate: {
          gte: new Date(`${month}-01`),
          lt: new Date(new Date(`${month}-01`).setMonth(new Date(`${month}-01`).getMonth() + 1)),
        },
      }
    : {};

  const invoices = await prisma.invoice.findMany({
    where: {
      unitId,
      ...dateFilter,
    },
  });

  const total = invoices.reduce((sum, inv) => sum.add(inv.amount), new Prisma.Decimal(0));
  const collected = invoices.reduce((sum, inv) => sum.add(inv.paidAmount), new Prisma.Decimal(0));
  const pending = total.sub(collected);

  const byStatus = await prisma.invoice.groupBy({
    by: ['status'],
    where: { unitId, ...dateFilter },
    _count: true,
    _sum: { amount: true },
  });

  return {
    total: total.toNumber(),
    collected: collected.toNumber(),
    pending: pending.toNumber(),
    collectionRate: total.gt(0) ? collected.div(total).mul(100).toNumber() : 0,
    byStatus: byStatus.map((s) => ({
      status: s.status,
      count: s._count,
      amount: s._sum.amount?.toNumber() || 0,
    })),
  };
}

export async function getFinancialSummary() {
  const now = new Date();

  const [invoices, recentPayments] = await Promise.all([
    prisma.invoice.findMany({
      select: {
        amount: true,
        paidAmount: true,
        status: true,
        dueDate: true,
        paymentType: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      take: 10,
      orderBy: { paidAt: 'desc' },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            student: {
              select: { id: true, nisn: true, nik: true, user: { select: { name: true } } },
            },
          },
        },
      },
    }),
  ]);

  const zero = new Prisma.Decimal(0);
  let totalBilled = zero;
  let totalPaid = zero;
  let totalOverdue = zero;

  const byType = new Map<string, { total: Prisma.Decimal; paid: Prisma.Decimal }>();

  for (const inv of invoices) {
    totalBilled = totalBilled.add(inv.amount);
    totalPaid = totalPaid.add(inv.paidAmount);

    const unpaid = inv.amount.sub(inv.paidAmount);
    const isSettled = inv.status === PaymentStatus.PAID;
    if (!isSettled && inv.dueDate < now && unpaid.gt(0)) {
      totalOverdue = totalOverdue.add(unpaid);
    }

    const name = inv.paymentType?.name ?? 'Lainnya';
    const bucket = byType.get(name) ?? { total: zero, paid: zero };
    byType.set(name, {
      total: bucket.total.add(inv.amount),
      paid: bucket.paid.add(inv.paidAmount),
    });
  }

  return {
    totalBilled: totalBilled.toNumber(),
    totalPaid: totalPaid.toNumber(),
    totalOutstanding: totalBilled.sub(totalPaid).toNumber(),
    totalOverdue: totalOverdue.toNumber(),
    billsByType: Array.from(byType.entries())
      .map(([type, v]) => ({
        type,
        total: v.total.toNumber(),
        paid: v.paid.toNumber(),
        outstanding: v.total.sub(v.paid).toNumber(),
      }))
      .sort((a, b) => b.total - a.total),
    recentPayments,
  };
}

export async function getStudentOutstandingBalances(unitId: string) {
  const invoices = await prisma.invoice.findMany({
    where: {
      unitId,
      status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
      dueDate: { lt: new Date() },
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true } },
          enrollments: {
            where: { status: 'ACTIVE' },
            include: { class: { select: { id: true, name: true } } },
            take: 1,
            orderBy: { enrolledAt: 'desc' },
          },
        },
      },
    },
  });

  const studentMap = new Map<string, any>();

  for (const inv of invoices) {
    const unpaidAmount = inv.amount.sub(inv.paidAmount).toNumber();
    if (unpaidAmount <= 0) continue;

    if (!studentMap.has(inv.studentId)) {
      studentMap.set(inv.studentId, {
        studentId: inv.studentId,
        studentName: inv.student.user.name,
        nis: inv.student.nisn || inv.student.nik || '-',
        studentNisn: inv.student.nisn,
        studentNik: inv.student.nik,
        className: inv.student.enrollments[0]?.class?.name || '-',
        unpaid_amount: 0,
        overdueInvoiceCount: 0,
      });
    }

    const rec = studentMap.get(inv.studentId);
    rec.unpaid_amount += unpaidAmount;
    rec.overdueInvoiceCount += 1;
  }

  return Array.from(studentMap.values()).sort((a, b) => b.unpaid_amount - a.unpaid_amount);
}

// =====================================
// SPP MATRIX - Tampilan bulanan per santri
// =====================================

export interface SppMatrixQuery {
  unitId?: string;
  classId?: string;
  year: number;
  paymentTypeId?: string;
}

export interface StudentSppRow {
  studentId: string;
  studentName: string;
  nis?: string;
  studentNisn?: string | null;
  studentNik?: string | null;
  className: string;
  months: {
    [month: string]: {
      invoiceId?: string;
      status: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE' | 'NOT_BILLED';
      amount: number;
      paidAmount: number;
      dueDate?: string;
    };
  };
  totalAmount: number;
  totalPaid: number;
}

export async function getSppMatrix(query: SppMatrixQuery) {
  const { unitId, classId, year, paymentTypeId } = query;

  const students = await prisma.student.findMany({
    where: {
      ...(unitId && { unitId }),
      ...(classId && {
        enrollments: {
          some: { classId },
        },
      }),
    },
    include: {
      user: { select: { id: true, name: true } },
      enrollments: {
        include: {
          class: { select: { id: true, name: true } },
        },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { nisn: 'asc' },
  });

  const sppPaymentType = paymentTypeId
    ? await prisma.paymentType.findUnique({ where: { id: paymentTypeId } })
    : await prisma.paymentType.findFirst({
        where: {
          code: 'SPP',
          isRecurring: true,
          ...(unitId && { unitId }),
        },
      });

  if (!sppPaymentType) {
    return { students: [], sppRate: 0, year, months: [] };
  }

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);

  const studentIds = students.map((s) => s.id);
  const invoices = await prisma.invoice.findMany({
    where: {
      studentId: { in: studentIds },
      ...(unitId ? { unitId } : {}),
      paymentTypeId: sppPaymentType.id,
      dueDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      payments: true,
    },
  });

  const now = new Date();
  const matrixData: StudentSppRow[] = students.map((student) => {
    const studentInvoices = invoices.filter((inv) => inv.studentId === student.id);
    const monthsData: StudentSppRow['months'] = {};

    let totalAmount = 0;
    let totalPaid = 0;

    months.forEach((monthName, index) => {
      const invoice = studentInvoices.find((inv) => {
        const invMonth = new Date(inv.dueDate).getMonth();
        return invMonth === index;
      });

      if (invoice) {
        const isPastDue = new Date(invoice.dueDate) < now;
        let status: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE' = invoice.status as any;

        if ((status === 'PENDING' || status === 'PARTIAL') && isPastDue) {
          status = 'OVERDUE';
        }

        monthsData[monthName] = {
          invoiceId: invoice.id,
          status,
          amount: invoice.amount.toNumber(),
          paidAmount: invoice.paidAmount.toNumber(),
          dueDate: invoice.dueDate.toISOString(),
        };

        totalAmount += invoice.amount.toNumber();
        totalPaid += invoice.paidAmount.toNumber();
      } else {
        monthsData[monthName] = {
          status: 'NOT_BILLED',
          amount: 0,
          paidAmount: 0,
        };
      }
    });

    return {
      studentId: student.id,
      studentName: student.user.name,
      nis: student.nisn || student.nik || '-',
      studentNisn: student.nisn,
      studentNik: student.nik,
      className: student.enrollments[0]?.class?.name || '-',
      months: monthsData,
      totalAmount,
      totalPaid,
    };
  });

  const summary = {
    totalStudents: students.length,
    totalBilled: matrixData.reduce((sum, s) => sum + s.totalAmount, 0),
    totalPaid: matrixData.reduce((sum, s) => sum + s.totalPaid, 0),
    totalOutstanding: 0,
    paidCount: 0,
    partialCount: 0,
    pendingCount: 0,
    overdueCount: 0,
  };

  summary.totalOutstanding = summary.totalBilled - summary.totalPaid;

  matrixData.forEach((student) => {
    Object.values(student.months).forEach((month) => {
      if (month.status === 'PAID') summary.paidCount++;
      else if (month.status === 'PARTIAL') summary.partialCount++;
      else if (month.status === 'PENDING') summary.pendingCount++;
      else if (month.status === 'OVERDUE') summary.overdueCount++;
    });
  });

  return {
    students: matrixData,
    sppRate: sppPaymentType.amount.toNumber(),
    paymentTypeId: sppPaymentType.id,
    year,
    months,
    summary,
  };
}

export async function generateBulkSppInvoices(data: {
  unitId?: string;
  classId?: string;
  paymentTypeId: string;
  year: number;
  month: number;
  dueDay?: number;
}) {
  const { unitId, classId, paymentTypeId, year, month, dueDay = 10 } = data;

  const paymentType = await prisma.paymentType.findUnique({
    where: { id: paymentTypeId },
  });

  if (!paymentType) {
    throw new Error('Payment type not found');
  }

  const students = await prisma.student.findMany({
    where: {
      ...(unitId && { unitId }),
      ...(classId && {
        enrollments: {
          some: { classId },
        },
      }),
    },
  });

  const dueDate = new Date(year, month, dueDay);
  const period = `${
    [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ][month]
  } ${year}`;

  const createdInvoices = [];

  for (const student of students) {
    const existing = await prisma.invoice.findFirst({
      where: {
        studentId: student.id,
        paymentTypeId,
        dueDate: {
          gte: new Date(year, month, 1),
          lt: new Date(year, month + 1, 1),
        },
      },
    });

    if (!existing) {
      const invoiceNumber = await generateInvoiceNumber();
      const invoice = await prisma.invoice.create({
        data: {
          studentId: student.id,
          paymentTypeId,
          invoiceNumber,
          amount: paymentType.amount,
          dueDate,
          period,
          unitId: student.unitId,
          notes: `Tagihan ${paymentType.name} untuk ${period}`,
        },
      });
      createdInvoices.push(invoice);
    }
  }

  return {
    created: createdInvoices.length,
    skipped: students.length - createdInvoices.length,
    total: students.length,
  };
}

export async function generateRecurringBills() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const dueDate = new Date(year, month, 10);
  const period = `${
    [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ][month]
  } ${year}`;

  let processed = 0;
  let created = 0;
  let skipped = 0;

  const paymentTypes = await prisma.paymentType.findMany({
    where: { isRecurring: true, isActive: true },
  });

  if (!paymentTypes.length) {
    return { processed, created, skipped };
  }

  const activeStudents = await prisma.student.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, unitId: true, userId: true },
  });

  if (!activeStudents.length) {
    return { processed, created, skipped };
  }

  for (const student of activeStudents) {
    const applicableTypes = paymentTypes.filter((pt) => pt.unitId === student.unitId);

    for (const paymentType of applicableTypes) {
      processed++;

      const existing = await prisma.invoice.findFirst({
        where: {
          studentId: student.id,
          paymentTypeId: paymentType.id,
          dueDate: {
            gte: new Date(year, month, 1),
            lt: new Date(year, month + 1, 1),
          },
        },
      });

      if (!existing) {
        const invoiceNumber = await generateInvoiceNumber();
        await prisma.invoice.create({
          data: {
            studentId: student.id,
            paymentTypeId: paymentType.id,
            invoiceNumber,
            amount: paymentType.amount,
            dueDate,
            period,
            unitId: student.unitId,
            notes: `Tagihan ${paymentType.name} otomatis untuk ${period}`,
          },
        });
        created++;
      } else {
        skipped++;
      }
    }
  }

  return { processed, created, skipped };
}

export async function calculateInvoiceAmounts(
  studentId: string | undefined,
  paymentTypeId: string,
  originalAmount: number,
  dueDate: Date,
  tx?: Prisma.TransactionClient
) {
  const db = tx || prisma;
  if (studentId) {
    const recipients = await db.scholarshipRecipient.findMany({
      where: { studentId },
    });
  }
  return { amount: originalAmount, discount: 0 };
}

export function validateScholarshipDiscount(data: {
  componentId?: string | null;
  paymentTypeId?: string | null;
}) {
  if (!data.componentId && !data.paymentTypeId) {
    throw new Error(
      'Data Integrity Error: At least one of componentId or paymentTypeId must be set to prevent duplicate orphaned discounts.'
    );
  }
}
