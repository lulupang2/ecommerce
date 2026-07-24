import { Module } from '@nestjs/common';
import { AuthApplicationService } from './application/service';
import { AuthController } from './presentation/auth.controller';
import { AuthRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [AuthController], providers: [AuthApplicationService, AuthRepository] })
export class AuthModule {}
