import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { prescriptionService } from "../../services/api";

export const prescriptionKeys = {
  all:               ["prescriptions"],
  list:              (filters) => ["prescriptions", "list", filters || {}],
  detail:            (id)      => ["prescriptions", "detail", id],
  byPatient:         (patientId) => ["prescriptions", "by-patient", patientId],
  pendingValidation: ()        => ["prescriptions", "pending-validation"],
  stats:             ()        => ["prescriptions", "stats"],
};

export function usePrescriptions(filters) {
  return useQuery({
    queryKey: prescriptionKeys.list(filters),
    queryFn:  () => prescriptionService.getAll(filters).then((r) => r.data),
  });
}

export function usePrescription(id) {
  return useQuery({
    queryKey: prescriptionKeys.detail(id),
    queryFn:  () => prescriptionService.getOne(id).then((r) => r.data),
    enabled:  !!id,
  });
}

export function usePrescriptionsByPatient(patientId) {
  return useQuery({
    queryKey: prescriptionKeys.byPatient(patientId),
    queryFn:  () => prescriptionService.getByPatient(patientId).then((r) => r.data),
    enabled:  !!patientId,
  });
}

export function usePrescriptionMutation() {
  const qc = useQueryClient();
  const invalidate = (id) => {
    if (id) qc.invalidateQueries({ queryKey: prescriptionKeys.detail(id) });
    qc.invalidateQueries({ queryKey: prescriptionKeys.all });
  };
  return {
    create:      useMutation({ mutationFn: (d) => prescriptionService.create(d),                onSuccess: () => invalidate() }),
    upload:      useMutation({ mutationFn: (fd) => prescriptionService.upload(fd),              onSuccess: () => invalidate() }),
    validate:    useMutation({ mutationFn: ({ id, contenuFinal }) => prescriptionService.validatePmt(id, contenuFinal), onSuccess: (_, { id }) => invalidate(id) }),
    reject:      useMutation({ mutationFn: ({ id, motif })        => prescriptionService.rejectPmt(id, motif),          onSuccess: (_, { id }) => invalidate(id) }),
    correct:     useMutation({ mutationFn: ({ id, donneesCorrigees, notes }) => prescriptionService.correct(id, donneesCorrigees, notes), onSuccess: (_, { id }) => invalidate(id) }),
    remove:      useMutation({ mutationFn: (id) => prescriptionService.delete(id),              onSuccess: () => invalidate() }),
  };
}
