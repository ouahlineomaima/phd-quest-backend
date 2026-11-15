import { Controller, Get } from '@nestjs/common';
import { DashboardService } from '../../business/services/dashboard.service';
@Controller('dashboard')
export class DashboardController { constructor(private readonly dashboard:DashboardService){} @Get() read(){return this.dashboard.read();} }
