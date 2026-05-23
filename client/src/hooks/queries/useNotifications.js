import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "../../services/api";

export const notificationKeys = {
  all:        ["notifications"],
  list:       (filters) => ["notifications", "list", filters || {}],
  unreadCount:()        => ["notifications", "unread-count"],
};

export function useNotificationsList(filters) {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn:  () => notificationService.getAll(filters).then((r) => r.data),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn:  () => notificationService.getUnreadCount().then((r) => r.data),
    refetchInterval: 30_000, // refresh discret chaque 30s
  });
}

export function useNotificationMutation() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: notificationKeys.all });
  return {
    markAsRead:    useMutation({ mutationFn: (id) => notificationService.markAsRead(id),    onSuccess: invalidate }),
    markAllAsRead: useMutation({ mutationFn: ()   => notificationService.markAllAsRead(),    onSuccess: invalidate }),
    archive:       useMutation({ mutationFn: (id) => notificationService.archive(id),       onSuccess: invalidate }),
    remove:        useMutation({ mutationFn: (id) => notificationService.delete(id),        onSuccess: invalidate }),
  };
}
