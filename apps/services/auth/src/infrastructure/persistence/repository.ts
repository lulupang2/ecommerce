import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as {
  database(service: string): any;
};
import { users } from './schema';
const { registerReliability } = require('@techzone/messaging/bus') as {
  registerReliability(service: string, database: any): Promise<void>;
};

const ADMIN_ROLES = [
  ['super_admin', '슈퍼관리자', '모든 관리자 기능'],
  ['cs', 'CS 담당자', '회원·주문·반품 관리'],
  ['product_md', '상품 MD', '상품·가격·카테고리 관리'],
  ['logistics', '물류 담당자', '재고·입출고·배송 관리'],
  ['finance', '재무 담당자', '결제·환불·정산 조회'],
  ['viewer', '조회 전용', '관리자 데이터 조회'],
] as const;

const PERMISSIONS = [
  ['dashboard.read', '대시보드 조회'],
  ['orders.read', '주문 조회'],
  ['orders.update', '주문 변경'],
  ['products.read', '상품 조회'],
  ['products.update', '상품 변경'],
  ['inventory.read', '재고 조회'],
  ['inventory.update', '재고 변경'],
  ['fulfillment.update', '배송·반품 변경'],
  ['procurement.update', '발주 변경'],
  ['members.read', '회원 조회'],
  ['reviews.update', '리뷰 변경'],
  ['payments.refund', '환불 처리'],
  ['admin.manage', '관리자 권한 관리'],
  ['audit.read', '감사로그 조회'],
  ['export.data', '데이터 내보내기'],
] as const;

