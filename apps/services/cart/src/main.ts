import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { CartModule } from './app.module';

void bootstrapNest({
  module: CartModule,
  service: 'cart',
  port: Number(process.env.PORT || 3003),
});
