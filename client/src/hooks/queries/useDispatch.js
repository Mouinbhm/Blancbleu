import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { aiService } from "../../services/api";
import { transportKeys } from "./useTransports";

export const dispatchKeys = {
  all:         ["dispatch"],
  explanation: (transportId) => ["dispatch", "explanation", transportId],
};

export function useDispatchExplanation(transportId) {
  return useQuery({
    queryKey: dispatchKeys.explanation(transportId),
    queryFn:  () => aiService.getDispatchExplanation(transportId).then((r) => r.data),
    enabled:  !!transportId,
  });
}

export function useDispatch() {
  const qc = useQueryClient();
  const invalidate = (transportId) => {
    if (transportId) {
      qc.invalidateQueries({ queryKey: transportKeys.detail(transportId) });
      qc.invalidateQueries({ queryKey: dispatchKeys.explanation(transportId) });
    }
  };
  return {
    recommander: useMutation({
      mutationFn: (transportId) => aiService.recommanderDispatch(transportId),
      onSuccess:  (_, transportId) => invalidate(transportId),
    }),
    accepter: useMutation({
      mutationFn: (transportId) => aiService.accepterRecommandation(transportId),
      onSuccess:  (_, transportId) => invalidate(transportId),
    }),
    refuser: useMutation({
      mutationFn: ({ transportId, raison }) => aiService.refuserRecommandation(transportId, raison),
      onSuccess:  (_, { transportId }) => invalidate(transportId),
    }),
  };
}
