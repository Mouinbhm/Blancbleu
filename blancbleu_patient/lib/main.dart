import 'package:flutter/material.dart';
import 'config/theme.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const BlancBleuApp());
}

class BlancBleuApp extends StatelessWidget {
  const BlancBleuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ambulances Blanc Bleu',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const LoginScreen(),
    );
  }
}
