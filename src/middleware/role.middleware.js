'use strict';

const { forbidden } = require('../utils/response');

/**
 * Returns middleware that allows only the specified roles.
 * Must be used after authenticate middleware.
 *
 * Usage: requireRole('ADMIN', 'STATION_STAFF')
 */
const requireRole = (...allowedRoles) => (req, res, next) => {
  const userRole = req.user && req.user.role;

  if (!userRole || !allowedRoles.includes(userRole)) {
    return forbidden(res, `Access denied. Required role(s): ${allowedRoles.join(', ')}`);
  }

  next();
};

module.exports = { requireRole };
