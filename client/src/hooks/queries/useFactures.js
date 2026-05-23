import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { factureService } from "../../services/api";

export const factureKeys = {
  all:        ["factures"],
  list:       (filters) => ["factures", "list", filters || {}],
  detail:     (id)      => ["factures", "detail", id],
  byTransport:(id)      => ["factures", "by-transport", id],
  history:    (id)      => ["factures", "history", id],
  stats:      ()        => ["factures", "stats"],
};

export function useFactures(filters) {
  return useQuery({
    queryKey: factureKeys.list(filters),
    queryFn:  () => factureService.getAll(filters).then((r) => r.data),
  });
}

export function useFacture(id) {
  return useQuery({
    queryKey: factureKeys.detail(id),
    queryFn:  () => factureService.getOne(id).then((r) => r.data),
    enabled:  !!id,
  });
}

export function useFactureByTransport(transportId) {
  return useQuery({
    queryKey: factureKeys.byTransport(transportId),
    queryFn:  () => factureService.getByTransport(transportId).then((r) => r.data),
    enabled:  !!transportId,
  });
}

export function useFactureMutation() {
  const qc = useQueryClient();
  const invalidate = (id) => {
    if (id) qc.invalidateQueries({ queryKey: factureKeys.detail(id) });
    qc.invalidateQueries({ queryKey: factureKeys.all });
  };
  return {
    create:       useMutation({ mutationFn: (d) => factureService.create(d), onSuccess: () => invalidate() }),
    update:       useMutation({ mutationFn: ({ id, data }) => factureService.update(id, data), onSuccess: (_, { id }) => invalidate(id) }),
    issue:        useMutation({ mutationFn: (id) => factureService.issue(id), onSuccess: (_, id) => invalidate(id) }),
    refund:       useMutation({ mutationFn: ({ id, amount, reason }) => factureService.refund(id, amount, reason), onSuccess: (_, { id }) => invalidate(id) }),
    updateStatut: useMutation({ mutationFn: ({ id, statut }) => factureService.updateStatut(id, statut), onSuccess: (_, { id }) => invalidate(id) }),
    remove:       useMutation({ mutationFn: (id) => factureService.delete(id), onSuccess: () => invalidate() }),
  };
}
