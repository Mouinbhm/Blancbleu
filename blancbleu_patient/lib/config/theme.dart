import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary = Color(0xFF0056CB);
  static const Color primaryContainer = Color(0xFF1D6EF5);
  static const Color background = Color(0xFFFAF8FF);
  static const Color surface = Color(0xFFFAF8FF);
  static const Color outlineVariant = Color(0xFFC2C6D7);
  static const Color secondary = Color(0xFF5C5F60);
  static const Color onSurface = Color(0xFF191B23);
  static const Color surfaceContainer = Color(0xFFECEDF9);
  static const Color primaryFixed = Color(0xFFDAE2FF);

  static ThemeData get lightTheme => ThemeData(
        useMaterial3: true,
        colorScheme: const ColorScheme.light(
          primary: primary,
          primaryContainer: primaryContainer,
          background: background,
          surface: surface,
          outlineVariant: outlineVariant,
          secondary: secondary,
          onSurface: onSurface,
        ),
        scaffoldBackgroundColor: background,
        fontFamily: 'Roboto',
      );
}
