"use strict";

const { z } = require("zod");
const { REQUEST_STATUS } = require("../utils/constants");

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

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

    service_type: z
      .enum(["WHEELCHAIR", "COOLIE", "BOTH"])
      .default("WHEELCHAIR"),

    bag_count: z.number().int().min(0).max(20).default(0),
  })
  .superRefine((data, ctx) => {
    const pickupAddress = data.pickup_address || data.pickup_location;
    const dropAddress = data.drop_address || data.destination_location;

    if (data.pickup_mode === "CURRENT_LOCATION") {
      if (data.pickup_lat === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pickup_lat"],
          message: "pickup_lat is required when pickup_mode is CURRENT_LOCATION",
        });
      }

      if (data.pickup_lng === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pickup_lng"],
          message: "pickup_lng is required when pickup_mode is CURRENT_LOCATION",
        });
      }
    }

    if (data.pickup_mode === "MANUAL" && !pickupAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pickup_address"],
        message: "pickup_address is required when pickup_mode is MANUAL",
      });
    }

    if (!dropAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["drop_address"],
        message: "drop_address is required",
      });
    }
  })
  .transform((data) => ({
    ...data,
    pickup_address: data.pickup_address || data.pickup_location,
    drop_address: data.drop_address || data.destination_location,
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

const estimateCostSchema = z.object({
  service_type: z.enum(["WHEELCHAIR", "COOLIE", "BOTH"]),
  bag_count: z.number().int().min(0).max(20),
});

module.exports = {
  createRequestSchema,
  updateStatusSchema,
  estimateCostSchema,
};
