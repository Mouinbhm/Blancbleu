import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patientService } from "../../services/api";

export const patientKeys = {
  all:           ["patients"],
  list:          (filters) => ["patients", "list", filters || {}],
  detail:        (id)      => ["patients", "detail", id],
  fullProfile:   (id)      => ["patients", "full-profile", id],
  consentHistory:(id)      => ["patients", "consent-history", id],
  stats:         ()        => ["patients", "stats"],
};

export function usePatients(filters) {
  return useQuery({
    queryKey: patientKeys.list(filters),
    queryFn:  () => patientService.getAll(filters).then((r) => r.data),
  });
}

export function usePatient(id) {
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn:  () => patientService.getOne(id).then((r) => r.data),
    enabled:  !!id,
  });
}

export function usePatientFullProfile(id) {
  return useQuery({
    queryKey: patientKeys.fullProfile(id),
    queryFn:  () => patientService.getFullProfile(id).then((r) => r.data),
    enabled:  !!id,
  });
}

export function usePatientMutation() {
  const qc = useQueryClient();
  const invalidate = (id) => {
    if (id) {
      qc.invalidateQueries({ queryKey: patientKeys.detail(id) });
      qc.invalidateQueries({ queryKey: patientKeys.fullProfile(id) });
    }
    qc.invalidateQueries({ queryKey: patientKeys.all });
  };
  return {
    create: useMutation({ mutationFn: (d) => patientService.create(d),               onSuccess: () => invalidate() }),
    update: useMutation({ mutationFn: ({ id, data }) => patientService.update(id, data), onSuccess: (_, { id }) => invalidate(id) }),
    remove: useMutation({ mutationFn: (id) => patientService.delete(id),             onSuccess: () => invalidate() }),
  };
}
