import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "../../services/api";

export const analyticsKeys = {
  all:        ["analytics"],
  dashboard:  ()      => ["analytics", "dashboard"],
  transports: (jours) => ["analytics", "transports", jours],
  flotte:     ()      => ["analytics", "flotte"],
  historique: (jours) => ["analytics", "historique", jours],
  prediction: (jours) => ["analytics", "prediction-flotte", jours],
};

export function useAnalyticsDashboard() {
  return useQuery({
    queryKey: analyticsKeys.dashboard(),
    queryFn:  () => analyticsService.dashboard().then((r) => r.data),
  });
}

export function useAnalyticsTransports(jours = 30) {
  return useQuery({
    queryKey: analyticsKeys.transports(jours),
    queryFn:  () => analyticsService.transports(jours).then((r) => r.data),
  });
}

export function useAnalyticsFlotte() {
  return useQuery({
    queryKey: analyticsKeys.flotte(),
    queryFn:  () => analyticsService.flotte().then((r) => r.data),
  });
}

export function useAnalyticsHistorique(jours = 30) {
  return useQuery({
    queryKey: analyticsKeys.historique(jours),
    queryFn:  () => analyticsService.historique(jours).then((r) => r.data),
  });
}

export function usePredictionFlotte(jours = 7) {
  return useQuery({
    queryKey: analyticsKeys.prediction(jours),
    queryFn:  () => analyticsService.predictionFlotte(jours).then((r) => r.data),
  });
}
