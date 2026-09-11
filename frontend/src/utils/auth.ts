import { AuthUser } from '../types';

/**
 * Checks if a user is a super administrator.
 */
export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.is_super_admin || user.is_superuser || user.is_admin);
}

/**
 * Normalizes all permissions or scopes assigned to the user.
 */
export function getUserPermissions(user: AuthUser | null | undefined): string[] {
  if (!user) return [];

  // Super admin has all platform permissions
  if (isSuperAdmin(user)) {
    return ['run_match', 'evaluate', 'audit_logs', 'endpoints_list'];
  }

  const permsSet = new Set<string>();

  // Check direct permissions array
  if (Array.isArray(user.permissions)) {
    user.permissions.forEach((p) => {
      if (typeof p === 'string') permsSet.add(p.toLowerCase().trim());
    });
  }

  // Check scopes array
  if (Array.isArray(user.scopes)) {
    user.scopes.forEach((s) => {
      if (typeof s === 'string') permsSet.add(s.toLowerCase().trim());
    });
  }

  // Check nested role permissions if present
  if (user.role && typeof user.role === 'object' && Array.isArray((user.role as any).permissions)) {
    (user.role as any).permissions.forEach((p: any) => {
      if (typeof p === 'string') permsSet.add(p.toLowerCase().trim());
    });
  }

  return Array.from(permsSet);
}

/**
 * Checks if the user has permission to view and access the Evaluate feature.
 * ONLY users assigned 'evaluate' and Super Admins can see/access it.
 */
export function canAccessEvaluate(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const perms = getUserPermissions(user);
  return perms.some((p) => p === 'evaluate' || p.includes('evaluat'));
}

/**
 * Checks if the user has permission to view and access the Audit feature.
 * ONLY users assigned 'audit_logs' (or 'audit') and Super Admins can see/access it.
 */
export function canAccessAudit(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const perms = getUserPermissions(user);
  return perms.some((p) => p === 'audit_logs' || p === 'audit' || p.includes('audit'));
}

/**
 * Checks if the user has permission to run matching engine.
 */
export function canAccessRunMatch(user: AuthUser | null | undefined): boolean {
  if (!user) return true; // Default match engine can run or fallback
  if (isSuperAdmin(user)) return true;

  const perms = getUserPermissions(user);
  return perms.length === 0 || perms.some((p) => p === 'run_match' || p.includes('match'));
}

/**
 * Checks if the user has permission to view API endpoints catalog.
 */
export function canAccessEndpoints(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const perms = getUserPermissions(user);
  return perms.some((p) => p === 'endpoints_list' || p.includes('endpoint'));
}
