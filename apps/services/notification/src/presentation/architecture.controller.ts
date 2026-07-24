import { Controller, Get } from '@nestjs/common';
import { NotificationApplicationService } from '../application/service';

@Controller('_architecture')
export class NotificationArchitectureController {
  constructor(private readonly application: NotificationApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
