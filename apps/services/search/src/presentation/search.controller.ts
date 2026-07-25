import { Controller, Get, Query, Res } from '@nestjs/common';
import { SearchApplicationService } from '../application/service';

@Controller()
export class SearchController {
  constructor(private readonly application: SearchApplicationService) {}

  @Get('search')
  async search(
    @Query('q') query = '',
    @Query('category') category = 'All',
    @Res() response: any,
  ) {
    const result = await this.application.search(query, category);
    return response.status(result.status).type(result.contentType).send(result.body);
  }
}
