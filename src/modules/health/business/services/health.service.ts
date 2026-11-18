import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../../../../config/environment';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  async check() {
    try {
      if (this.connection.readyState !== 1 || !this.connection.db)
        throw new Error('Database unavailable');
      await this.connection.db.admin().command(
        { ping: 1 },
        {
          timeoutMS: Math.min(this.config.get('MONGO_CONNECT_TIMEOUT_MS', { infer: true }), 2000),
        },
      );
      return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is unavailable',
        details: [{ status: 'error', database: 'down' }],
      });
    }
  }
}
