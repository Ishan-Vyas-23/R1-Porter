"use strict";

const router = require("express").Router();
const controller = require("../controllers/wheelchair.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const { validate } = require("../middleware/validate.middleware");
const {
  createRequestSchema,
  updateStatusSchema,
  estimateCostSchema,
} = require("../validators/wheelchair.schemas");

const TOURIST = "TOURIST";
const ATTENDANT = "WHEELCHAIR_ATTENDANT";
const ADMIN = "ADMIN";
const STAFF = "STATION_STAFF";

// All routes require a valid JWT
router.use(authenticate);

/**
 * @openapi
 * /api/wheelchair/request:
 *   post:
 *     summary: Create a wheelchair assistance request
 *     tags: [Passenger]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               passenger_name:       { type: string }
 *               passenger_phone:      { type: string }
 *               station_code:         { type: string }
 *               platform_number:      { type: string }
 *               pickup_location:      { type: string }
 *               destination_location: { type: string }
 *               accessibility_notes:  { type: string }
 *     responses:
 *       201: { description: Request created }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 */
router.post(
  "/request",
  requireRole(TOURIST),
  validate(createRequestSchema),
  controller.createRequest,
);

/**
 * @openapi
 * /api/wheelchair/my-requests:
 *   get:
 *     summary: Get all requests made by the authenticated passenger
 *     tags: [Passenger]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of requests }
 */
router.get("/my-requests", requireRole(TOURIST), controller.getMyRequests);

/**
 * @openapi
 * /api/wheelchair/open-requests:
 *   get:
 *     summary: Get all PENDING requests (attendant view)
 *     tags: [Attendant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of open requests }
 */
router.get(
  "/open-requests",
  requireRole(ATTENDANT),
  controller.getOpenRequests,
);

/**
 * @openapi
 * /api/wheelchair/all:
 *   get:
 *     summary: Get all wheelchair requests (admin/staff only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: All requests }
 */
router.get("/all", requireRole(ADMIN, STAFF), controller.getAllRequests);

/**
 * @openapi
 * /api/wheelchair/{id}:
 *   get:
 *     summary: Get a single request by ID
 *     tags: [Passenger, Attendant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Request details }
 *       404: { description: Not found }
 */
router.post("/estimate", validate(estimateCostSchema), controller.estimateCost);
router.get(
  "/:id",
  requireRole(TOURIST, ATTENDANT, ADMIN, STAFF),
  controller.getRequestById,
);

/**
 * @openapi
 * /api/wheelchair/{id}/cancel:
 *   patch:
 *     summary: Cancel a PENDING request (passenger only)
 *     tags: [Passenger]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Request cancelled }
 *       409: { description: Cannot cancel in current state }
 */
router.patch("/:id/cancel", requireRole(TOURIST), controller.cancelRequest);

/**
 * @openapi
 * /api/wheelchair/{id}/accept:
 *   patch:
 *     summary: Accept a PENDING request (attendant only)
 *     tags: [Attendant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Request accepted }
 *       409: { description: Already accepted }
 */
router.patch("/:id/accept", requireRole(ATTENDANT), controller.acceptRequest);

/**
 * @openapi
 * /api/wheelchair/{id}/status:
 *   patch:
 *     summary: Update request status (attendant only)
 *     tags: [Attendant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [IN_PROGRESS, COMPLETED] }
 *               note:   { type: string }
 *     responses:
 *       200: { description: Status updated }
 *       409: { description: Invalid status transition }
 */
router.patch(
  "/:id/status",
  requireRole(ATTENDANT),
  validate(updateStatusSchema),
  controller.updateRequestStatus,
);

/**
 * @openapi
 * /api/wheelchair/{id}/complete:
 *   patch:
 *     summary: Mark a request as COMPLETED (attendant only)
 *     tags: [Attendant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Request completed }
 *       409: { description: Invalid transition }
 */
router.patch(
  "/:id/complete",
  requireRole(ATTENDANT),
  controller.completeRequest,
);
module.exports = router;
