import { Controller, Get } from '@nestjs/common';
import { CatalogApplicationService } from '../application/service';

@Controller('_architecture')
export class CatalogArchitectureController {
  constructor(private readonly application: CatalogApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
