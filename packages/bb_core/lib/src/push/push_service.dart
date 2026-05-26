/// Sprint M4 — Push service partagé entre les deux apps mobile.
///
/// Centralise la logique FCM commune :
///   - init Firebase **gracieuse** (try/catch — l'app ne crashe pas si la
///     config est absente, FCM reste désactivé).
///   - demande de permission notifications (iOS strict, Android 13+).
///   - récupération du token + abonnement `onTokenRefresh`.
///   - abonnement `onMessage` (foreground), `onMessageOpenedApp` (tap depuis
///     background), `getInitialMessage` (ouverture depuis app **tuée**).
///
/// L'app fournit :
///   - `onForegroundMessage` : afficher une notif locale (via flutter_local_notifications)
///   - `onTokenChanged` : enregistrer / re-enregistrer le token côté serveur
///   - `onMessageTap` : router vers le bon écran selon `data.type`
///
/// IMPORTANT : le handler **background** (app tuée, push arrive) DOIT être
/// déclaré comme fonction top-level annotée `@pragma('vm:entry-point')` dans
/// l'app, PAS dans ce package — c'est une contrainte de Flutter/FCM.
library;

import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool _fcmReady = false;
  bool get isReady => _fcmReady;

  String? _currentToken;
  String? get currentToken => _currentToken;

  StreamSubscription<String>? _tokenSub;
  StreamSubscription<RemoteMessage>? _msgSub;
  StreamSubscription<RemoteMessage>? _openSub;

  /// Initialise Firebase Core. À appeler depuis `main.dart` **avant** `runApp`.
  /// Renvoie `true` si init OK (config Firebase présente), `false` sinon.
  ///
  /// Ne lance JAMAIS d'exception : si la config est absente ou invalide,
  /// retourne false et l'app continue sans FCM.
  Future<bool> init() async {
    if (_fcmReady) return true;
    try {
      await Firebase.initializeApp();
      _fcmReady = true;
      debugPrint('[PushService] Firebase Core initialisé');
      return true;
    } catch (e) {
      debugPrint('[PushService] Firebase indisponible (pas de google-services.json ?) : $e');
      _fcmReady = false;
      return false;
    }
  }

  /// Demande la permission de notifications (iOS strict, Android 13+).
  /// No-op si Firebase n'est pas prêt.
  Future<bool> requestPermission() async {
    if (!_fcmReady) return false;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true, badge: true, sound: true,
      );
      final granted = settings.authorizationStatus == AuthorizationStatus.authorized ||
                      settings.authorizationStatus == AuthorizationStatus.provisional;
      debugPrint('[PushService] permission=${settings.authorizationStatus}');
      return granted;
    } catch (e) {
      debugPrint('[PushService] requestPermission erreur : $e');
      return false;
    }
  }

  /// Récupère le token FCM courant (peut être null sur iOS sans APNS).
  Future<String?> getToken() async {
    if (!_fcmReady) return null;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      _currentToken = token;
      return token;
    } catch (e) {
      debugPrint('[PushService] getToken erreur : $e');
      return null;
    }
  }

  /// Supprime le token FCM côté device (appel au logout).
  Future<void> deleteToken() async {
    if (!_fcmReady) return;
    try {
      await FirebaseMessaging.instance.deleteToken();
      _currentToken = null;
    } catch (e) {
      debugPrint('[PushService] deleteToken erreur : $e');
    }
  }

  /// Branche tous les handlers d'events FCM.
  ///
  /// - `onTokenChanged` : appelé au démarrage avec le token courant + à chaque
  ///   refresh. L'app POST ce token au backend.
  /// - `onForegroundMessage` : appelé quand un push arrive **app au premier
  ///   plan** (FCM n'affiche pas de notif système dans ce cas — c'est à l'app
  ///   d'utiliser flutter_local_notifications).
  /// - `onMessageTap` : appelé quand l'utilisateur tape sur la notif système
  ///   (app en background) OU au démarrage si l'app a été ouverte depuis une
  ///   notif (app tuée).
  Future<void> attachHandlers({
    Future<void> Function(String token)? onTokenChanged,
    void Function(RemoteMessage message)? onForegroundMessage,
    void Function(RemoteMessage message)? onMessageTap,
  }) async {
    if (!_fcmReady) return;

    // 1) Token initial + refresh
    final token = await getToken();
    if (token != null && onTokenChanged != null) {
      await onTokenChanged(token);
    }
    _tokenSub?.cancel();
    _tokenSub = FirebaseMessaging.instance.onTokenRefresh.listen((t) {
      _currentToken = t;
      debugPrint('[PushService] token refresh (POST backend)');
      if (onTokenChanged != null) onTokenChanged(t);
    });

    // 2) Messages foreground (l'app doit afficher la notif locale)
    _msgSub?.cancel();
    if (onForegroundMessage != null) {
      _msgSub = FirebaseMessaging.onMessage.listen(onForegroundMessage);
    }

    // 3) Tap sur notif depuis background (app ouverte)
    _openSub?.cancel();
    if (onMessageTap != null) {
      _openSub = FirebaseMessaging.onMessageOpenedApp.listen(onMessageTap);
    }

    // 4) Tap sur notif depuis app **tuée** (cold start)
    if (onMessageTap != null) {
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) {
        // Différer au prochain frame pour laisser l'UI s'initialiser avant nav.
        Future.microtask(() => onMessageTap(initial));
      }
    }
  }

  Future<void> dispose() async {
    await _tokenSub?.cancel();
    await _msgSub?.cancel();
    await _openSub?.cancel();
  }
}
