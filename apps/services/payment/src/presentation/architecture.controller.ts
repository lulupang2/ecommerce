import { Controller, Get } from '@nestjs/common';
import { PaymentApplicationService } from '../application/service';

@Controller('_architecture')
export class PaymentArchitectureController {
  constructor(private readonly application: PaymentApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
