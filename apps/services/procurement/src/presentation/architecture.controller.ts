import { Controller, Get } from '@nestjs/common';
import { ProcurementApplicationService } from '../application/service';

@Controller('_architecture')
export class ProcurementArchitectureController {
  constructor(private readonly application: ProcurementApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
