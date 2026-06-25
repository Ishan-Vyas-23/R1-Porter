"use strict";

const model = require("../models/wheelchair.model");
const statusService = require("./wheelchair-status.service");
const googleGeocodingService = require("./google-geocoding.service");
const googleRoutesService = require("./google-routes.service");
const env = require("../config/env");
const { REQUEST_STATUS, AUDIT_ACTIONS } = require("../utils/constants");
const logger = require("../utils/logger");

// Ahmedabad Junction scope only. Treat station as Large Station.
const STATION_CATEGORY = "LARGE";
const WHEELCHAIR_RATE = 135;
const COOLIE_RATE = 85;

// ─── Helper: generate UUID ───────────────────────────────────────────────────
const newId = () => require("crypto").randomUUID();

const normalizeCount = (value, fallback = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }

  return Math.trunc(numeric);
};

// ─── Cost Calculator ─────────────────────────────────────────────────────────
const calculateCostBreakdown = (serviceType, coolieCount) => {
  const normalizedCoolieCount = normalizeCount(coolieCount, 1);

  let wheelchairCharge = 0;
  let coolieCharge = 0;

  switch (serviceType) {
    case "WHEELCHAIR":
      wheelchairCharge = WHEELCHAIR_RATE;
      break;

    case "COOLIE":
      coolieCharge = COOLIE_RATE * normalizedCoolieCount;
      break;

    case "BOTH":
      wheelchairCharge = WHEELCHAIR_RATE;
      coolieCharge = COOLIE_RATE * normalizedCoolieCount;
      break;

    default:
      wheelchairCharge = WHEELCHAIR_RATE;
      break;
  }

  return {
    station_category: STATION_CATEGORY,
    wheelchair_charge: wheelchairCharge,
    coolie_count: normalizedCoolieCount,
    coolie_charge: coolieCharge,
    estimated_cost: wheelchairCharge + coolieCharge,
  };
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const isPresent = (value) =>
  value !== null && value !== undefined && value !== "";

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

const resolveLocation = async ({ label, address, lat, lng }) => {
  const resolvedAddress = address ? String(address).trim() : null;
  const numericLat = toNumberOrNull(lat);
  const numericLng = toNumberOrNull(lng);

  if (numericLat !== null && numericLng !== null) {
    return {
      address: resolvedAddress,
      lat: numericLat,
      lng: numericLng,
      geocode_status: "COORDINATES_PROVIDED",
      geocode_error: null,
    };
  }

  if (!resolvedAddress) {
    return {
      address: null,
      lat: null,
      lng: null,
      geocode_status: "MISSING",
      geocode_error: null,
    };
  }

  try {
    const geocoded =
      await googleGeocodingService.geocodeAddress(resolvedAddress);

    return {
      address: resolvedAddress,
      lat: geocoded.lat,
      lng: geocoded.lng,
      geocode_status: "SUCCESS",
      geocode_error: null,
    };
  } catch (err) {
    logger.warn("Google geocoding failed", {
      label,
      address: resolvedAddress,
      error: err.message,
    });

    return {
      address: resolvedAddress,
      lat: null,
      lng: null,
      geocode_status: "FAILED",
      geocode_error: err.message,
    };
  }
};

const buildRouteEstimate = async ({ pickup, drop }) => {
  if (pickup.geocode_status === "FAILED" || drop.geocode_status === "FAILED") {
    return {
      route_status: "GEOCODING_FAILED",
      route_error:
        pickup.geocode_error || drop.geocode_error || "Google geocoding failed",
    };
  }

  if (!env.googleRoutes.enabled) {
    return { route_status: "NOT_REQUESTED" };
  }

  const hasPickupCoordinates = isPresent(pickup.lat) && isPresent(pickup.lng);
  const hasDropCoordinates = isPresent(drop.lat) && isPresent(drop.lng);

  if (!hasPickupCoordinates || !hasDropCoordinates) {
    return { route_status: "SKIPPED_MISSING_COORDINATES" };
  }

  try {
    const route = await googleRoutesService.calculateRoute({
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      drop_lat: drop.lat,
      drop_lng: drop.lng,
    });

    return {
      route_distance_meters: route.distanceMeters,
      route_duration_seconds: route.durationSeconds,
      route_status: "SUCCESS",
      route_calculated_at: new Date().toISOString(),
      route_error: null,
    };
  } catch (err) {
    logger.warn("Google route calculation failed", {
      error: err.message,
    });

    return {
      route_status: "FAILED",
      route_error: err.message,
    };
  }
};

// ─── Passenger: Create Request ───────────────────────────────────────────────
const createRequest = async (user, body) => {
  const id = newId();

  const serviceType = body.service_type || "WHEELCHAIR";
  const bagCount = body.bag_count ?? 0;
  const coolieCount = body.coolie_count ?? 1;

  const pickupAddress = body.pickup_address || body.pickup_location || null;
  const dropAddress = body.drop_address || body.destination_location || null;

  const [pickupResolved, dropResolved] = await Promise.all([
    resolveLocation({
      label: "pickup",
      address: pickupAddress,
      lat: body.pickup_lat,
      lng: body.pickup_lng,
    }),
    resolveLocation({
      label: "drop",
      address: dropAddress,
      lat: body.drop_lat,
      lng: body.drop_lng,
    }),
  ]);

  const costBreakdown = calculateCostBreakdown(serviceType, coolieCount);
  const routeEstimate = await buildRouteEstimate({
    pickup: pickupResolved,
    drop: dropResolved,
  });

  const request = await model.createRequest({
    id,
    passenger_id: user.id,
    passenger_name: body.passenger_name || user.name || null,
    passenger_phone: body.passenger_phone || null,
    station_code: body.station_code || null,
    platform_number: body.platform_number || null,
    pickup_mode: body.pickup_mode || "MANUAL",

    pickup_address: pickupResolved.address,
    pickup_lat: pickupResolved.lat,
    pickup_lng: pickupResolved.lng,

    drop_address: dropResolved.address,
    drop_lat: dropResolved.lat,
    drop_lng: dropResolved.lng,

    pickup_location: body.pickup_location || pickupResolved.address,
    destination_location: body.destination_location || dropResolved.address,

    accessibility_notes: body.accessibility_notes || null,

    service_type: serviceType,
    bag_count: bagCount,
    coolie_count: costBreakdown.coolie_count,
    estimated_cost: costBreakdown.estimated_cost,
    ...routeEstimate,
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
    coolieCount: costBreakdown.coolie_count,
    estimatedCost: costBreakdown.estimated_cost,
    pickupGeocodeStatus: pickupResolved.geocode_status,
    dropGeocodeStatus: dropResolved.geocode_status,
    routeStatus: routeEstimate.route_status,
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
  const bagCount = body.bag_count ?? 0;
  const coolieCount = body.coolie_count ?? 1;

  const costBreakdown = calculateCostBreakdown(serviceType, coolieCount);

  return {
    service_type: serviceType,
    bag_count: bagCount,
    coolie_count: costBreakdown.coolie_count,
    station_category: costBreakdown.station_category,
    wheelchair_charge: costBreakdown.wheelchair_charge,
    coolie_charge: costBreakdown.coolie_charge,
    estimated_cost: costBreakdown.estimated_cost,
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
