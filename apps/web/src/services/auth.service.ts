/**
 * Auth API Service
 * Centralized API calls for authentication
 */

import { api } from "@/lib/api";
import type { ApiResponse } from "./types";

export interface LoginCredentials {
  email: string;
  password: string;
  /** Token Turnstile; tidak ada ketika gerbangnya dimatikan di build ini. */
  turnstileToken?: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: string;
  unitId?: string;
  unit?: {
    id: string;
    name: string;
    code: string;
  };
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Admin-triggered reset. Keyed on a user id, not an e-mail address: there is
 * deliberately no public "forgot password" form, so the caller is always an
 * admin looking at a user record.
 */
export interface SendPasswordResetInput {
  userId: string;
}

export interface ConfirmResetPasswordInput {
  token: string;
  newPassword: string;
  /** Token Turnstile; tidak ada ketika gerbangnya dimatikan di build ini. */
  turnstileToken?: string;
}

/**
 * Auth Service
 */
export const authService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<{
    user: UserProfile;
    tokens: AuthTokens;
  }> {
    const response = await api.post<
      ApiResponse<{
        user: UserProfile;
        tokens: AuthTokens;
      }>
    >("/auth/login", credentials);

    // Tokens are issued as `HttpOnly` cookies by the API; nothing is stored
    // here.
    return response.data.data;
  },

  /**
   * Register new user
   */
  async register(input: RegisterInput): Promise<{
    user: UserProfile;
    tokens: AuthTokens;
  }> {
    const response = await api.post<
      ApiResponse<{
        user: UserProfile;
        tokens: AuthTokens;
      }>
    >("/auth/register", input);

    // Tokens are issued as `HttpOnly` cookies by the API; nothing is stored
    // here.
    return response.data.data;
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    // The API revokes the refresh token and clears the session cookies.
    await api.post("/auth/logout");
  },

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthTokens> {
    // The API reads the refresh token from its `HttpOnly` cookie and rotates it.
    const response = await api.post<ApiResponse<AuthTokens>>(
      "/auth/refresh",
      {},
    );
    return response.data.data;
  },

  /**
   * Get current user profile
   */
  async getProfile(): Promise<UserProfile> {
    const response = await api.get<ApiResponse<UserProfile>>("/auth/profile");
    return response.data.data;
  },

  /**
   * Update current user profile
   */
  async updateProfile(
    input: Partial<Pick<UserProfile, "name" | "phone" | "avatar">>,
  ): Promise<UserProfile> {
    const response = await api.patch<ApiResponse<UserProfile>>(
      "/auth/profile",
      input,
    );
    return response.data.data;
  },

  /**
   * Change password
   */
  async changePassword(input: ChangePasswordInput): Promise<void> {
    await api.post("/auth/change-password", input);
  },

  /**
   * E-mail a password reset link to a user (admin only).
   */
  async sendPasswordReset(
    input: SendPasswordResetInput,
  ): Promise<{ message: string; expiresInHours: number }> {
    const response = await api.post<
      ApiResponse<{ message: string; expiresInHours: number }>
    >("/auth/send-password-reset", input);
    return response.data.data;
  },

  /**
   * Confirm password reset with token
   */
  async confirmPasswordReset(input: ConfirmResetPasswordInput): Promise<void> {
    await api.post("/auth/reset-password", input);
  },

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<void> {
    await api.post("/auth/verify-email", { token });
  },

  /**
   * Resend verification email
   */
  async resendVerificationEmail(): Promise<void> {
    await api.post("/auth/resend-verification");
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    // Only a hint: the credential is the `HttpOnly` cookie. The store's
    // persisted user blob marks that a session is expected.
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("auth-storage");
  },
};
