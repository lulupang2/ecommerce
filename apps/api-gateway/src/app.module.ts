import { Module } from '@nestjs/common';
import { ApiGatewayApplicationService } from './application/service';
import { GatewayController } from './presentation/gateway.controller';
import { ApiGatewayRepository } from './infrastructure/persistence/repository';

@Module({ controllers: [GatewayController], providers: [ApiGatewayApplicationService, ApiGatewayRepository] })
export class ApiGatewayModule {}
