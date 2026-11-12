import { useMemo } from "react";
import type { UserProfile } from "../types";
import {
  canAccess,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type PermissionRequirement,
} from "../lib/permissions";

export function usePermissions(profile: UserProfile | null | undefined) {
  const granted = profile?.permissions;

  return useMemo(
    () => ({
      granted: granted ?? [],
      can: (permission: string) => hasPermission(granted, permission),
      canAll: (permissions: string[]) =>
        hasAllPermissions(granted, permissions),
      canAny: (permissions: string[]) =>
        hasAnyPermission(granted, permissions),
      canAccess: (requirement: PermissionRequirement) =>
        canAccess(granted, requirement),
    }),
    [granted],
  );
}