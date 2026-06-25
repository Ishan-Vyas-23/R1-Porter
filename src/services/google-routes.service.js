"use strict";

const env = require("../config/env");

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const parseDurationSeconds = (duration) => {
  if (typeof duration !== "string") return null;

  const match = duration.match(/^(\d+)s$/);
  return match ? Number(match[1]) : null;
};

const calculateRoute = async ({
  pickup_lat,
  pickup_lng,
  drop_lat,
  drop_lng,
}) => {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    env.googleRoutes.timeoutMs,
  );

  try {
    const response = await fetch(ROUTES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.googleRoutes.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: pickup_lat,
              longitude: pickup_lng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: drop_lat,
              longitude: drop_lng,
            },
          },
        },
        travelMode: "WALK",
      }),
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Google Routes API failed with ${response.status}: ${text}`,
      );
    }

    const data = await response.json();

    const route = data.routes && data.routes[0];

    if (!route) {
      throw new Error("Google Routes API returned no routes");
    }

    const distanceMeters = route.distanceMeters ?? null;

    const durationSeconds = parseDurationSeconds(route.duration);

    // Prevent fake "success" responses like:
    // distance = null, duration = 0
    if (distanceMeters === null || durationSeconds === null) {
      throw new Error("Google Routes API returned invalid route data");
    }

    return {
      distanceMeters,
      durationSeconds,
    };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  calculateRoute,
};
