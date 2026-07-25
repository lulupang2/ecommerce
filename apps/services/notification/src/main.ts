import 'reflect-metadata';
import { bootstrapNest } from '@techzone/config/nest-runtime';
import { NotificationModule } from './app.module';

void bootstrapNest({
  module: NotificationModule,
  service: 'notification',
  port: Number(process.env.PORT || 3007),
});
