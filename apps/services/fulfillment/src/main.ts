import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { FulfillmentModule } from './app.module';

void bootstrapNest({
  module: FulfillmentModule,
  service: 'fulfillment',
  port: Number(process.env.PORT || 3010),
});
