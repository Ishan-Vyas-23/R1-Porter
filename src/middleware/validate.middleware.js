'use strict';

const { badRequest } = require('../utils/response');

/**
 * Returns an Express middleware that validates req.body against a Zod schema.
 * On failure, responds 400 with field-level error details.
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return badRequest(res, 'Validation failed', details);
  }

  // Replace req.body with the parsed (and coerced) data
  req.body = result.data;
  next();
};

module.exports = { validate };
