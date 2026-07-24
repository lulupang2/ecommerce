import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, RoleGuard } from '@techzone/auth-platform/nest-guards';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { MediaApplicationService } from '../application/service';

class UploadUrlDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;
  @IsString() @MaxLength(255)
  fileName!: string;
}

@Controller()
export class MediaController {
  constructor(private readonly application: MediaApplicationService) {}

  @Post('media/upload-url')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  createUpload(@Body() body: UploadUrlDto, @Req() request: any) {
    return this.application.createUpload(body, request.user.sub);
  }

  @Get('media/:id')
  async find(@Param('id') id: string) {
    const result = await this.application.find(id);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }
}
