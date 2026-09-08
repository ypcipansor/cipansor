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

    const { tokens } = response.data.data;

    // Store tokens
    localStorage.setItem("accessToken", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);

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

    const { tokens } = response.data.data;

    // Store tokens
    localStorage.setItem("accessToken", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);

    return response.data.data;
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } finally {
      // Always clear tokens
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
    }
  },

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthTokens> {
    const refreshToken = localStorage.getItem("refreshToken");

    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await api.post<ApiResponse<AuthTokens>>("/auth/refresh", {
      refreshToken,
    });

    const tokens = response.data.data;

    // Update stored tokens
    localStorage.setItem("accessToken", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);

    return tokens;
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
    return !!localStorage.getItem("accessToken");
  },

  /**
   * Get stored access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem("accessToken");
  },
};
