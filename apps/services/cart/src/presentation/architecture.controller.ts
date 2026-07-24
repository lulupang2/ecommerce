import { Controller, Get } from '@nestjs/common';
import { CartApplicationService } from '../application/service';

@Controller('_architecture')
export class CartArchitectureController {
  constructor(private readonly application: CartApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
