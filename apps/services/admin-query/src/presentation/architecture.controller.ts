import { Controller, Get } from '@nestjs/common';
import { AdminQueryApplicationService } from '../application/service';

@Controller('_architecture')
export class AdminQueryArchitectureController {
  constructor(private readonly application: AdminQueryApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
