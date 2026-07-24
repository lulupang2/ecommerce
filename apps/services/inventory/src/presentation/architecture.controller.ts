import { Controller, Get } from '@nestjs/common';
import { InventoryApplicationService } from '../application/service';

@Controller('_architecture')
export class InventoryArchitectureController {
  constructor(private readonly application: InventoryApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
