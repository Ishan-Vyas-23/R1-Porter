'use strict';

const { Pool } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  max: env.db.poolMax,
  idleTimeoutMillis: env.db.idleTimeoutMs,
  connectionTimeoutMillis: env.db.connectionTimeoutMs,
});

pool.on('connect', () => {
  logger.debug('New DB connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected DB pool error', { error: err.message });
});

const query = (text, params) => pool.query(text, params);

const getClient = () => pool.connect();

const testConnection = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    logger.info('Database connection verified');
  } finally {
    client.release();
  }
};

module.exports = { query, getClient, testConnection, pool };
