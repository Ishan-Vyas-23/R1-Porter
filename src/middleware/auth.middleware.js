"use strict";

const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { unauthorized } = require("../utils/response");
const logger = require("../utils/logger");

/**
 * Verifies the Bearer JWT from the Authorization header.
 * Attaches decoded user payload to req.user on success.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorized(res, "Missing or malformed Authorization header");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.jwt.secret);

    req.user = {
      ...decoded,
      id: decoded.sub,
    };
    next();
  } catch (err) {
    logger.warn("JWT verification failed", { error: err.message });

    if (err.name === "TokenExpiredError") {
      return unauthorized(res, "Token has expired");
    }
    return unauthorized(res, "Invalid token");
  }
};

module.exports = { authenticate };
