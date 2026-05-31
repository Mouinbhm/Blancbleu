import 'dart:async';

import 'package:bb_core/bb_core.dart'
    show
        BbLog,
        PushService,
        RemoteMessage,
        FirebaseMessaging,
        SentryInit,
        DeviceIntegrity,
        PermissionHelper,
        FcmRouter,
        FcmRoute,
        fcmId;
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import 'config/stripe_config.dart';
import 'config/theme.dart';
import 'screens/factures_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/prescriptions_screen.dart';
import 'screens/transport_detail_screen.dart';
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
  const flavor = String.fromEnvironment('FLAVOR', defaultValue: 'dev');
  await SentryInit.runWithSentry(
    flavor: flavor,
    appRunner: () async {
      runApp(const BlancBleuApp());
    },
  );

  // Sprint M5 — Détection root/jailbreak NON bloquante (warning + Sentry).
  // unawaited : ne retarde pas le boot (contexte intervention d'urgence).
  unawaited(DeviceIntegrity.reportIfCompromised(flavor: flavor));
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
      onGenerateRoute: _generateRoute,
      home: const _AuthGate(),
    );
  }
}

/// Sprint M6 — Routes nommées patient. La home reste `_AuthGate` ; les
/// onGenerateRoute servent au deep-link FCM (mes courses, factures, PMT).
Route<dynamic>? _generateRoute(RouteSettings settings) {
  final name = settings.name ?? '';
  if (name.startsWith('/my-transport/')) {
    final id = name.substring('/my-transport/'.length);
    return MaterialPageRoute(
      builder: (_) => TransportDetailScreen(transportId: id),
      settings: settings,
    );
  }
  if (name.startsWith('/invoice/')) {
    // Pas d'écran détail facture en patient → on ouvre la liste qui scroll
    // jusqu'à la facture. Compromis acceptable, à raffiner quand l'écran
    // détail existera.
    return MaterialPageRoute(
      builder: (_) => const FacturesScreen(),
      settings: settings,
    );
  }
  if (name.startsWith('/prescription/')) {
    return MaterialPageRoute(
      builder: (_) => const PrescriptionsScreen(),
      settings: settings,
    );
  }
  return null;
}

/// Sprint M4 — Branche les handlers FCM patient (token POST + foreground notif
/// + tap deep-link). Appele apres login/register reussi ET au boot si deja
/// loggé. No-op si Firebase non configure (PushService.init() a renvoye false).
///
/// Sprint M6 — si un BuildContext est passe, demande la permission de
/// notifications avec rationale UI avant d'attacher les handlers. Sans
/// context (cold start sans UI), on attache silencieusement et la permission
/// sera demandee au prochain login.
void attachPatientFcmHandlers({BuildContext? context}) {
  if (context != null && context.mounted) {
    unawaited(PermissionHelper.requestNotificationsWithRationale(context));
  }
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

/// Sprint M6 — Router FCM côté patient. Les routes ciblent /my-transport/:id
/// (cycle de vie de SA course), /invoice/:id (paiement encaissé) et
/// /prescription/:id (PMT créée ou validée).
final FcmRouter _fcmRouter = FcmRouter(
  navigatorKey: BlancBleuApp.navigatorKey,
  routes: {
    'transport_assigned': (data) {
      final id = fcmId(data, 'transportId');
      return id == null ? null : FcmRoute('/my-transport/$id');
    },
    'transport_status': (data) {
      final id = fcmId(data, 'transportId');
      return id == null ? null : FcmRoute('/my-transport/$id');
    },
    'payment_completed': (data) {
      final id = fcmId(data, 'factureId');
      return id == null ? null : FcmRoute('/invoice/$id');
    },
    'facture': (data) {
      // Alias legacy : ancien type "facture" → idem payment_completed.
      final id = fcmId(data, 'factureId');
      return id == null ? null : FcmRoute('/invoice/$id');
    },
    'new_prescription': (data) {
      final id = fcmId(data, 'prescriptionId');
      return id == null ? null : FcmRoute('/prescription/$id');
    },
    'message_received': (data) {
      final convId = fcmId(data, 'conversationId');
      return convId == null ? null : FcmRoute('/chat/$convId');
    },
  },
);

void _handleFcmDeepLink(RemoteMessage msg) {
  BbLog.d('[FCM tap patient] type=${msg.data['type']}');
  _fcmRouter.route(msg);
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
    // demarrage de l'app sans attendre un nouveau login. Sprint M6 — passe
    // le context pour que la rationale UI s'affiche au boot si la permission
    // n'a jamais ete demandee.
    if (loggedIn) {
      attachPatientFcmHandlers(context: context);
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
