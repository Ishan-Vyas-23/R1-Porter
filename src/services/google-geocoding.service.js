"use strict";

const env = require("../config/env");

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const parseLatLng = (location) => {
  if (!location) return null;
  if (typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }

  return {
    lat: location.lat,
    lng: location.lng,
  };
};

const geocodeAddress = async (address) => {
  const trimmedAddress = typeof address === "string" ? address.trim() : "";

  if (!trimmedAddress) {
    throw new Error("Address is required for geocoding");
  }

  if (!env.googleRoutes?.apiKey) {
    throw new Error("Google Maps API key is missing");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    env.googleRoutes.timeoutMs || 3000,
  );

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set("address", trimmedAddress);
    url.searchParams.set("key", env.googleRoutes.apiKey);
    url.searchParams.set("components", "country:IN");

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Google Geocoding API failed with ${response.status}: ${text}`,
      );
    }

    const data = await response.json();

    if (data.status !== "OK") {
      const message =
        data.error_message || `Google Geocoding API returned ${data.status}`;
      throw new Error(message);
    }

    const result = data.results && data.results[0];

    if (!result) {
      throw new Error("No geocoding result found");
    }

    const types = result.types || [];

    if (
      types.includes("country") &&
      types.includes("political") &&
      types.length <= 2
    ) {
      throw new Error("Address resolved only to country level");
    }

    if (
      result.formatted_address &&
      result.formatted_address.trim().toLowerCase() === "india"
    ) {
      throw new Error("Address resolved only to India");
    }

    const location = result && result.geometry && result.geometry.location;
    const parsed = parseLatLng(location);
    if (!parsed) {
      throw new Error("Google Geocoding API returned invalid coordinates");
    }

    return {
      lat: parsed.lat,
      lng: parsed.lng,
      formattedAddress: result.formatted_address || trimmedAddress,
      placeId: result.place_id || null,
    };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  geocodeAddress,
};
