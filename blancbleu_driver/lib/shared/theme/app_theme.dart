import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary    = Color(0xFF0D9488); // teal-600
  static const Color secondary  = Color(0xFF64748B); // slate-500
  static const Color onSurface  = Color(0xFF0F172A); // slate-900
  static const Color background = Color(0xFFF1F5F9);
  static const Color surface    = Colors.white;
  static const Color error      = Color(0xFFDC2626);
  static const Color warning    = Color(0xFFF59E0B);
  static const Color success    = Color(0xFF16A34A);

  // Dark palette
  static const Color _darkBg     = Color(0xFF1A1A2E);
  static const Color _darkCard   = Color(0xFF16213E);
  static const Color _darkBar    = Color(0xFF0F3460);
  static const Color _darkBorder = Color(0xFF1E3A5F);
  static const Color _darkText   = Color(0xFFE2E8F0);

  // ── Light theme ─────────────────────────────────────────────────────────────
  static ThemeData get theme => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: background,
    appBarTheme: const AppBarTheme(
      backgroundColor: surface,
      foregroundColor: onSurface,
      elevation: 0,
      scrolledUnderElevation: 1,
      titleTextStyle: TextStyle(color: onSurface, fontWeight: FontWeight.w700, fontSize: 17),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    cardTheme: CardTheme(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.grey.shade100),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.grey.shade200),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.grey.shade200),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: primary, width: 2),
      ),
    ),
  );

  // ── Dark theme ───────────────────────────────────────────────────────────────
  static ThemeData get darkTheme => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.dark,
    ).copyWith(
      surface: _darkCard,
      onSurface: _darkText,
      surfaceContainerHighest: _darkCard,
      outline: _darkBorder,
      outlineVariant: _darkBorder,
    ),
    scaffoldBackgroundColor: _darkBg,
    appBarTheme: const AppBarTheme(
      backgroundColor: _darkBar,
      foregroundColor: _darkText,
      elevation: 0,
      scrolledUnderElevation: 1,
      titleTextStyle: TextStyle(color: _darkText, fontWeight: FontWeight.w700, fontSize: 17),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: _darkCard,
      indicatorColor: primary.withOpacity(0.2),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    cardTheme: const CardTheme(
      color: _darkCard,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: _darkBorder),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: _darkBar,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _darkBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _darkBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: primary, width: 2),
      ),
      hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
      labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
    ),
    dividerColor: _darkBorder,
    dialogTheme: const DialogTheme(
      backgroundColor: _darkCard,
      titleTextStyle: TextStyle(color: _darkText, fontSize: 17, fontWeight: FontWeight.w700),
      contentTextStyle: TextStyle(color: _darkText),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: _darkCard,
      modalBackgroundColor: _darkCard,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: MaterialStateProperty.resolveWith(
        (s) => s.contains(MaterialState.selected) ? primary : Colors.grey,
      ),
      trackColor: MaterialStateProperty.resolveWith(
        (s) => s.contains(MaterialState.selected) ? primary.withOpacity(0.4) : _darkBorder,
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: _darkCard,
      contentTextStyle: TextStyle(color: _darkText),
    ),
  );
}
