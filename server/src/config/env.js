import 'dotenv/config';

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stayora',
  jwtSecret: process.env.JWT_SECRET || 'stayora-development-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  origins: parseOrigins(process.env.CLIENT_ORIGINS) || [],
  isProduction: process.env.NODE_ENV === 'production',
};
