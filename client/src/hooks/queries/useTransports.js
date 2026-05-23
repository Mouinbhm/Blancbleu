import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transportService } from "../../services/api";

export const transportKeys = {
  all:      ["transports"],
  list:     (filters) => ["transports", "list", filters || {}],
  detail:   (id)      => ["transports", "detail", id],
  timeline: (id)      => ["transports", "timeline", id],
  pmt:      (id)      => ["transports", "pmt", id],
  stats:    ()        => ["transports", "stats"],
};

export function useTransports(filters) {
  return useQuery({
    queryKey: transportKeys.list(filters),
    queryFn: () => transportService.getAll(filters).then((r) => r.data),
  });
}

export function useTransport(id) {
  return useQuery({
    queryKey: transportKeys.detail(id),
    queryFn:  () => transportService.getOne(id).then((r) => r.data),
    enabled:  !!id,
  });
}

export function useTransportTimeline(id) {
  return useQuery({
    queryKey: transportKeys.timeline(id),
    queryFn:  () => transportService.getTimeline(id).then((r) => r.data),
    enabled:  !!id,
  });
}

export function useTransportPmt(id) {
  return useQuery({
    queryKey: transportKeys.pmt(id),
    queryFn:  () => transportService.getPmt(id).then((r) => r.data),
    enabled:  !!id,
  });
}

export function useTransportStats() {
  return useQuery({
    queryKey: transportKeys.stats(),
    queryFn:  () => transportService.getStats().then((r) => r.data),
  });
}

/**
 * Mutations Transport. Chaque mutation invalide les queries impactées.
 *
 *   const { transition, create, remove } = useTransportMutation();
 *   transition.mutate({ id, action: "confirmer", body: undefined });
 *   create.mutate(formData);
 */
export function useTransportMutation() {
  const qc = useQueryClient();
  const invalidate = (id) => {
    if (id) {
      qc.invalidateQueries({ queryKey: transportKeys.detail(id) });
      qc.invalidateQueries({ queryKey: transportKeys.timeline(id) });
    }
    qc.invalidateQueries({ queryKey: transportKeys.all });
  };

  return {
    transition: useMutation({
      mutationFn: ({ id, action, body }) => transportService[action](id, body),
      onSuccess: (_, { id }) => invalidate(id),
    }),
    create: useMutation({
      mutationFn: (data) => transportService.create(data),
      onSuccess: () => invalidate(),
    }),
    update: useMutation({
      mutationFn: ({ id, data }) => transportService.update(id, data),
      onSuccess: (_, { id }) => invalidate(id),
    }),
    remove: useMutation({
      mutationFn: (id) => transportService.delete(id),
      onSuccess: () => invalidate(),
    }),
  };
}
