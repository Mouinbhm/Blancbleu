import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";

export const dispatchConfigKeys = {
  all:    ["ai", "dispatchConfig"],
  config: () => ["ai", "dispatchConfig", "config"],
};

export function useDispatchConfig() {
  return useQuery({
    queryKey: dispatchConfigKeys.config(),
    queryFn:  () => api.get("/ai/dispatch/config").then((r) => r.data),
  });
}

/**
 * Accepte soit (weights), soit ({ weights?, autoDispatch? }).
 * Rétro-compatible avec l'appel historique `update.mutateAsync(weights)`.
 */
export function useUpdateDispatchConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => {
      // Forme legacy : on reçoit directement l'objet weights
      const looksLikeWeights = payload && typeof payload === "object" &&
        ("distance" in payload || "vehicleTypeMatch" in payload);
      const body = looksLikeWeights ? { weights: payload } : payload;
      return api.put("/ai/dispatch/config", body).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dispatchConfigKeys.all }),
  });
}
