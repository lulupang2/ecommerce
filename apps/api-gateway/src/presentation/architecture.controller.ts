import { Controller, Get } from '@nestjs/common';
import { ApiGatewayApplicationService } from '../application/service';

@Controller('_architecture')
export class ApiGatewayArchitectureController {
  constructor(private readonly application: ApiGatewayApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
