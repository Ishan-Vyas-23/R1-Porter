"use strict";

const { z } = require("zod");
const { REQUEST_STATUS } = require("../utils/constants");

const createRequestSchema = z.object({
  passenger_name: z.string().min(1).max(100).optional(),

  passenger_phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, "Invalid phone number")
    .optional(),

  station_code: z.string().max(20).optional(),

  platform_number: z.string().max(10).optional(),

  pickup_location: z.string().max(255).optional(),

  destination_location: z.string().max(255).optional(),

  accessibility_notes: z.string().max(1000).optional(),

  service_type: z.enum(["WHEELCHAIR", "COOLIE", "BOTH"]).default("WHEELCHAIR"),

  bag_count: z.number().int().min(0).max(20).default(0),
});

const updateStatusSchema = z.object({
  status: z.enum([
    REQUEST_STATUS.ACCEPTED,
    REQUEST_STATUS.IN_PROGRESS,
    REQUEST_STATUS.COMPLETED,
    REQUEST_STATUS.CANCELLED,
  ]),
  note: z.string().max(500).optional(),
});

const estimateCostSchema = z.object({
  service_type: z.enum(["WHEELCHAIR", "COOLIE", "BOTH"]),
  bag_count: z.number().int().min(0).max(20),
});

module.exports = {
  createRequestSchema,
  updateStatusSchema,
  estimateCostSchema,
};
