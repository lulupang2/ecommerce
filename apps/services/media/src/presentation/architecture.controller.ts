import { Controller, Get } from '@nestjs/common';
import { MediaApplicationService } from '../application/service';

@Controller('_architecture')
export class MediaArchitectureController {
  constructor(private readonly application: MediaApplicationService) {}
  @Get() describe() { return this.application.describe(); }
}
