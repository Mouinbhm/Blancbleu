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

export function useUpdateDispatchConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weights) => api.put("/ai/dispatch/config", { weights }).then((r) => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: dispatchConfigKeys.all }),
  });
}
