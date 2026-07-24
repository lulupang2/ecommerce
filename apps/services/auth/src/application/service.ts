import {
  ConflictException,
  HttpException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthRepository } from '../infrastructure/persistence/repository';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { publish } = require('@techzone/messaging/bus') as {
  publish(event: string, payload: Record<string, unknown>): Promise<void>;
};
const {
  accessCookieOptions,
  publicJwks,
  refreshCookieOptions,
  signAccessToken,
} = require('@techzone/auth-platform/tokens') as {
  accessCookieOptions(): Record<string, unknown>;
  publicJwks(): unknown;
  refreshCookieOptions(): Record<string, unknown>;
  signAccessToken(payload: Record<string, unknown>): string;
};
const { hit, clear } = require('@techzone/auth-platform/rate-limit') as {
  hit(key: string, options: Record<string, number>): Promise<any>;
  clear(key: string): Promise<void>;
};

@Injectable()
export class AuthApplicationService implements OnModuleInit {
  private readonly refreshDays = 14;

  constructor(private readonly repository: AuthRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      await this.repository.ensureAdmin(
        email,
        await bcrypt.hash(password, 10),
        process.env.ADMIN_NAME || 'TECHZONE Admin',
      );
    }
  }

  jwks(): unknown {
    return publicJwks();
  }

  private hashToken(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private publicUser(user: any, adminRole: any) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      adminRole: adminRole?.code || null,
      permissions: adminRole?.permissions || [],
    };
  }

  private async issueSession(
    user: any,
    adminRole: any,
    request: any,
    response: any,
    familyId = crypto.randomUUID(),
    client: any = null,
  ): Promise<any> {
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      adminRole: adminRole?.code,
      permissions: adminRole?.permissions || [],
    });
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const refreshId = crypto.randomUUID();
    const clientType = request.headers['x-client-platform'] === 'capacitor' ? 'capacitor' : 'web';
    await this.repository.insertRefreshSession({
      id: refreshId,
      userId: user.id,
      familyId,
      tokenHash: this.hashToken(refreshToken),
      clientType,
      refreshDays: this.refreshDays,
      ipAddress: request.ip,
      userAgent: String(request.headers['user-agent'] || '').slice(0, 500),
    }, client);
    const csrfToken = crypto.randomBytes(24).toString('base64url');
    if (clientType === 'web') {
      response.cookie('tz_access', accessToken, accessCookieOptions());
      response.cookie('tz_refresh', refreshToken, refreshCookieOptions());
      response.cookie('tz_csrf', csrfToken, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: this.refreshDays * 24 * 60 * 60_000,
      });
    }
    return {
      accessToken,
      ...(clientType === 'capacitor' ? { refreshToken } : {}),
      csrfToken,
      refreshId,
      familyId,
    };
  }

  async register(input: any, request: any, response: any): Promise<any> {
    const user = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      role: 'customer',
    };
    try {
      await this.repository.createUser({
        id: user.id,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        name: input.name,
        ...(input.phone ? { phone: input.phone } : {}),
      });
    } catch {
      throw new ConflictException({ code: 'EMAIL_EXISTS', message: '이미 사용 중인 이메일입니다.' });
    }
    await publish('user.registered', {
      userId: user.id,
      email: input.email,
      role: 'customer',
      name: input.name,
    });
    return { user, ...(await this.issueSession(user, null, request, response)) };
  }

  async login(input: any, request: any, response: any): Promise<any> {
    const loginKey = `auth:login:${String(input.email).toLowerCase()}:${request.ip}`;
    const attempt = await hit(loginKey, {
      limit: 5,
      windowSeconds: 15 * 60,
      lockSeconds: 15 * 60,
    });
    if (!attempt.allowed) {
      throw new HttpException({
        code: 'LOGIN_LOCKED',
        message: '로그인 시도가 너무 많습니다.',
        details: { retryAfter: attempt.retryAfter },
      }, 429);
    }
    const user = await this.repository.findUserByEmail(input.email);
    if (!user || user.status !== 'active' || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호를 확인해 주세요.',
      });
    }
    await clear(loginKey);
    const adminRole = await this.repository.adminRoleFor(user.id);
    return {
      user: this.publicUser(user, adminRole),
      ...(await this.issueSession(user, adminRole, request, response)),
    };
  }

  async refresh(rawToken: string | undefined, request: any, response: any): Promise<any> {
    if (!rawToken) {
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_REQUIRED' });
    }
    const current = await this.repository.refreshSession(this.hashToken(rawToken));
    if (!current || current.expires_at <= new Date() || current.status !== 'active') {
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_INVALID' });
    }
    if (current.revoked_at) {
      await this.repository.revokeFamily(current.family_id);
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_REUSED' });
    }
    const user = {
      id: current.user_id,
      email: current.email,
      name: current.name,
      role: current.role,
    };
    const adminRole = await this.repository.adminRoleFor(user.id);
    let session: any;
    const rotation = await this.repository.rotateSession(
      current.id,
      current.family_id,
      async client => {
        session = await this.issueSession(user, adminRole, request, response, current.family_id, client);
        return session.refreshId;
      },
    );
    if (rotation === 'reused') {
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_REUSED' });
    }
    return { user: this.publicUser(user, adminRole), ...session };
  }

  async logout(rawToken: string | undefined, response: any): Promise<void> {
    if (rawToken) await this.repository.revokeToken(this.hashToken(rawToken));
    response.clearCookie('tz_access', accessCookieOptions());
    response.clearCookie('tz_refresh', refreshCookieOptions());
    response.clearCookie('tz_csrf', { path: '/' });
  }

  async session(userId: string, csrfToken: string | undefined): Promise<any> {
    const user = await this.repository.findUserById(userId);
    if (!user) return null;
    const adminRole = await this.repository.adminRoleFor(user.id);
    return { user: this.publicUser(user, adminRole), csrfToken: csrfToken || null };
  }

  async me(userId: string): Promise<any | null> {
    const user = await this.repository.findUserById(userId);
    if (!user) return null;
    const adminRole = await this.repository.adminRoleFor(user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      adminRole: adminRole?.code || null,
      permissions: adminRole?.permissions || [],
    };
  }

  users(): Promise<any[]> {
    return this.repository.users();
  }

  roles(): Promise<any[]> {
    return this.repository.roles();
  }

  async changeRole(userId: string, roleCode: string, actorId: string): Promise<any | null> {
    const role = await this.repository.changeRole(userId, roleCode);
    if (!role) return null;
    await publish('admin.role_changed', { userId, role: role.code, actorId });
    return { id: userId, role: role.code };
  }

  internalUsers(): Promise<any[]> {
    return this.repository.internalUsers();
  }

  userExists(id: string): Promise<boolean> {
    return this.repository.userExists(id);
  }
}
