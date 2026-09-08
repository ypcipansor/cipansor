/**
 * Validation utilities
 * Consistent form validation throughout the application
 */

export interface ValidationRule {
  validate: (value: unknown) => boolean;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate a value against multiple rules
 */
export function validate(
  value: unknown,
  rules: ValidationRule[],
): ValidationResult {
  const errors: string[] = [];

  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an object against a schema
 */
export function validateObject<T extends Record<string, unknown>>(
  obj: T,
  schema: Record<keyof T, ValidationRule[]>,
): Record<keyof T, ValidationResult> {
  const results = {} as Record<keyof T, ValidationResult>;

  for (const key of Object.keys(schema) as (keyof T)[]) {
    results[key] = validate(obj[key], schema[key]);
  }

  return results;
}

/**
 * Check if all validations passed
 */
export function isAllValid<T extends Record<string, unknown>>(
  results: Record<keyof T, ValidationResult>,
): boolean {
  return Object.values(results).every(
    (result) => (result as ValidationResult).isValid,
  );
}

/**
 * Get first error message from validation results
 */
export function getFirstError<T extends Record<string, unknown>>(
  results: Record<keyof T, ValidationResult>,
): string | null {
  for (const result of Object.values(results)) {
    const validationResult = result as ValidationResult;
    if (!validationResult.isValid && validationResult.errors.length > 0) {
      return validationResult.errors[0];
    }
  }
  return null;
}

// ============================================
// Pre-built validation rules
// ============================================

/**
 * Required field validation
 */
export const required = (
  message = "Field ini wajib diisi",
): ValidationRule => ({
  validate: (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  },
  message,
});

/**
 * Email validation
 */
export const email = (
  message = "Format email tidak valid",
): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true; // Skip if empty (use required for that)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  message,
});

/**
 * Minimum length validation
 */
export const minLength = (min: number, message?: string): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    return value.length >= min;
  },
  message: message || `Minimal ${min} karakter`,
});

/**
 * Maximum length validation
 */
export const maxLength = (max: number, message?: string): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    return value.length <= max;
  },
  message: message || `Maksimal ${max} karakter`,
});

/**
 * Exact length validation
 */
export const exactLength = (
  length: number,
  message?: string,
): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    return value.length === length;
  },
  message: message || `Harus ${length} karakter`,
});

/**
 * Pattern validation
 */
export const pattern = (regex: RegExp, message: string): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    return regex.test(value);
  },
  message,
});

/**
 * Indonesian phone number validation
 */
export const phoneNumber = (
  message = "Format nomor telepon tidak valid",
): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    const phoneRegex = /^(\+62|62|0)8[1-9][0-9]{7,10}$/;
    return phoneRegex.test(value.replace(/[\s-]/g, ""));
  },
  message,
});

/**
 * NIK validation
 */
export const nik = (
  message = "Format NIK tidak valid (16 digit)",
): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    const nikRegex = /^[0-9]{16}$/;
    return nikRegex.test(value.replace(/\D/g, ""));
  },
  message,
});

/**
 * NISN validation (National Student ID - 10 digits)
 */
export const nisn = (
  message = "Format NISN tidak valid (10 digit)",
): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    const nisnRegex = /^[0-9]{10}$/;
    return nisnRegex.test(value.replace(/\D/g, ""));
  },
  message,
});

/**
 * Numeric only validation
 */
export const numeric = (
  message = "Hanya boleh berisi angka",
): ValidationRule => ({
  validate: (value) => {
    if (!value) return true;
    if (typeof value === "number") return !isNaN(value);
    if (typeof value === "string") return /^\d+$/.test(value);
    return false;
  },
  message,
});

/**
 * Alphabetic only validation
 */
export const alphabetic = (
  message = "Hanya boleh berisi huruf",
): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    return /^[a-zA-Z\s]+$/.test(value);
  },
  message,
});

/**
 * Alphanumeric validation
 */
