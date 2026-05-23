import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vehicleService } from "../../services/api";

export const vehicleKeys = {
  all:           ["vehicles"],
  list:          (filters) => ["vehicles", "list", filters || {}],
  detail:        (id)      => ["vehicles", "detail", id],
  stats:         ()        => ["vehicles", "stats"],
  fleetDashboard:(params)  => ["vehicles", "fleet-dashboard", params || {}],
  analytics:     (id, p)   => ["vehicles", "analytics", id, p || null],
  availability:  (date)    => ["vehicles", "availability", date],
  upcomingMaint: (days)    => ["vehicles", "maintenance-upcoming", days],
};

export function useVehicles(filters) {
  return useQuery({
    queryKey: vehicleKeys.list(filters),
    // vehicleService.getAll resolves to { data: Vehicle[], pagination }
    queryFn:  () => vehicleService.getAll(filters).then((r) => r.data),
  });
}

export function useVehicle(id) {
  return useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn:  () => vehicleService.getOne(id).then((r) => r.data),
    enabled:  !!id,
  });
}

export function useVehicleStats() {
  return useQuery({
    queryKey: vehicleKeys.stats(),
    queryFn:  () => vehicleService.getStats().then((r) => r.data),
  });
}

export function useFleetDashboard(params) {
  return useQuery({
    queryKey: vehicleKeys.fleetDashboard(params),
    queryFn:  () => vehicleService.getFleetDashboard(params).then((r) => r.data),
  });
}

export function useVehicleAvailability(date) {
  return useQuery({
    queryKey: vehicleKeys.availability(date),
    queryFn:  () => vehicleService.getVehicleAvailability(date).then((r) => r.data),
    enabled:  !!date,
  });
}

export function useVehicleMutation() {
  const qc = useQueryClient();
  const invalidate = (id) => {
    if (id) qc.invalidateQueries({ queryKey: vehicleKeys.detail(id) });
    qc.invalidateQueries({ queryKey: vehicleKeys.all });
  };
  return {
    create:       useMutation({ mutationFn: (d) => vehicleService.create(d),       onSuccess: () => invalidate() }),
    update:       useMutation({ mutationFn: ({ id, data }) => vehicleService.update(id, data),       onSuccess: (_, { id }) => invalidate(id) }),
    updateStatut: useMutation({ mutationFn: ({ id, statut }) => vehicleService.updateStatut(id, statut), onSuccess: (_, { id }) => invalidate(id) }),
    remove:       useMutation({ mutationFn: (id) => vehicleService.delete(id),     onSuccess: () => invalidate() }),
  };
}
