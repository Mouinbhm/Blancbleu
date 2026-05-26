import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Sprint M4 — Service de notifications locales (driver).
///
/// Crée 2 canaux Android distincts (importance/son adaptés au type d'event) :
///   - `blancbleu_critical` (importance MAX) — mission assignée, shift forcé,
///     alerte SOS. Doit interrompre l'utilisateur.
///   - `blancbleu_messages` (importance HIGH) — message dispatcher (existait).
///
/// Utilisé soit en foreground (push FCM arrivé alors que l'app est ouverte ;
/// FCM n'affiche pas la notif système dans ce cas → l'app doit le faire),
/// soit pour les events socket-only (sans FCM derrière).
class NotificationService {
  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  // Sprint M4 — IDs de canal Android. Doivent matcher ceux envoyés par le
  // serveur via pushNotification.android.notification.channelId.
  static const String channelCritical = 'blancbleu_critical';
  static const String channelMessages = 'blancbleu_messages';

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

    // Sprint M4 — Création explicite des canaux (Android 8+) pour que les
    // push FCM utilisent le bon channelId même app tuée.
    final android8plus = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android8plus != null) {
      await android8plus.createNotificationChannel(const AndroidNotificationChannel(
        channelCritical,
        'Missions critiques',
        description: 'Nouvelles missions assignées, alertes urgentes (interruption sonore)',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      ));
      await android8plus.createNotificationChannel(const AndroidNotificationChannel(
        channelMessages,
        'Messages dispatcher',
        description: 'Messages reçus du dispatcher',
        importance: Importance.high,
        playSound: true,
      ));
    }
  }

  /// Affiche une notif locale "message" (canal messages).
  static Future<void> showMessage(String body, {String title = 'Dispatcher'}) async {
    await _plugin.show(
      42,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          channelMessages,
          'Messages dispatcher',
          channelDescription: 'Messages reçus du dispatcher',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
    );
  }

  /// Sprint M4 — Affiche une notif locale critique (canal max importance).
  /// Utilisée pour les push FCM `transport_assigned` / `shift_forced_end`
  /// reçus en foreground (où FCM n'affiche pas tout seul).
  static Future<void> showCritical(String body, {required String title, int id = 100}) async {
    await _plugin.show(
      id,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          channelCritical,
          'Missions critiques',
          channelDescription: 'Nouvelles missions assignées, alertes urgentes',
          importance: Importance.max,
          priority: Priority.max,
          icon: '@mipmap/ic_launcher',
          // RGPD : visibility public OK car le body reste générique
          // (cf. transportLifecycle: "Transport TRS-..." sans nom patient).
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
}