@Injectable()
export class AuthRepository {
  readonly owner = 'auth';
  readonly db = database('auth');

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('auth', this.db);
    for (const [code, name, description] of ADMIN_ROLES) {
      await this.db.query(
        `INSERT INTO roles(id,code,name,description) VALUES($1,$2,$3,$4)
         ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`,
        [crypto.randomUUID(), code, name, description],
      );
    }
    for (const [code, name] of PERMISSIONS) {
      await this.db.query(
        `INSERT INTO permissions(id,code,name) VALUES($1,$2,$3)
         ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name`,
        [crypto.randomUUID(), code, name],
      );
    }
    await this.seedRolePermissions();
  }

  private async seedRolePermissions(): Promise<void> {
    const mapping: Record<string, readonly string[]> = {
      super_admin: PERMISSIONS.map(item => item[0]),
      cs: ['dashboard.read', 'orders.read', 'orders.update', 'members.read', 'fulfillment.update'],
      product_md: ['dashboard.read', 'products.read', 'products.update', 'inventory.read'],
      logistics: ['dashboard.read', 'orders.read', 'inventory.read', 'inventory.update', 'fulfillment.update', 'procurement.update'],
      finance: ['dashboard.read', 'orders.read', 'payments.refund', 'audit.read', 'export.data'],
      viewer: ['dashboard.read', 'orders.read', 'products.read', 'inventory.read', 'members.read'],
    };
    for (const [role, permissions] of Object.entries(mapping)) {
      for (const permission of permissions) {
        await this.db.query(
          `INSERT INTO role_permissions(role_id,permission_id)
           SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2
           ON CONFLICT DO NOTHING`,
          [role, permission],
        );
      }
    }
  }

  async ensureAdmin(email: string, passwordHash: string, name: string): Promise<void> {
    let existing = await this.db.orm.select().from(users).where(eq(users.email, email)).limit(1);
    if (!existing[0]) {
      await this.db.orm.insert(users).values({
        id: crypto.randomUUID(),
        email,
        passwordHash,
        name,
        role: 'admin',
        status: 'active',
      });
      existing = await this.db.orm.select().from(users).where(eq(users.email, email)).limit(1);
    }
    await this.db.query(
      `INSERT INTO user_roles(user_id,role_id)
       SELECT $1,id FROM roles WHERE code='super_admin' ON CONFLICT DO NOTHING`,
      [existing[0].id],
    );
  }

  async createUser(value: {
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    phone?: string;
  }): Promise<void> {
    await this.db.orm.insert(users).values({
      ...value,
      role: 'customer',
      status: 'active',
    });
  }

  async findUserByEmail(email: string): Promise<any | null> {
    const rows = await this.db.orm.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] || null;
  }

  async findUserById(id: string): Promise<any | null> {
    const rows = await this.db.orm.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] || null;
  }

  async adminRoleFor(userId: string): Promise<any | null> {
    const result = await this.db.query(
      `SELECT r.code,r.name,array_remove(array_agg(p.code),NULL) permissions
       FROM user_roles ur
       JOIN roles r ON r.id=ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id=r.id
       LEFT JOIN permissions p ON p.id=rp.permission_id
       WHERE ur.user_id=$1 GROUP BY r.code,r.name LIMIT 1`,
      [userId],
    );
    return result.rows[0] || null;
  }

  async insertRefreshSession(value: {
    id: string;
    userId: string;
    familyId: string;
    tokenHash: string;
    clientType: string;
    refreshDays: number;
    ipAddress: string;
    userAgent: string;
  }, client?: any): Promise<void> {
    const query = client ? client.query.bind(client) : this.db.query;
    await query(
      `INSERT INTO refresh_sessions(
        id,user_id,family_id,token_hash,client_type,expires_at,ip_address,user_agent
      ) VALUES($1,$2,$3,$4,$5,now()+($6||' days')::interval,$7,$8)`,
      [
        value.id,
        value.userId,
        value.familyId,
        value.tokenHash,
        value.clientType,
        String(value.refreshDays),
        value.ipAddress,
        value.userAgent,
      ],
    );
  }

  async refreshSession(tokenHash: string): Promise<any | null> {
    const result = await this.db.query(
      `SELECT s.*,u.email,u.name,u.role,u.status
       FROM refresh_sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1`,
      [tokenHash],
    );
    return result.rows[0] || null;
  }

  async revokeFamily(familyId: string, client?: any): Promise<void> {
    const query = client ? client.query.bind(client) : this.db.query;
    await query(
      `UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1`,
      [familyId],
    );
  }

  async rotateSession(currentId: string, familyId: string, operation: (client: any) => Promise<string>): Promise<'reused' | 'rotated'> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT revoked_at FROM refresh_sessions WHERE id=$1 FOR UPDATE`,
        [currentId],
      );
      if (locked.rows[0]?.revoked_at) {
        await this.revokeFamily(familyId, client);
        await client.query('COMMIT');
        return 'reused';
      }
      const replacementId = await operation(client);
      await client.query(
        `UPDATE refresh_sessions SET revoked_at=now(),replaced_by=$2 WHERE id=$1`,
        [currentId, replacementId],
      );
      await client.query('COMMIT');
      return 'rotated';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeToken(tokenHash: string): Promise<void> {
    await this.db.query(
      `UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=$1`,
      [tokenHash],
    );
  }

  async users(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT u.id,u.email,u.name,u.phone,u.status,u.role,u.created_at AS "createdAt",
              r.code AS "adminRole",r.name AS "adminRoleName"
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id=u.id
       LEFT JOIN roles r ON r.id=ur.role_id
       ORDER BY u.created_at DESC`,
    );
    return result.rows;
  }

  async roles(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT r.id,r.code,r.name,r.description,
              array_remove(array_agg(p.code ORDER BY p.code),NULL) permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id=r.id
       LEFT JOIN permissions p ON p.id=rp.permission_id
       GROUP BY r.id ORDER BY r.name`,
    );
    return result.rows;
  }

  async changeRole(userId: string, roleCode: string): Promise<any | null> {
    const role = await this.db.query(`SELECT id,code FROM roles WHERE code=$1`, [roleCode]);
    if (!role.rows[0]) return null;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM user_roles WHERE user_id=$1`, [userId]);
      await client.query(`INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)`, [userId, role.rows[0].id]);
      await client.query(
        `UPDATE users SET role=$2,updated_at=now() WHERE id=$1`,
        [userId, role.rows[0].code === 'super_admin' ? 'admin' : role.rows[0].code],
      );
      await client.query('COMMIT');
      return role.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async internalUsers(): Promise<any[]> {
    return this.db.orm
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt));
  }

  async userExists(id: string): Promise<boolean> {
    const result = await this.db.query(`SELECT EXISTS(SELECT 1 FROM users WHERE id=$1) exists`, [id]);
    return Boolean(result.rows[0].exists);
  }
}
