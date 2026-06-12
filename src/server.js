'use strict';

const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { testConnection } = require('./config/db');

const start = async () => {
  try {
    await testConnection();

    const server = app.listen(env.port, () => {
      logger.info(`${env.serviceName} running on port ${env.port}`, {
        environment: env.nodeEnv,
        docs: `http://localhost:${env.port}/docs`,
        health: `http://localhost:${env.port}/health`,
      });
    });

    const shutdown = (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start service', { error: err.message });
    process.exit(1);
  }
};

start();
