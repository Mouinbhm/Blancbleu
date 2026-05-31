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
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/network/api_client.dart';
import 'core/network/socket_manager.dart';
import 'core/network/sync_service.dart';
import 'core/notifications/notification_service.dart';
import 'core/theme/theme_notifier.dart';
import 'features/auth/cubit/auth_cubit.dart';
import 'features/tournee/cubit/tournee_cubit.dart';
import 'features/shift/cubit/shift_cubit.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/tournee/screens/home_screen.dart';
import 'features/transport/screens/transport_detail_screen.dart';
import 'services/gps_service.dart';
import 'shared/theme/app_theme.dart';

/// Sprint M4 — Handler FCM background/terminated.
///
/// DOIT être une fonction top-level annotée `@pragma('vm:entry-point')` et
/// enregistrée AVANT `runApp` (sinon les push n'arrivent pas quand l'app est
/// tuée). Reste minimal — le log seul suffit ; l'affichage système du push
/// vient du bloc `notification` envoyé par le serveur.
@pragma('vm:entry-point')
Future<void> _fcmBackgroundHandler(RemoteMessage message) async {
  // M5 — masque `data` via BbLog (et no-op en release). Le bg handler n'a
  // pas besoin de logger le payload : FCM affiche déjà la notif système.
  BbLog.d('[FCM bg] ${message.messageId}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('fr_FR', null);
  try { await GpsService.init(); } catch (e) { debugPrint('[main] GpsService.init error: $e'); }
  try { await ThemeNotifier.instance.init(); } catch (e) { debugPrint('[main] ThemeNotifier.init error: $e'); }
  try { await NotificationService.init(); } catch (e) { debugPrint('[main] NotificationService.init error: $e'); }

  // Sprint M4 — Firebase Cloud Messaging (degradation gracieuse).
  // PushService.init() catch en interne — si la config Firebase est absente
  // (pas de google-services.json), FCM est desactivé runtime et l'app boote
  // normalement. attachHandlers (token + foreground + tap) sera branche dans
  // _Root.initState quand on a accès au context (deep-link).
  final fcmReady = await PushService.instance.init();
  if (fcmReady) {
    // ENREGISTREMENT DU BG HANDLER : doit etre AVANT runApp pour que les push
    // arrivent quand l'app est tuee. Le handler top-level (au-dessus) reste
    // minimal — l'affichage systeme vient du bloc `notification` envoye par
    // le serveur.
    FirebaseMessaging.onBackgroundMessage(_fcmBackgroundHandler);
  }

  // Sprint M5 — Sentry opt-in (DSN via --dart-define=SENTRY_DSN=...).
  // Sans DSN, runApp est lancé directement (dégradation gracieuse).
  const flavor = String.fromEnvironment('FLAVOR', defaultValue: 'dev');
  await SentryInit.runWithSentry(
    flavor: flavor,
    appRunner: () async {
      runApp(const BlancBleuDriverApp());
    },
  );

  // Sprint M5 — Détection root/jailbreak NON bloquante (warning + Sentry).
  // unawaited : ne retarde pas le boot, l'app tourne meme sur device compromis
  // (contexte intervention d'urgence).
  unawaited(DeviceIntegrity.reportIfCompromised(flavor: flavor));
}

class BlancBleuDriverApp extends StatelessWidget {
  const BlancBleuDriverApp({super.key});

  /// Sprint M4 — Navigator global accessible depuis n'importe où (handlers
  /// FCM, deep-link app tuee qui ne peuvent pas passer par context).
  static final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => AuthCubit()..tryAutoLogin()),
        BlocProvider(create: (_) => TourneeCubit()),
        BlocProvider(create: (_) => ShiftCubit()),
      ],
      child: ListenableBuilder(
        listenable: ThemeNotifier.instance,
        builder: (_, __) => MaterialApp(
          title: 'BlancBleu Driver',
          debugShowCheckedModeBanner: false,
          navigatorKey: navigatorKey,
          theme: AppTheme.theme,
          darkTheme: AppTheme.darkTheme,
          themeMode: ThemeNotifier.instance.mode,
          onGenerateRoute: _generateRoute,
          home: const _Root(),
        ),
      ),
    );
  }
}

/// Sprint M6 — Routes nommées driver. `home: _Root` reste la racine ; les
/// onGenerateRoute servent uniquement aux deep-links FCM (transport assigné,
/// chat dispatcher, prescription).
Route<dynamic>? _generateRoute(RouteSettings settings) {
  final name = settings.name ?? '';
  // /transport/<id>
  if (name.startsWith('/transport/')) {
    final id = name.substring('/transport/'.length);
    final args = <String, dynamic>{'_id': id, 'id': id};
    return MaterialPageRoute(
      builder: (_) => TransportDetailScreen(transport: args),
      settings: settings,
    );
  }
  // /chat/<conversationId> — pas encore implémenté côté driver, fallback Home.
  // Les routes inconnues retombent sur la home (évite un écran blanc si le
  // backend pousse un type non géré côté mobile).
  return null;
}

