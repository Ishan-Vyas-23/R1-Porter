'use strict';

const { VALID_TRANSITIONS, REQUEST_STATUS } = require('../utils/constants');

/**
 * Checks whether transitioning from currentStatus → nextStatus is allowed.
 * Returns { allowed: true } or { allowed: false, reason: string }
 */
const canTransition = (currentStatus, nextStatus) => {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    return {
      allowed: false,
      reason: `Cannot move from ${currentStatus} to ${nextStatus}. Valid next statuses: ${allowed.length ? allowed.join(', ') : 'none'}`,
    };
  }

  return { allowed: true };
};

/**
 * Validates that a TOURIST is only cancelling their own PENDING request.
 */
const canPassengerCancel = (request, userId) => {
  if (request.passenger_id !== userId) {
    return { allowed: false, reason: 'You can only cancel your own requests' };
  }

  if (request.status !== REQUEST_STATUS.PENDING) {
    return {
      allowed: false,
      reason: `Request cannot be cancelled. Current status is ${request.status}. Only PENDING requests can be cancelled.`,
    };
  }

  return { allowed: true };
};

/**
 * Validates that an attendant can accept a request.
 * Request must be PENDING and unassigned.
 */
const canAttendantAccept = (request) => {
  if (request.status !== REQUEST_STATUS.PENDING) {
    return {
      allowed: false,
      reason: `Request is already ${request.status} and cannot be accepted`,
    };
  }

  return { allowed: true };
};

/**
 * Validates that an attendant can update the status of a request.
 * Attendant must be the assigned attendant (unless request is still open).
 */
const canAttendantUpdate = (request, attendantId) => {
  if (
    request.assigned_attendant_id &&
    request.assigned_attendant_id !== attendantId
  ) {
    return {
      allowed: false,
      reason: 'This request is assigned to a different attendant',
    };
  }

  return { allowed: true };
};

module.exports = {
  canTransition,
  canPassengerCancel,
  canAttendantAccept,
  canAttendantUpdate,
};
