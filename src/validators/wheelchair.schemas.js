"use strict";

const { z } = require("zod");
const { REQUEST_STATUS } = require("../utils/constants");

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);
const serviceTypeSchema = z.enum(["WHEELCHAIR", "COOLIE", "BOTH"]);
const coolieCountSchema = z.number().int().min(1).max(20).optional();

const createRequestSchema = z
  .object({
    passenger_name: z.string().min(1).max(100).optional(),

    passenger_phone: z
      .string()
      .regex(/^\+?[0-9]{7,15}$/, "Invalid phone number")
      .optional(),

    station_code: z.string().max(20).optional(),

    platform_number: z.string().max(10).optional(),

    pickup_mode: z.enum(["CURRENT_LOCATION", "MANUAL"]).default("MANUAL"),

    pickup_address: z.string().max(500).optional(),
    pickup_lat: latitudeSchema.optional(),
    pickup_lng: longitudeSchema.optional(),

    drop_address: z.string().max(500).optional(),
    drop_lat: latitudeSchema.optional(),
    drop_lng: longitudeSchema.optional(),

    pickup_location: z.string().max(255).optional(),
    destination_location: z.string().max(255).optional(),

    accessibility_notes: z.string().max(1000).optional(),

    service_type: serviceTypeSchema.default("WHEELCHAIR"),

    bag_count: z.number().int().min(0).max(20).default(0),

    coolie_count: coolieCountSchema,
  })
  .superRefine((data, ctx) => {
    const pickupAddress = data.pickup_address || data.pickup_location;
    const dropAddress = data.drop_address || data.destination_location;

    const hasPickupLat = data.pickup_lat !== undefined;
    const hasPickupLng = data.pickup_lng !== undefined;
    const hasDropLat = data.drop_lat !== undefined;
    const hasDropLng = data.drop_lng !== undefined;

    const hasPickupCoords = hasPickupLat && hasPickupLng;
    const hasDropCoords = hasDropLat && hasDropLng;

    if (hasPickupLat !== hasPickupLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasPickupLat ? ["pickup_lng"] : ["pickup_lat"],
        message: "pickup_lat and pickup_lng must be provided together",
      });
    }

    if (hasDropLat !== hasDropLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasDropLat ? ["drop_lng"] : ["drop_lat"],
        message: "drop_lat and drop_lng must be provided together",
      });
    }

    if (!pickupAddress && !hasPickupCoords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pickup_address"],
        message: "pickup_address or pickup coordinates are required",
      });
    }

    if (!dropAddress && !hasDropCoords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["drop_address"],
        message: "drop_address or drop coordinates are required",
      });
    }

    if (
      (data.service_type === "COOLIE" || data.service_type === "BOTH") &&
      data.coolie_count === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coolie_count"],
        message: "coolie_count is required for COOLIE and BOTH service types",
      });
    }
  })
  .transform((data) => ({
    ...data,
    bag_count: data.bag_count ?? 0,
    coolie_count: data.coolie_count ?? 1,
    pickup_address: data.pickup_address || data.pickup_location || null,
    drop_address: data.drop_address || data.destination_location || null,
    pickup_location: data.pickup_location || data.pickup_address || null,
    destination_location:
      data.destination_location || data.drop_address || null,
  }));

const updateStatusSchema = z.object({
  status: z.enum([
    REQUEST_STATUS.ACCEPTED,
    REQUEST_STATUS.IN_PROGRESS,
    REQUEST_STATUS.COMPLETED,
    REQUEST_STATUS.CANCELLED,
  ]),
  note: z.string().max(500).optional(),
});

const estimateCostSchema = z
  .object({
    service_type: serviceTypeSchema,
    bag_count: z.number().int().min(0).max(20).default(0),
    coolie_count: coolieCountSchema,
  })
  .superRefine((data, ctx) => {
    if (
      (data.service_type === "COOLIE" || data.service_type === "BOTH") &&
      data.coolie_count === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coolie_count"],
        message: "coolie_count is required for COOLIE and BOTH service types",
      });
    }
  })
  .transform((data) => ({
    ...data,
    bag_count: data.bag_count ?? 0,
    coolie_count: data.coolie_count ?? 1,
  }));

module.exports = {
  createRequestSchema,
  updateStatusSchema,
  estimateCostSchema,
};
