import { Controller, Get } from '@nestjs/common';
import { OrderApplicationService } from '../application/service';

@Controller('_architecture')
export class OrderArchitectureController {
  constructor(private readonly application: OrderApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
