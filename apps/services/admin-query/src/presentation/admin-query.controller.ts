import {
  Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import {
  AuthGuard, PermissionGuard, RoleGuard,
} from '@techzone/auth-platform/nest-guards';
import { IsOptional, IsString } from 'class-validator';
import { AdminQueryApplicationService } from '../application/service';

class ReasonDto {
  @IsOptional() @IsString() reason?: string;
}

const ADMIN_RESOURCES = [
  'admin/orders',
  'admin/products',
  'admin/inventory',
  'admin/shipments',
  'admin/returns',
  'admin/purchase-orders',
  'admin/members',
  'admin/reviews',
  'admin/audit-logs',
  'admin/dead-letters',
];

@Controller()
export class AdminQueryController {
  constructor(private readonly application: AdminQueryApplicationService) {}

  @Get('admin/dashboard')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('dashboard.read'))
  dashboard(@Query('from') from?: string, @Query('to') to?: string) {
    return this.application.dashboard(from, to);
  }

  @Get(ADMIN_RESOURCES)
  @UseGuards(AuthGuard, RoleGuard('admin'))
  listResource(@Req() request: any, @Query() query: any) {
    const resource = request.path.split('/').pop();
    return this.application.listResource(resource, query, request.user);
  }

  @Get('admin/alerts')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async alerts() { return { items: await this.application.alerts() }; }

  @Get('admin/warehouses')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  warehouses() { return this.application.warehouses(); }

  @Get('admin/roles')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async roles(@Req() request: any, @Res() response: any) {
    const authorization = request.headers.authorization
      || (request.cookies?.tz_access ? `Bearer ${request.cookies.tz_access}` : '');
    const result = await this.application.roles(authorization);
    return response.status(result.status).type('application/json').send(result.body);
  }

  @Post('admin/dead-letters/:id/reprocess')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('admin.manage'))
  async reprocess(
    @Param('id') id: string,
    @Body() body: ReasonDto,
    @Req() request: any,
  ) {
    const result = await this.application.reprocessDeadLetter(
      id,
      request.user.sub,
      body.reason,
    );
    if (!result) throw new NotFoundException({ code: 'DEAD_LETTER_NOT_FOUND' });
    return result;
  }

  @Post('admin/dead-letters/:id/discard')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('admin.manage'))
  async discard(
    @Param('id') id: string,
    @Body() body: ReasonDto,
    @Req() request: any,
  ) {
    const result = await this.application.discardDeadLetter(
      id,
      request.user.sub,
      body.reason,
    );
    if (!result) throw new NotFoundException({ code: 'DEAD_LETTER_NOT_FOUND' });
    return result;
  }

  @Get('admin/system-status')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('admin.manage'))
  systemStatus() { return this.application.systemStatus(); }

  @Post('admin/rebuild')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('admin.manage'))
  rebuild(@Body() body: ReasonDto, @Req() request: any) {
    return this.application.rebuild(request.user.sub, body.reason);
  }
}
