"use strict";

const model = require("../models/wheelchair.model");
const statusService = require("./wheelchair-status.service");
const { REQUEST_STATUS, AUDIT_ACTIONS } = require("../utils/constants");
const logger = require("../utils/logger");

// ─── Helper: generate UUID ───────────────────────────────────────────────────
const newId = () => require("crypto").randomUUID();

// ─── Cost Calculator ─────────────────────────────────────────────────────────
const calculateCost = (serviceType, bagCount) => {
  const WHEELCHAIR_COST = 100;
  const COOLIE_PER_BAG = 30;

  switch (serviceType) {
    case "WHEELCHAIR":
      return WHEELCHAIR_COST;

    case "COOLIE":
      return bagCount * COOLIE_PER_BAG;

    case "BOTH":
      return WHEELCHAIR_COST + bagCount * COOLIE_PER_BAG;

    default:
      return WHEELCHAIR_COST;
  }
};

// ─── Helper: write audit log (fire-and-forget, non-blocking) ────────────────
const audit = (requestId, action, performedBy, oldStatus, newStatus, note) => {
  model
    .createAuditEntry({
      id: newId(),
      request_id: requestId,
      action,
      performed_by: performedBy,
      old_status: oldStatus,
      new_status: newStatus,
      note: note || null,
    })
    .catch((err) => {
      logger.error("Failed to write audit log", {
        error: err.message,
        requestId,
      });
    });
};

// ─── Passenger: Create Request ───────────────────────────────────────────────
const createRequest = async (user, body) => {
  const id = newId();

  const serviceType = body.service_type || "WHEELCHAIR";
  const bagCount = body.bag_count || 0;
  const pickupAddress = body.pickup_address || body.pickup_location || null;
  const dropAddress = body.drop_address || body.destination_location || null;

  const estimatedCost = calculateCost(serviceType, bagCount);

  const request = await model.createRequest({
    id,
    passenger_id: user.id,
    passenger_name: body.passenger_name || user.name || null,
    passenger_phone: body.passenger_phone || null,
    station_code: body.station_code || null,
    platform_number: body.platform_number || null,
    pickup_mode: body.pickup_mode || "MANUAL",
    pickup_address: pickupAddress,
    pickup_lat: body.pickup_lat ?? null,
    pickup_lng: body.pickup_lng ?? null,
    drop_address: dropAddress,
    drop_lat: body.drop_lat ?? null,
    drop_lng: body.drop_lng ?? null,
    pickup_location: body.pickup_location || pickupAddress,
    destination_location: body.destination_location || dropAddress,
    accessibility_notes: body.accessibility_notes || null,

    service_type: serviceType,
    bag_count: bagCount,
    estimated_cost: estimatedCost,
  });

  audit(
    id,
    AUDIT_ACTIONS.CREATED,
    user.id,
    null,
    REQUEST_STATUS.PENDING,
    `Request created (${serviceType})`,
  );

  logger.info("Wheelchair request created", {
    requestId: id,
    passengerId: user.id,
    serviceType,
    bagCount,
    estimatedCost,
  });

  return request;
};

// ─── Passenger: View Own Requests ────────────────────────────────────────────
const getMyRequests = async (userId) => {
  return model.findByPassenger(userId);
};

// ─── Get Request By ID ───────────────────────────────────────────────────────
const getRequestById = async (id) => {
  const request = await model.findById(id);

  if (!request) {
    const err = new Error("Wheelchair request not found");
    err.statusCode = 404;
    throw err;
  }

  return request;
};

// ─── Passenger: Cancel Request ───────────────────────────────────────────────
const cancelRequest = async (id, user) => {
  const request = await getRequestById(id);

  const { allowed, reason } = statusService.canPassengerCancel(
    request,
    user.id,
  );

  if (!allowed) {
    const err = new Error(reason);
    err.statusCode = 409;
    throw err;
  }

  const updated = await model.updateStatus(id, REQUEST_STATUS.CANCELLED, {
    cancelled_at: new Date().toISOString(),
  });

  audit(
    id,
    AUDIT_ACTIONS.CANCELLED,
    user.id,
    request.status,
    REQUEST_STATUS.CANCELLED,
    "Cancelled by passenger",
  );

  logger.info("Request cancelled", {
    requestId: id,
    userId: user.id,
  });

  return updated;
};

