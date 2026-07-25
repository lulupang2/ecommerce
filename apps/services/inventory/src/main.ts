import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { InventoryModule } from './app.module';

void bootstrapNest({
  module: InventoryModule,
  service: 'inventory',
  port: Number(process.env.PORT || 3006),
});
