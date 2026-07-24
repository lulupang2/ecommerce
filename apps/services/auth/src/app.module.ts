import { Module } from '@nestjs/common';
import { AuthApplicationService } from './application/service';
import { AuthArchitectureController } from './presentation/architecture.controller';
import { AuthRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [AuthArchitectureController], providers: [AuthApplicationService, AuthRepository] })
export class AuthModule {}
