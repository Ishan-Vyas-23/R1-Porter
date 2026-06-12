'use strict';

const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const wheelchairRoutes = require('./routes/wheelchair.routes');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: env.serviceName,
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'R1 Super App - Wheelchair Service',
      version: '1.0.0',
      description: 'Wheelchair assistance request management for Ahmedabad Junction',
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/wheelchair', wheelchairRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
