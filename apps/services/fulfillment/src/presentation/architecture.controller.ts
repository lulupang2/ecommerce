import { Controller, Get } from '@nestjs/common';
import { FulfillmentApplicationService } from '../application/service';

@Controller('_architecture')
export class FulfillmentArchitectureController {
  constructor(private readonly application: FulfillmentApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