export const alphanumeric = (
  message = "Hanya boleh berisi huruf dan angka",
): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    return /^[a-zA-Z0-9\s]+$/.test(value);
  },
  message,
});

/**
 * Minimum value validation
 */
export const min = (minValue: number, message?: string): ValidationRule => ({
  validate: (value) => {
    if (value === null || value === undefined || value === "") return true;
    const num = typeof value === "number" ? value : parseFloat(value as string);
    return !isNaN(num) && num >= minValue;
  },
  message: message || `Minimal ${minValue}`,
});

/**
 * Maximum value validation
 */
export const max = (maxValue: number, message?: string): ValidationRule => ({
  validate: (value) => {
    if (value === null || value === undefined || value === "") return true;
    const num = typeof value === "number" ? value : parseFloat(value as string);
    return !isNaN(num) && num <= maxValue;
  },
  message: message || `Maksimal ${maxValue}`,
});

/**
 * Date validation
 */
export const date = (
  message = "Format tanggal tidak valid",
): ValidationRule => ({
  validate: (value) => {
    if (!value) return true;
    const d = new Date(value as string | number | Date);
    return !isNaN(d.getTime());
  },
  message,
});

/**
 * Date in the past validation
 */
export const pastDate = (
  message = "Tanggal harus di masa lalu",
): ValidationRule => ({
  validate: (value) => {
    if (!value) return true;
    const d = new Date(value as string | number | Date);
    return !isNaN(d.getTime()) && d < new Date();
  },
  message,
});

/**
 * Date in the future validation
 */
export const futureDate = (
  message = "Tanggal harus di masa depan",
): ValidationRule => ({
  validate: (value) => {
    if (!value) return true;
    const d = new Date(value as string | number | Date);
    return !isNaN(d.getTime()) && d > new Date();
  },
  message,
});

/**
 * Password strength validation
 */
export const password = (options?: {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecial?: boolean;
}): ValidationRule => {
  const {
    minLength: min = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecial = false,
  } = options || {};

  return {
    validate: (value) => {
      if (!value || typeof value !== "string") return true;

      if (value.length < min) return false;
      if (requireUppercase && !/[A-Z]/.test(value)) return false;
      if (requireLowercase && !/[a-z]/.test(value)) return false;
      if (requireNumber && !/[0-9]/.test(value)) return false;
      if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(value)) return false;

      return true;
    },
    message: `Password harus minimal ${min} karakter${requireUppercase ? ", huruf besar" : ""}${requireLowercase ? ", huruf kecil" : ""}${requireNumber ? ", angka" : ""}${requireSpecial ? ", karakter spesial" : ""}`,
  };
};

/**
 * Confirm password match validation
 */
export const confirmPassword = (
  passwordValue: string,
  message = "Password tidak cocok",
): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    return value === passwordValue;
  },
  message,
});

/**
 * URL validation
 */
export const url = (message = "Format URL tidak valid"): ValidationRule => ({
  validate: (value) => {
    if (!value || typeof value !== "string") return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  message,
});

/**
 * File size validation (for file inputs)
 */
export const maxFileSize = (
  maxBytes: number,
  message?: string,
): ValidationRule => ({
  validate: (value) => {
    if (!value) return true;
    if (value instanceof File) {
      return value.size <= maxBytes;
    }
    return true;
  },
  message:
    message || `Ukuran file maksimal ${(maxBytes / 1024 / 1024).toFixed(1)}MB`,
});

/**
 * File type validation
 */
export const fileType = (
  allowedTypes: string[],
  message?: string,
): ValidationRule => ({
  validate: (value) => {
    if (!value) return true;
    if (value instanceof File) {
      return allowedTypes.some((type) => {
        if (type.startsWith(".")) {
          return value.name.toLowerCase().endsWith(type.toLowerCase());
        }
        return (
          value.type === type || value.type.startsWith(type.replace("*", ""))
        );
      });
    }
    return true;
  },
  message: message || `Format file yang diizinkan: ${allowedTypes.join(", ")}`,
});
