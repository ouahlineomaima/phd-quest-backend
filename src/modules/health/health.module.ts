import { Module } from '@nestjs/common';
import { HealthController } from './api/controllers/health.controller';
import { HealthService } from './business/services/health.service';

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
