/**
 * Hook Web Push — gère la souscription PushManager du navigateur.
 *
 * Cycle :
 *   1. enabled       → service worker actif + Notification supportée
 *   2. permission    → "default" | "granted" | "denied"
 *   3. isSubscribed  → existence d'une subscription locale
 *   4. subscribe()   → demande permission + crée sub + envoie au backend
 *   5. unsubscribe() → désinscrit côté navigateur + supprime côté backend
 *
 * Le backend expose :
 *   GET    /api/notifications/push/vapid-public-key
 *   POST   /api/notifications/push/subscribe
 *   DELETE /api/notifications/push/unsubscribe
 */

import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePushNotifications() {
  const supported = typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;

  const [permission, setPermission] = useState(
    supported ? Notification.permission : "denied",
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Détecte l'état initial
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => setIsSubscribed(false));
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) {
      setError("Web Push non supporté par ce navigateur");
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Permission refusée");
        return false;
      }

      const { data } = await api.get("/notifications/push/vapid-public-key");
      const publicKey = data.publicKey;
      if (!publicKey) throw new Error("VAPID public key indisponible");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await api.post("/notifications/push/subscribe", { subscription: sub.toJSON() });
      setIsSubscribed(true);
      return true;
    } catch (e) {
      setError(e.response?.data?.message || e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return false;
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await api.delete("/notifications/push/unsubscribe", { data: { endpoint } });
      }
      setIsSubscribed(false);
      return true;
    } catch (e) {
      setError(e.response?.data?.message || e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return {
    supported,
    permission,         // "default" | "granted" | "denied"
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}
