import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Sprint M4 — Service de notifications locales (patient).
///
/// Affiche les push FCM reçus en foreground (FCM n'affiche pas tout seul
/// dans ce cas). Crée un canal Android dédié `blancbleu_transport` pour
/// les events critiques côté patient (votre ambulance arrive).
class NotificationService {
  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  // Sprint M4 — IDs de canal Android (doivent matcher ceux envoyés par le
  // serveur via pushNotification.android.notification.channelId).
  static const String channelTransport = 'blancbleu_transport';
  static const String channelDefault   = 'blancbleu_default';

  static Future<void> init() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios     = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );

    // Sprint M4 — Création explicite des canaux (Android 8+).
    final android8plus = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android8plus != null) {
      await android8plus.createNotificationChannel(const AndroidNotificationChannel(
        channelTransport,
        'Suivi transport',
        description: 'Votre ambulance arrive, statut transport',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      ));
      await android8plus.createNotificationChannel(const AndroidNotificationChannel(
        channelDefault,
        'Notifications',
        description: 'Notifications BlancBleu',
        importance: Importance.defaultImportance,
      ));
    }
  }

  /// Sprint M4 — Affiche une notif locale "transport" (canal haute importance).
  /// RGPD : body générique (« Votre ambulance arrive », « Transport mis à jour »),
  /// pas de détails médicaux. visibility: public OK car le contenu est neutre.
  static Future<void> showTransport(String body, {required String title, int id = 200}) async {
    await _plugin.show(
      id,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          channelTransport,
          'Suivi transport',
          channelDescription: 'Votre ambulance arrive, statut transport',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          visibility: NotificationVisibility.public,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
    );
  }

  /// Affiche une notif générique (canal par défaut).
  static Future<void> showDefault(String body, {required String title, int id = 201}) async {
    await _plugin.show(
      id,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          channelDefault,
          'Notifications',
          channelDescription: 'Notifications BlancBleu',
          importance: Importance.defaultImportance,
          priority: Priority.defaultPriority,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: DarwinNotificationDetails(presentAlert: true, presentSound: true),
      ),
    );
  }
}
