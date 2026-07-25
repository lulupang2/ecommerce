const {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  mixin,
} = require('@nestjs/common');
const { verifyAccessToken } = require('@techzone/auth-platform/tokens');
const { setContextFields } = require('@techzone/observability/context');

function readToken(request) {
  const value = request.headers.authorization || '';
  if (value.startsWith('Bearer ') && !['undefined', 'null', ''].includes(value.slice(7))) {
    return { token: value.slice(7), source: 'bearer' };
  }
  if (request.cookies?.tz_access) return { token: request.cookies.tz_access, source: 'cookie' };
  return { token: '', source: 'none' };
}

function csrfValid(request) {
  if (request.authSource !== 'cookie' || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  return Boolean(
    request.cookies?.tz_csrf
      && request.headers['x-csrf-token']
      && request.cookies.tz_csrf === request.headers['x-csrf-token'],
  );
}

class AuthGuard {
  async canActivate(context) {
    const request = context.switchToHttp().getRequest();
    const credential = readToken(request);
    try {
      request.user = await verifyAccessToken(credential.token);
      request.authSource = credential.source;
      setContextFields({ actorId: request.user.sub, userId: request.user.sub });
      if (!csrfValid(request)) {
        throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'CSRF 토큰이 올바르지 않습니다.' });
      }
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    }
  }
}
Injectable()(AuthGuard);

class OptionalAuthGuard {
  async canActivate(context) {
    const request = context.switchToHttp().getRequest();
    const credential = readToken(request);
    if (!credential.token) return true;
    try {
      request.user = await verifyAccessToken(credential.token);
      request.authSource = credential.source;
      setContextFields({ actorId: request.user.sub, userId: request.user.sub });
      if (!csrfValid(request)) {
        throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'CSRF 토큰이 올바르지 않습니다.' });
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      request.authError = 'INVALID_TOKEN';
    }
    return true;
  }
}
Injectable()(OptionalAuthGuard);

class CookieCsrfGuard {
  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    if (request.headers['x-client-platform'] === 'capacitor' || !request.cookies?.tz_refresh) return true;
    if (request.cookies?.tz_csrf && request.headers['x-csrf-token'] === request.cookies.tz_csrf) return true;
    throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'CSRF 토큰이 올바르지 않습니다.' });
  }
}
Injectable()(CookieCsrfGuard);

class InternalGuard {
  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    const expected = process.env.INTERNAL_API_KEY || 'techzone-internal';
    if (request.headers['x-internal-key'] === expected) return true;
    throw new ForbiddenException({ code: 'FORBIDDEN' });
  }
}
Injectable()(InternalGuard);

function RoleGuard(role) {
  class RoleMixinGuard {
    canActivate(context) {
      const request = context.switchToHttp().getRequest();
      const adminRoles = ['admin', 'super_admin', 'cs', 'product_md', 'logistics', 'finance', 'viewer'];
      const allowed = role === 'admin'
        ? adminRoles.includes(request.user?.role)
        : request.user?.role === role;
      if (allowed) return true;
      throw new ForbiddenException({ code: 'FORBIDDEN' });
    }
  }
  Injectable()(RoleMixinGuard);
  return mixin(RoleMixinGuard);
}

function PermissionGuard(permission) {
  class PermissionMixinGuard {
    canActivate(context) {
      const request = context.switchToHttp().getRequest();
      if (
        request.user?.role === 'admin'
        || request.user?.adminRole === 'super_admin'
        || request.user?.permissions?.includes(permission)
      ) return true;
      throw new ForbiddenException({ code: 'MISSING_PERMISSION', details: { permission } });
    }
  }
  Injectable()(PermissionMixinGuard);
  return mixin(PermissionMixinGuard);
}

function OwnerGuard(param = 'userId') {
  class OwnerMixinGuard {
    canActivate(context) {
      const request = context.switchToHttp().getRequest();
      if (
        request.user?.sub === request.params[param]
        || request.user?.role === 'admin'
        || request.user?.adminRole === 'super_admin'
      ) return true;
      throw new ForbiddenException({
        code: 'RESOURCE_FORBIDDEN',
        message: '다른 사용자의 리소스에 접근할 수 없습니다.',
      });
    }
  }
  Injectable()(OwnerMixinGuard);
  return mixin(OwnerMixinGuard);
}

module.exports = {
  AuthGuard,
  CookieCsrfGuard,
  InternalGuard,
  OptionalAuthGuard,
  OwnerGuard,
  PermissionGuard,
  RoleGuard,
};
