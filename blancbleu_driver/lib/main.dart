import 'dart:async';

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
import 'services/gps_service.dart';
import 'shared/theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('fr_FR', null);
  try { await GpsService.init(); } catch (e) { debugPrint('[main] GpsService.init error: $e'); }
  try { await ThemeNotifier.instance.init(); } catch (e) { debugPrint('[main] ThemeNotifier.init error: $e'); }
  try { await NotificationService.init(); } catch (e) { debugPrint('[main] NotificationService.init error: $e'); }
  runApp(const BlancBleuDriverApp());
}

class BlancBleuDriverApp extends StatelessWidget {
  const BlancBleuDriverApp({super.key});

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
          theme: AppTheme.theme,
          darkTheme: AppTheme.darkTheme,
          themeMode: ThemeNotifier.instance.mode,
          home: const _Root(),
        ),
      ),
    );
  }
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
        } else if (state is AuthInitial) {
          // Sprint M2 — fermer la connexion au logout / session expirée
          SocketManager.instance.disconnect();
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
