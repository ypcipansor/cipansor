"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NotificationPreferencesDTO,
  UpdateNotificationPreferencesInput,
} from "@cipansor/shared";
import { notificationsService } from "@/services/notifications.service";

const KEY = ["notification-preferences"] as const;

/** The signed-in person's notification preferences, as stored on the server. */
export function useNotificationPreferences() {
  return useQuery<NotificationPreferencesDTO>({
    queryKey: KEY,
    queryFn: () => notificationsService.getPreferences(),
  });
}

/**
 * Save a change. The server answers with what it stored, which becomes the
 * cached value — the page then shows the saved state, not the one it sent.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateNotificationPreferencesInput) =>
      notificationsService.updatePreferences(changes),
    onSuccess: (saved) => queryClient.setQueryData(KEY, saved),
  });
}
