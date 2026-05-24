import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { aiService } from "../../services/api/ai";
import { getSocket } from "../../services/socketClient";

export const autoDispatchKeys = {
  all:    ["ai", "autoDispatch"],
  queue:  () => ["ai", "autoDispatch", "queue"],
  count:  () => ["ai", "autoDispatch", "count"],
};

// ── File des propositions pending ───────────────────────────────────────────
export function useAutoDispatchQueue() {
  const qc = useQueryClient();

  // Refresh temps réel via Socket.IO
  useEffect(() => {
    const socket = getSocket();
    if (!socket?.on) return undefined;

    const handler = () => {
      qc.invalidateQueries({ queryKey: autoDispatchKeys.all });
    };
    socket.on("autoDispatch:proposal_created",  handler);
    socket.on("autoDispatch:auto_assigned",     handler);
    socket.on("autoDispatch:proposal_decided",  handler);

    return () => {
      socket.off("autoDispatch:proposal_created",  handler);
      socket.off("autoDispatch:auto_assigned",     handler);
      socket.off("autoDispatch:proposal_decided",  handler);
    };
  }, [qc]);

  return useQuery({
    queryKey: autoDispatchKeys.queue(),
    queryFn:  () => aiService.getAutoDispatchQueue().then((r) => r.data),
    staleTime: 15_000,
  });
}

// ── Compteur seul (badge sidebar) ───────────────────────────────────────────
export function useAutoDispatchQueueCount() {
  return useQuery({
    queryKey: autoDispatchKeys.count(),
    queryFn:  () => aiService.getAutoDispatchQueueCount().then((r) => r.data.count),
    staleTime: 30_000,
    refetchInterval: 60_000, // tick de sécurité si socket KO
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────
export function useAcceptAutoDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recId) => aiService.acceptAutoDispatchProposal(recId).then((r) => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: autoDispatchKeys.all }),
  });
}

export function useRejectAutoDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recId, raison }) =>
      aiService.rejectAutoDispatchProposal(recId, raison).then((r) => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: autoDispatchKeys.all }),
  });
}