// ─── Attendant: Open Requests ────────────────────────────────────────────────
const getOpenRequests = async () => {
  return model.findOpenRequests();
};

// ─── Attendant: Accept Request ───────────────────────────────────────────────
const acceptRequest = async (id, user) => {
  const request = await getRequestById(id);

  const { allowed, reason } = statusService.canAttendantAccept(request);

  if (!allowed) {
    const err = new Error(reason);
    err.statusCode = 409;
    throw err;
  }

  const updated = await model.updateStatus(id, REQUEST_STATUS.ACCEPTED, {
    assigned_attendant_id: user.id,
    assigned_attendant_name: user.name || null,
  });

  audit(
    id,
    AUDIT_ACTIONS.ACCEPTED,
    user.id,
    request.status,
    REQUEST_STATUS.ACCEPTED,
    "Accepted by attendant",
  );

  logger.info("Request accepted", {
    requestId: id,
    attendantId: user.id,
  });

  return updated;
};

// ─── Attendant: Update Status ────────────────────────────────────────────────
const updateRequestStatus = async (id, user, body) => {
  const request = await getRequestById(id);

  const ownerCheck = statusService.canAttendantUpdate(request, user.id);

  if (!ownerCheck.allowed) {
    const err = new Error(ownerCheck.reason);
    err.statusCode = 403;
    throw err;
  }

  const transitionCheck = statusService.canTransition(
    request.status,
    body.status,
  );

  if (!transitionCheck.allowed) {
    const err = new Error(transitionCheck.reason);
    err.statusCode = 409;
    throw err;
  }

  const updated = await model.updateStatus(id, body.status);

  audit(
    id,
    AUDIT_ACTIONS.STATUS_UPDATED,
    user.id,
    request.status,
    body.status,
    body.note || null,
  );

  logger.info("Request status updated", {
    requestId: id,
    from: request.status,
    to: body.status,
  });

  return updated;
};

const estimateCost = (body) => {
  const serviceType = body.service_type || "WHEELCHAIR";
  const bagCount = body.bag_count || 0;

  return {
    service_type: serviceType,
    bag_count: bagCount,
    estimated_cost: calculateCost(serviceType, bagCount),
  };
};

// ─── Attendant: Complete Request ─────────────────────────────────────────────
const completeRequest = async (id, user) => {
  const request = await getRequestById(id);

  const ownerCheck = statusService.canAttendantUpdate(request, user.id);

  if (!ownerCheck.allowed) {
    const err = new Error(ownerCheck.reason);
    err.statusCode = 403;
    throw err;
  }

  const transitionCheck = statusService.canTransition(
    request.status,
    REQUEST_STATUS.COMPLETED,
  );

  if (!transitionCheck.allowed) {
    const err = new Error(transitionCheck.reason);
    err.statusCode = 409;
    throw err;
  }

  const updated = await model.updateStatus(id, REQUEST_STATUS.COMPLETED, {
    completed_at: new Date().toISOString(),
  });

  audit(
    id,
    AUDIT_ACTIONS.COMPLETED,
    user.id,
    request.status,
    REQUEST_STATUS.COMPLETED,
    "Marked complete by attendant",
  );

  logger.info("Request completed", {
    requestId: id,
    attendantId: user.id,
  });

  return updated;
};

// ─── Admin/Staff: All Requests ───────────────────────────────────────────────
const getAllRequests = async () => {
  return model.findAll();
};

module.exports = {
  createRequest,
  getMyRequests,
  getRequestById,
  cancelRequest,
  getOpenRequests,
  acceptRequest,
  updateRequestStatus,
  completeRequest,
  getAllRequests,
  estimateCost,
};
