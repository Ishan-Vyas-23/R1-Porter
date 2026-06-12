"use strict";

const db = require("../config/db");

// ─── Wheelchair Requests ─────────────────────────────────────────────────────

const createRequest = async (fields) => {
  const {
    id,
    passenger_id,
    passenger_name,
    passenger_phone,
    station_code,
    platform_number,
    pickup_mode,
    pickup_address,
    pickup_lat,
    pickup_lng,
    drop_address,
    drop_lat,
    drop_lng,
    pickup_location,
    destination_location,
    accessibility_notes,

    service_type,
    bag_count,
    estimated_cost,
  } = fields;

  const { rows } = await db.query(
    `INSERT INTO wheelchair_requests (
       id,
       passenger_id,
       passenger_name,
       passenger_phone,
       station_code,
       platform_number,
       pickup_mode,
       pickup_address,
       pickup_lat,
       pickup_lng,
       drop_address,
       drop_lat,
       drop_lng,
       pickup_location,
       destination_location,
       accessibility_notes,
       service_type,
       bag_count,
       estimated_cost,
       status
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'PENDING'
     )
     RETURNING *`,
    [
      id,
      passenger_id,
      passenger_name || null,
      passenger_phone || null,
      station_code || null,
      platform_number || null,
      pickup_mode || "MANUAL",
      pickup_address || null,
      pickup_lat ?? null,
      pickup_lng ?? null,
      drop_address || null,
      drop_lat ?? null,
      drop_lng ?? null,
      pickup_location || null,
      destination_location || null,
      accessibility_notes || null,

      service_type || "WHEELCHAIR",
      bag_count || 0,
      estimated_cost || 0,
    ],
  );

  return rows[0];
};

const findById = async (id) => {
  const { rows } = await db.query(
    "SELECT * FROM wheelchair_requests WHERE id = $1",
    [id],
  );

  return rows[0] || null;
};

const findByPassenger = async (passengerId) => {
  const { rows } = await db.query(
    `SELECT *
     FROM wheelchair_requests
     WHERE passenger_id = $1
     ORDER BY created_at DESC`,
    [passengerId],
  );

  return rows;
};

const findOpenRequests = async () => {
  const { rows } = await db.query(
    `SELECT *
     FROM wheelchair_requests
     WHERE status = 'PENDING'
     ORDER BY created_at ASC`,
  );

  return rows;
};

const findAll = async () => {
  const { rows } = await db.query(
    `SELECT *
     FROM wheelchair_requests
     ORDER BY created_at DESC`,
  );

  return rows;
};

const updateStatus = async (id, status, extra = {}) => {
  const {
    assigned_attendant_id = undefined,
    assigned_attendant_name = undefined,
    cancelled_at = undefined,
    completed_at = undefined,
  } = extra;

  const { rows } = await db.query(
    `UPDATE wheelchair_requests
     SET status = $1,
         assigned_attendant_id   = COALESCE($2, assigned_attendant_id),
         assigned_attendant_name = COALESCE($3, assigned_attendant_name),
         cancelled_at            = COALESCE($4, cancelled_at),
         completed_at            = COALESCE($5, completed_at),
         updated_at              = NOW()
     WHERE id = $6
     RETURNING *`,
    [
      status,
      assigned_attendant_id || null,
      assigned_attendant_name || null,
      cancelled_at || null,
      completed_at || null,
      id,
    ],
  );

  return rows[0] || null;
};

// ─── Audit Log ───────────────────────────────────────────────────────────────

const createAuditEntry = async (fields) => {
  const { id, request_id, action, performed_by, old_status, new_status, note } =
    fields;

  await db.query(
    `INSERT INTO wheelchair_request_audit
       (id, request_id, action, performed_by, old_status, new_status, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      request_id,
      action,
      performed_by,
      old_status || null,
      new_status || null,
      note || null,
    ],
  );
};

module.exports = {
  createRequest,
  findById,
  findByPassenger,
  findOpenRequests,
  findAll,
  updateStatus,
  createAuditEntry,
};
