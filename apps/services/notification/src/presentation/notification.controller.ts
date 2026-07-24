import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard, OwnerGuard } from '@techzone/auth-platform/nest-guards';
import { NotificationApplicationService } from '../application/service';

@Controller()
export class NotificationController {
  constructor(private readonly application: NotificationApplicationService) {}

  @Get('notifications/:userId')
  @UseGuards(AuthGuard, OwnerGuard('userId'))
  async list(@Param('userId') userId: string) {
    return { items: await this.application.list(userId) };
  }
}
