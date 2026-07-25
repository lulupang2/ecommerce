import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { PaymentModule } from './app.module';

void bootstrapNest({
  module: PaymentModule,
  service: 'payment',
  port: Number(process.env.PORT || 3005),
});
