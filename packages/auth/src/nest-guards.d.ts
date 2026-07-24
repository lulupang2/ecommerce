import type { Type } from '@nestjs/common';

export declare class AuthGuard {
  canActivate(context: unknown): Promise<boolean>;
}
export declare class CookieCsrfGuard {
  canActivate(context: unknown): boolean;
}
export declare class InternalGuard {
  canActivate(context: unknown): boolean;
}
export function RoleGuard(role: string): Type<{ canActivate(context: unknown): boolean }>;
export function PermissionGuard(permission: string): Type<{ canActivate(context: unknown): boolean }>;
