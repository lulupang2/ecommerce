import { Controller, Get } from '@nestjs/common';
import { SearchApplicationService } from '../application/service';

@Controller('_architecture')
export class SearchArchitectureController {
  constructor(private readonly application: SearchApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
