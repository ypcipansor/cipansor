"use client";

import { getEffectiveRole } from "@/lib/rbac";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import {
  ADMIN_ROLES,
  TEACHER_ROLES,
  STAFF_ROLES,
  STUDENT_ROLES,
  PARENT_ROLES,
  YAYASAN_ROLES,
} from "@/config/navigation";

interface UserRole {
  id: string;
  isPrimary: boolean;
  role: {
    id: string;
    code: string;
    name: string;
    realm: string;
  };
  unit?: {
    id: string;
    name: string;
  } | null;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[]; // Legacy role names (SUPER_ADMIN, UNIT_ADMIN, etc.)
  allowedRoleCodes?: string[]; // New role codes (SMPIT_ADMIN, PAUD_GURU, etc.)
  allowedRealms?: string[]; // Realms (GLOBAL, YAYASAN, PAUD, etc.)
  /**
   * API permissions (e.g. STUDENT_UPDATE), any one of which admits the user.
   * The same list the API's hasPermission() checks: the login and /auth/me
   * user carries it from the active role. Use it where a legacy bucket is too
   * coarse: TU holds STUDENT_CREATE/UPDATE but sits in STAFF with the nurse.
   */
  allowedPermissions?: string[];
}

// Map legacy roles to RoleCode categories
function mapLegacyRoleToRoleCodes(legacyRole: string): string[] {
  switch (legacyRole) {
    case "SUPER_ADMIN":
      return ["SUPER_ADMIN"];
    case "UNIT_ADMIN":
      return ADMIN_ROLES.filter((r) => r !== "SUPER_ADMIN");
    case "TEACHER":
      return TEACHER_ROLES;
    case "STAFF":
      return STAFF_ROLES;
    case "STUDENT":
      return STUDENT_ROLES;
    case "PARENT":
      return PARENT_ROLES;
    default:
      return [legacyRole];
  }
}

export function ProtectedRoute({
  children,
  allowedRoles,
  allowedRoleCodes,
  allowedRealms,
  allowedPermissions,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, fetchUser } = useAuthStore();
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    fetchUser().finally(() => setHasInitialized(true));
  }, [fetchUser]);

  useEffect(() => {
    // Only redirect after initialization is complete and auth check fails
    if (hasInitialized && !isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router, hasInitialized]);

  // Get active role from userRoles
  const activeRole = useMemo(() => {
    const userRoles = user?.userRoles as UserRole[] | undefined;
    return userRoles?.find((r) => r.isPrimary) || userRoles?.[0];
  }, [user?.userRoles]);

  // Check if user has access based on their active role
  const hasAccess = useMemo(() => {
    if (!user) return false;

    // If no restrictions, allow access
    if (
      !allowedRoles &&
      !allowedRoleCodes &&
      !allowedRealms &&
      !allowedPermissions
    ) {
      return true;
    }

    // Get the role code to check
    const activeRoleCode = activeRole?.role.code || user.role;
    const activeRealm = activeRole?.role.realm;

    // Super Admin always has access
    if (activeRoleCode === "SUPER_ADMIN") {
      return true;
    }

    if (
      allowedPermissions &&
      allowedPermissions.some((p) => user.permissions?.includes(p))
    ) {
      return true;
    }

    // Check realm-based access
    if (allowedRealms && activeRealm) {
      if (allowedRealms.includes(activeRealm)) {
        return true;
      }
    }

    // Check role code-based access
    if (allowedRoleCodes) {
      if (allowedRoleCodes.includes(activeRoleCode)) {
        return true;
      }
    }

    // Check legacy role-based access (with mapping)
    if (allowedRoles) {
      // First check direct match with the effective legacy role (resolves
      // RoleCode-only users the same way middleware.ts does)
      const legacyRole = getEffectiveRole(user);
      if (legacyRole && allowedRoles.includes(legacyRole)) {
        return true;
      }

      // Map legacy roles to role codes and check
      const expandedRoleCodes = allowedRoles.flatMap(mapLegacyRoleToRoleCodes);
      if (expandedRoleCodes.includes(activeRoleCode)) {
        return true;
      }
    }

    return false;
  }, [
    user,
    activeRole,
    allowedRoles,
    allowedRoleCodes,
    allowedRealms,
    allowedPermissions,
  ]);

  useEffect(() => {
    if (user && !hasAccess) {
      router.push("/unauthorized");
    }
  }, [user, hasAccess, router]);

  // Revalidating an existing session must not blank the app shell. `fetchUser`
  // runs on every mount, so gating on `isLoading` alone replaced the sidebar
  // and header with a full-screen spinner on *every* page load, for as long as
  // /auth/me took — the audit saw pages with no shell at all after 1.8s. The
  // persisted user is good enough to render with; only a cold start waits.
  if (isLoading && !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
}
