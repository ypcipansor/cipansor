import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/utils/encryption';
import { Prisma } from '@prisma/client';

export class SecretsService {
  static async list(unitId?: string) {
    const where: Prisma.SystemSecretWhereInput = unitId ? { unitId } : { unitId: null };
    const secrets = await prisma.systemSecret.findMany({
      where,
      orderBy: { key: 'asc' },
    });

    return secrets.map((s) => ({
      id: s.id,
      key: s.key,
      description: s.description,
      maskedValue: '********', // Never return actual value in list
      updatedAt: s.updatedAt,
    }));
  }

  static async upsert(data: {
    key: string;
    value: string;
    description?: string;
    unitId?: string | null;
  }) {
    const encryptedValue = encrypt(data.value);
    const targetUnitId = data.unitId || null;

    // Wrap in transaction to mitigate race conditions
    return prisma.$transaction(async (tx) => {
      // Manual upsert to handle potential unique constraint issues with NULL unitId in Postgres
      const existing = await tx.systemSecret.findFirst({
        where: {
          key: data.key,
          unitId: targetUnitId,
        },
      });

      if (existing) {
        return tx.systemSecret.update({
          where: { id: existing.id },
          data: {
            value: encryptedValue,
            description: data.description,
          },
        });
      }

      return tx.systemSecret.create({
        data: {
          unitId: targetUnitId,
          key: data.key,
          value: encryptedValue,
          description: data.description,
        },
      });
    });
  }

  static async delete(id: string) {
    return prisma.systemSecret.delete({
      where: { id },
    });
  }

  // Internal use only - to get decrypted value
  static async getValue(key: string, unitId: string | null = null) {
    const secret = await prisma.systemSecret.findFirst({
      where: {
        unitId: unitId,
        key: key,
      },
    });
    if (!secret) return null;
    return decrypt(secret.value);
  }
}
