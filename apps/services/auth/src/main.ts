import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { AuthModule } from './app.module';

void bootstrapNest({
  module: AuthModule,
  service: 'auth',
  port: Number(process.env.PORT || 3001),
});
