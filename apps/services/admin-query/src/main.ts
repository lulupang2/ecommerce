import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { AdminQueryModule } from './app.module';

void bootstrapNest({
  module: AdminQueryModule,
  service: 'admin',
  port: Number(process.env.PORT || 3012),
});
