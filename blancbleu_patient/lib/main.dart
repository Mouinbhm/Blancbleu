import 'package:bb_core/bb_core.dart' show BbLog, PushService, RemoteMessage, FirebaseMessaging, SentryInit;
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import 'config/stripe_config.dart';
import 'config/theme.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';

/// Sprint M4 — Handler FCM background/terminated (patient).
/// Top-level + @pragma('vm:entry-point') obligatoire pour FCM.
@pragma('vm:entry-point')
Future<void> _fcmBackgroundHandler(RemoteMessage message) async {
  // M5 — no-op en release, pas de data brute dans le log (RGPD).
  BbLog.d('[FCM bg patient] ${message.messageId}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');
  Stripe.publishableKey = StripeConfig.publishableKey;
  await Stripe.instance.applySettings();

  // Sprint M4 — Notifications locales (canaux Android critiques).
  try { await NotificationService.init(); }
  catch (e) { debugPrint('[main] NotificationService.init error: $e'); }

  // Sprint M4 — Firebase Cloud Messaging (degradation gracieuse).
  // Sans google-services.json, init renvoie false et l'app tourne en
  // socket-only (le canal historique de tracking patient).
  final fcmReady = await PushService.instance.init();
  if (fcmReady) {
    FirebaseMessaging.onBackgroundMessage(_fcmBackgroundHandler);
  }

  // Sprint M5 — Sentry opt-in (DSN via --dart-define=SENTRY_DSN=...).
  // Sans DSN, runApp est lancé directement (dégradation gracieuse).
  await SentryInit.runWithSentry(
    flavor: const String.fromEnvironment('FLAVOR', defaultValue: 'dev'),
    appRunner: () async {
      runApp(const BlancBleuApp());
    },
  );
}

class BlancBleuApp extends StatelessWidget {
  const BlancBleuApp({super.key});

  /// Sprint M4 — Navigator global pour les handlers FCM (deep-link app tuee).
  static final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ambulances Blanc Bleu',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: AppTheme.lightTheme,
      home: const _AuthGate(),
    );
  }
}

/// Sprint M4 — Branche les handlers FCM patient (token POST + foreground notif
/// + tap deep-link). Appele apres login/register reussi ET au boot si deja
/// loggé. No-op si Firebase non configure (PushService.init() a renvoye false).
void attachPatientFcmHandlers() {
  PushService.instance.attachHandlers(
    onTokenChanged: (token) async {
      await ApiService.registerFcmToken(token);
    },
    onForegroundMessage: (msg) {
      final n = msg.notification;
      if (n == null) return;
      final type = msg.data['type']?.toString();
      if (type == 'transport_status' || type == 'transport_assigned') {
        NotificationService.showTransport(
          n.body ?? '', title: n.title ?? 'BlancBleu',
        );
      } else {
        NotificationService.showDefault(
          n.body ?? '', title: n.title ?? 'BlancBleu',
        );
      }
    },
    onMessageTap: _handleFcmDeepLink,
  );
}

/// Sprint M4 — Routing deep-link FCM (patient).
/// Pour M4 : feedback simple (snackbar). Routes nommees pleines arrivent
/// avec la migration des ecrans en CP3 du Sprint M3 (cubits + repositories).
void _handleFcmDeepLink(RemoteMessage msg) {
  final type = msg.data['type']?.toString();
  final transportId = msg.data['transportId']?.toString();
  // M5 — log type seulement (no-op release via BbLog).
  BbLog.d('[FCM tap patient] type=$type');

  final ctx = BlancBleuApp.navigatorKey.currentContext;
  if (ctx == null) return;
  final messenger = ScaffoldMessenger.maybeOf(ctx);
  if (messenger == null || type == null) return;

  String label;
  switch (type) {
    case 'transport_status':
      label = 'Mise à jour transport ${transportId ?? ""}';
      break;
    case 'transport_assigned':
      label = 'Véhicule attribué — transport ${transportId ?? ""}';
      break;
    case 'facture':
      label = 'Nouvelle facture disponible';
      break;
    default:
      label = 'Notification reçue';
  }
  messenger.showSnackBar(SnackBar(content: Text(label)));
}

class _AuthGate extends StatefulWidget {
  const _AuthGate();
  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final loggedIn = await ApiService.isLoggedIn();
    if (!mounted) return;

    // Sprint M4 — Si deja loggé, brancher FCM (token POST + handlers) au
    // demarrage de l'app sans attendre un nouveau login.
    if (loggedIn) {
      attachPatientFcmHandlers();
    }

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => loggedIn ? const HomeScreen() : const LoginScreen(),
      ),
    );
  }

  // Sprint M4 — utilise le helper top-level attachPatientFcmHandlers.

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppTheme.background,
      body: Center(child: CircularProgressIndicator(color: AppTheme.primary)),
    );
  }
}
