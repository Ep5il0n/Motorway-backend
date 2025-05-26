import { config } from 'dotenv';

const env = process.env.NODE_ENV;

config({ path: env ? `./env/.env.${process.env.NODE_ENV}` : '.env' });

export const failoverConfig = {
  FAILURE_THRESHOLD: parseFloat(process.env.FAILURE_THRESHOLD || '0.5'),
  REVERT_TIMEOUT_MS: parseInt(process.env.REVERT_TIMEOUT_MS || '180000', 10),
  MIN_REQUESTS_FOR_THRESHOLD: parseInt(process.env.MIN_REQUESTS_FOR_THRESHOLD || '10', 10),
};

export const providerConfig = {
  SUPER_CAR_API_URL: process.env.SUPER_CAR_API_URL || 'http://localhost:3001',
  PREMIUM_CAR_API_URL: process.env.PREMIUM_CAR_API_URL || 'http://localhost:3002',
};
