'use strict';

require('dotenv').config();

const env = {
  port: parseInt(process.env.PORT, 10) || 4003,
  nodeEnv: process.env.NODE_ENV || 'development',
  serviceName: process.env.SERVICE_NAME || 'wheelchair-service',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'r1_wheelchair_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    idleTimeoutMs: parseInt(process.env.DB_POOL_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMs: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT, 10) || 2000,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'changeme',
    issuer: process.env.JWT_ISSUER || 'r1-auth-service',
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

if (env.nodeEnv === 'production') {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');
  if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD must be set in production');
}

module.exports = env;
