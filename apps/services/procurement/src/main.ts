import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { ProcurementModule } from './app.module';

void bootstrapNest({
  module: ProcurementModule,
  service: 'procurement',
  port: Number(process.env.PORT || 3011),
});
