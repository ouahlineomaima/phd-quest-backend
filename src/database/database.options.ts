import { ConfigService } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';
import { Error as MongooseError } from 'mongoose';
import { AppEnvironment } from '../config/environment';

export function databaseOptions(config: ConfigService<AppEnvironment, true>): MongooseModuleOptions {
  const timeout = config.get('MONGO_CONNECT_TIMEOUT_MS', { infer: true });
  return {
    uri: config.get('MONGODB_URI', { infer: true }),
    connectTimeoutMS: timeout,
    serverSelectionTimeoutMS: timeout,
    socketTimeoutMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 0,
    retryAttempts: config.get('MONGO_RETRY_ATTEMPTS', { infer: true }),
    retryDelay: config.get('MONGO_RETRY_DELAY_MS', { infer: true }),
    verboseRetryLog: false,
    bufferCommands: false,
    autoCreate: false,
    autoIndex: config.get('NODE_ENV', { infer: true }) !== 'production',
    connectionErrorFactory: () => new MongooseError('MongoDB connection failed after configured attempts. Check database availability, rs0 readiness and MONGODB_URI.'),
  };
}
