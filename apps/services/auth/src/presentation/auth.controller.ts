import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { LoginDto, RefreshDto, RegisterDto } from '@techzone/contracts/dtos';
import { IsIn } from 'class-validator';
import {
  AuthGuard,
  CookieCsrfGuard,
  InternalGuard,
  PermissionGuard,
  RoleGuard,
} from '@techzone/auth-platform/nest-guards';
import { AuthApplicationService } from '../application/service';

class ChangeRoleDto {
  @IsIn(['super_admin', 'cs', 'product_md', 'logistics', 'finance', 'viewer'])
  role!: string;
}

@Controller()
export class AuthController {
  constructor(private readonly application: AuthApplicationService) {}

  @Post('auth/register')
  async register(@Body() body: RegisterDto, @Req() request: any, @Res({ passthrough: true }) response: any) {
    return this.application.register(body, request, response);
  }

  @Post('auth/login')
  async login(@Body() body: LoginDto, @Req() request: any, @Res({ passthrough: true }) response: any) {
    return this.application.login(body, request, response);
  }

  @Post('auth/refresh')
  @UseGuards(CookieCsrfGuard)
  async refresh(@Body() body: RefreshDto, @Req() request: any, @Res({ passthrough: true }) response: any) {
    return this.application.refresh(body.refreshToken || request.cookies?.tz_refresh, request, response);
  }

  @Post('auth/logout')
  @HttpCode(204)
  @UseGuards(CookieCsrfGuard)
  async logout(@Body() body: RefreshDto, @Req() request: any, @Res({ passthrough: true }) response: any) {
    await this.application.logout(body.refreshToken || request.cookies?.tz_refresh, response);
  }

  @Get('auth/session')
  @UseGuards(AuthGuard)
  async session(@Req() request: any) {
    const result = await this.application.session(request.user.sub, request.cookies?.tz_csrf);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Get('.well-known/jwks.json')
  jwks() {
    return this.application.jwks();
  }

  @Get('auth/me')
  @UseGuards(AuthGuard)
  async me(@Req() request: any) {
    const result = await this.application.me(request.user.sub);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Get('auth/users')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async users() {
    return { items: await this.application.users() };
  }

  @Get('auth/roles')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async roles() {
    return { items: await this.application.roles() };
  }

  @Patch('auth/users/:id/role')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('admin.manage'))
  async changeRole(@Param('id') id: string, @Body() body: ChangeRoleDto, @Req() request: any) {
    const result = await this.application.changeRole(id, body.role, request.user.sub);
    if (!result) throw new ConflictException({ code: 'INVALID_ROLE' });
    return result;
  }

  @Get('internal/users')
  @UseGuards(InternalGuard)
  async internalUsers() {
    return { items: await this.application.internalUsers() };
  }

  @Get('internal/users/:id/exists')
  @UseGuards(InternalGuard)
  async userExists(@Param('id') id: string) {
    return { exists: await this.application.userExists(id) };
  }
}
