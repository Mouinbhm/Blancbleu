import api from "./client";

export const geoService = {
  geocode:  (adresse) => api.get("/geo/geocode", { params: { adresse } }),
  distance: (lat1, lng1, lat2, lng2) =>
    api.get("/geo/distance", { params: { lat1, lng1, lat2, lng2 } }),
  vehiclesNearby: (lat, lng, limit = 5) =>
    api.get("/geo/vehicles/nearby", { params: { lat, lng, limit } }),
};
