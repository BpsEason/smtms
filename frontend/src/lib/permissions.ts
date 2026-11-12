export type PermissionRequirement = {
  permission?: string | null;
  permissions?: string[];
  anyPermissions?: string[];
};

export function hasPermission(
  granted: string[] | undefined | null,
  permission: string,
): boolean {
  return (granted ?? []).includes(permission);
}

export function hasAllPermissions(
  granted: string[] | undefined | null,
  required: string[],
): boolean {
  const set = granted ?? [];
  return required.every((p) => set.includes(p));
}

export function hasAnyPermission(
  granted: string[] | undefined | null,
  required: string[],
): boolean {
  const set = granted ?? [];
  return required.some((p) => set.includes(p));
}

export function canAccess(
  granted: string[] | undefined | null,
  requirement: PermissionRequirement,
): boolean {
  if (requirement.anyPermissions?.length) {
    return hasAnyPermission(granted, requirement.anyPermissions);
  }

  if (requirement.permissions?.length) {
    return hasAllPermissions(granted, requirement.permissions);
  }

  if (requirement.permission == null) {
    return true;
  }

  return hasPermission(granted, requirement.permission);
}