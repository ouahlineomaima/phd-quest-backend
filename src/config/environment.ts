import { mongo } from 'mongoose';

export interface AppEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  MONGODB_URI: string;
  CORS_ORIGINS: string;
  BODY_LIMIT_BYTES: number;
  MONGO_CONNECT_TIMEOUT_MS: number;
  MONGO_RETRY_ATTEMPTS: number;
  MONGO_RETRY_DELAY_MS: number;
  APP_TIMEZONE: string;
}

export function validateEnvironment(env: Record<string, unknown>): AppEnvironment {
  const errors: string[] = [];
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key] ?? fallback;
    const value = typeof raw === 'number' ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < min || value > max) errors.push(`${key} must be an integer between ${min} and ${max}`);
    return value;
  };
  const mode = String(env.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(mode)) errors.push('NODE_ENV must be development, test or production');
  const uri = String(env.MONGODB_URI ?? '').trim();
  try {
    // Parse using the existing MongoDB driver without opening a connection.
    new mongo.MongoClient(uri);
  } catch {
    errors.push('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection URI');
  }
  const origins = String(env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map(origin => origin.trim());
  try {
    for (const origin of origins) {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error();
    }
  } catch {
    errors.push('CORS_ORIGINS must contain comma-separated HTTP origins without paths or credentials');
  }
  const result: AppEnvironment = {
    APP_TIMEZONE: String(env.APP_TIMEZONE ?? 'Africa/Casablanca'),
    NODE_ENV: mode as AppEnvironment['NODE_ENV'],
    PORT: integer('PORT', 3000, 1, 65535),
    MONGODB_URI: uri,
    CORS_ORIGINS: origins.join(','),
    BODY_LIMIT_BYTES: integer('BODY_LIMIT_BYTES', 1048576, 1024, 10485760),
    MONGO_CONNECT_TIMEOUT_MS: integer('MONGO_CONNECT_TIMEOUT_MS', 5000, 100, 60000),
    MONGO_RETRY_ATTEMPTS: integer('MONGO_RETRY_ATTEMPTS', 3, 0, 10),
    MONGO_RETRY_DELAY_MS: integer('MONGO_RETRY_DELAY_MS', 1000, 0, 30000),
  };
  try { new Intl.DateTimeFormat('en', { timeZone: result.APP_TIMEZONE }).format(); }
  catch { errors.push('APP_TIMEZONE must be a supported timezone such as Africa/Casablanca'); }
  // Never echo supplied values: URIs can contain credentials.
  if (errors.length) throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  return result;
}
