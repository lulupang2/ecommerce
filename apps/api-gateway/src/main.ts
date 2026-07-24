import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { ApiGatewayModule } from './app.module';

void bootstrapNest({
  module: ApiGatewayModule,
  service: 'gateway',
  port: Number(process.env.PORT || 8080),
  docsPath: '/api/docs',
});
