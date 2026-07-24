import { Controller, Get } from '@nestjs/common';
import { AuthApplicationService } from '../application/service';

@Controller('_architecture')
export class AuthArchitectureController {
  constructor(private readonly application: AuthApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
