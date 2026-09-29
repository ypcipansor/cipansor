import bcrypt from 'bcryptjs';
import { normalizePassword } from '@cipansor/shared';
import { config } from '@/config';

/**
 * Hash a password. NFC-normalised first (NIST SP 800-63B-4), so the same
 * characters typed on different keyboards hash alike; for ASCII it changes
 * nothing, so existing hashes still match.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(normalizePassword(password), config.bcrypt.saltRounds);
}

/**
 * Compare password with hash, normalised the same way.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(normalizePassword(password), hash);
}
