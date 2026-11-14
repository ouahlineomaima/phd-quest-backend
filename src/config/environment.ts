export function validateEnvironment(env: Record<string, unknown>) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const uri = String(env.MONGODB_URI ?? '');
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error('MONGODB_URI must be a MongoDB URI');
  const origins = String(env.CORS_ORIGINS ?? 'http://localhost:4200');
  for (const origin of origins.split(',')) {
    const url = new URL(origin.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.trim()) throw new Error('CORS_ORIGINS must contain comma-separated HTTP origins');
  }
  return { ...env, PORT: port, MONGODB_URI: uri, CORS_ORIGINS: origins };
}
