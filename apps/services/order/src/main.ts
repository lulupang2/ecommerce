import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { OrderModule } from './app.module';

void bootstrapNest({
  module: OrderModule,
  service: 'order',
  port: Number(process.env.PORT || 3004),
});