/// Sprint M6 — Router FCM (remplace _handleFcmDeepLink + snackbar). Mappe
/// chaque `data.type` vers une route nommée. Les transports/statuts
/// déclenchent en plus une sync pour rafraîchir la tournée locale.
final FcmRouter _fcmRouter = FcmRouter(
  navigatorKey: BlancBleuDriverApp.navigatorKey,
  routes: {
    'transport_assigned': (data) {
      SyncService.instance.sync();
      final id = fcmId(data, 'transportId');
      return id == null ? null : FcmRoute('/transport/$id');
    },
    'transport_status': (data) {
      SyncService.instance.sync();
      final id = fcmId(data, 'transportId');
      return id == null ? null : FcmRoute('/transport/$id');
    },
    'message_received': (data) {
      final convId = fcmId(data, 'conversationId');
      return convId == null ? null : FcmRoute('/chat/$convId');
    },
    'payment_completed': (data) {
      final id = fcmId(data, 'factureId');
      return id == null ? null : FcmRoute('/invoice/$id');
    },
    'new_prescription': (data) {
      final id = fcmId(data, 'prescriptionId');
      return id == null ? null : FcmRoute('/prescription/$id');
    },
    // shift_forced_end : pas de route — l'app refresh via SyncService au
    // foreground et l'utilisateur voit le shift fermé.
    'shift_forced_end': (data) {
      SyncService.instance.sync();
      return null;
    },
  },
);

void _handleFcmDeepLink(RemoteMessage msg) {
  BbLog.d('[FCM tap] type=${msg.data['type']}');
  _fcmRouter.route(msg);
}

class _Root extends StatefulWidget {
  const _Root();
  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> {
  // Sprint M2 — Listeners aux streams du SocketManager (foreground).
  StreamSubscription<Map<String, dynamic>>? _assignedSub;
  StreamSubscription<Map<String, dynamic>>? _cancelledSub;
  StreamSubscription<Map<String, dynamic>>? _msgSub;
  StreamSubscription<Map<String, dynamic>>? _shiftEndSub;

  @override
  void initState() {
    super.initState();
    // When the server returns 401/403, auto-logout and go back to login
    ApiClient.onUnauthorized = () {
      if (!mounted) return;
      context.read<AuthCubit>().logout();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Session expirée — veuillez vous reconnecter.'),
        backgroundColor: Colors.red,
        duration: Duration(seconds: 4),
      ));
    };

    // Sprint M2 — abonnement aux events server→driver via SocketManager.
    final mgr = SocketManager.instance;
    _assignedSub = mgr.onTransportAssigned.listen((data) {
      final numero = data['numero']?.toString() ?? data['transportId']?.toString() ?? '';
      NotificationService.showMessage(
        'Nouveau transport assigné : $numero',
        title: 'Nouvelle mission',
      );
      SyncService.instance.sync();
    });
    _cancelledSub = mgr.onTransportCancelled.listen((data) {
      final numero = data['numero']?.toString() ?? data['transportId']?.toString() ?? '';
      NotificationService.showMessage(
        'Transport annulé : $numero',
        title: 'Mission annulée',
      );
      SyncService.instance.sync();
    });
    _msgSub = mgr.onMessageDispatcher.listen((data) {
      final text = data['text']?.toString() ?? '';
      final from = data['fromNom']?.toString() ?? 'Dispatcher';
      if (text.isNotEmpty) {
        NotificationService.showMessage(text, title: from);
      }
    });
    _shiftEndSub = mgr.onShiftForcedEnd.listen((_) {
      NotificationService.showMessage(
        'Votre shift a été terminé par le dispatcher.',
        title: 'Shift terminé',
      );
      if (mounted) {
        context.read<ShiftCubit>().end();
      }
    });
  }

  @override
  void dispose() {
    ApiClient.onUnauthorized = null;
    _assignedSub?.cancel();
    _cancelledSub?.cancel();
    _msgSub?.cancel();
    _shiftEndSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthCubit, AuthState>(
      listener: (context, state) {
        if (state is AuthSuccess) {
          // Reset the logout guard so the new session works normally
          ApiClient.instance.resetSession();
          // Sprint M2 — ouvrir la connexion socket foreground APRES auth OK
          SocketManager.instance.connect();
          SyncService.instance.sync();

          // Sprint M4 — brancher FCM apres login : POST du token + handlers.
          // PushService est no-op si Firebase non configure (degradation).
          // Sprint M6 — rationale UI avant la popup permission systeme. Si
          // refus l'attach continue (le token n'arrivera juste pas).
          unawaited(PermissionHelper.requestNotificationsWithRationale(context));
          PushService.instance.attachHandlers(
            onTokenChanged: (token) async {
              await ApiClient.instance.registerFcmToken(token);
            },
            onForegroundMessage: (msg) {
              final n = msg.notification;
              final type = msg.data['type']?.toString();
              if (n != null) {
                if (type == 'transport_assigned' || type == 'shift_forced_end') {
                  NotificationService.showCritical(
                    n.body ?? '', title: n.title ?? 'BlancBleu Driver',
                  );
                } else {
                  NotificationService.showMessage(
                    n.body ?? '', title: n.title ?? 'BlancBleu',
                  );
                }
              }
            },
            onMessageTap: _handleFcmDeepLink,
          );
        } else if (state is AuthInitial) {
          // Sprint M2 — fermer la connexion au logout / session expirée
          SocketManager.instance.disconnect();
          // Sprint M4 — Best-effort : supprimer le token FCM serveur + device
          ApiClient.instance.deleteFcmToken();
          PushService.instance.deleteToken();
        }
      },
      builder: (context, state) {
        if (state is AuthSuccess) return HomeScreen(user: state.user);
        if (state is AuthLoading) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return const LoginScreen();
      },
    );
  }
}
