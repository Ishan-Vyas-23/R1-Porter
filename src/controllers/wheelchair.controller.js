"use strict";

const service = require("../services/wheelchair.service");
const { success, created, notFound, badRequest } = require("../utils/response");
const logger = require("../utils/logger");

// ─── Passenger Controllers ───────────────────────────────────────────────────

const createRequest = async (req, res, next) => {
  try {
    const request = await service.createRequest(req.user, req.body);
    return created(res, request, "Wheelchair request submitted successfully");
  } catch (err) {
    next(err);
  }
};

const getMyRequests = async (req, res, next) => {
  try {
    const requests = await service.getMyRequests(req.user.id);
    return success(res, requests, "Requests fetched successfully");
  } catch (err) {
    next(err);
  }
};

const getRequestById = async (req, res, next) => {
  try {
    const request = await service.getRequestById(req.params.id);

    // TOURIST can only view their own request
    if (req.user.role === "TOURIST" && request.passenger_id !== req.user.id) {
      return notFound(res, "Wheelchair request not found");
    }

    return success(res, request, "Request fetched successfully");
  } catch (err) {
    next(err);
  }
};

const cancelRequest = async (req, res, next) => {
  try {
    const updated = await service.cancelRequest(req.params.id, req.user);
    return success(res, updated, "Request cancelled successfully");
  } catch (err) {
    next(err);
  }
};

// ─── Attendant Controllers ───────────────────────────────────────────────────

const getOpenRequests = async (req, res, next) => {
  try {
    const requests = await service.getOpenRequests();
    return success(res, requests, "Open requests fetched successfully");
  } catch (err) {
    next(err);
  }
};

const acceptRequest = async (req, res, next) => {
  try {
    const updated = await service.acceptRequest(req.params.id, req.user);
    return success(res, updated, "Request accepted successfully");
  } catch (err) {
    next(err);
  }
};

const updateRequestStatus = async (req, res, next) => {
  try {
    const updated = await service.updateRequestStatus(
      req.params.id,
      req.user,
      req.body,
    );
    return success(res, updated, "Request status updated successfully");
  } catch (err) {
    next(err);
  }
};

const completeRequest = async (req, res, next) => {
  try {
    const updated = await service.completeRequest(req.params.id, req.user);
    return success(res, updated, "Request marked as completed");
  } catch (err) {
    next(err);
  }
};

// ─── Admin/Staff Controllers ─────────────────────────────────────────────────

const getAllRequests = async (req, res, next) => {
  try {
    const requests = await service.getAllRequests();
    return success(res, requests, "All requests fetched successfully");
  } catch (err) {
    next(err);
  }
};

const estimateCost = async (req, res, next) => {
  try {
    const result = service.estimateCost(req.body);

    return success(res, result, "Cost estimated successfully");
  } catch (err) {
    next(err);
  }
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
