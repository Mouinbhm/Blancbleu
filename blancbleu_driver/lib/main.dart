import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/date_symbol_data_local.dart';

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
  await GpsService.init();
  await ThemeNotifier.instance.init();
  await NotificationService.init();
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

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthCubit, AuthState>(
      listener: (context, state) {
        if (state is AuthSuccess) {
          SyncService.instance.sync();
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
