import { Module } from '@nestjs/common';
import { ApiGatewayApplicationService } from './application/service';
import { ApiGatewayArchitectureController } from './presentation/architecture.controller';
import { ApiGatewayRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [ApiGatewayArchitectureController], providers: [ApiGatewayApplicationService, ApiGatewayRepository] })
export class ApiGatewayModule {}
