import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeNotifier extends ChangeNotifier {
  static final ThemeNotifier instance = ThemeNotifier._();
  ThemeNotifier._();

  ThemeMode _mode = ThemeMode.system;
  ThemeMode get mode => _mode;

  /// True only when explicitly set to dark (not when system is dark).
  bool get isDark => _mode == ThemeMode.dark;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('darkMode');
    switch (saved) {
      case 'dark':  _mode = ThemeMode.dark;  break;
      case 'light': _mode = ThemeMode.light; break;
      default:      _mode = ThemeMode.system; break;
    }
    notifyListeners();
  }

  Future<void> setMode(ThemeMode mode) async {
    _mode = mode;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    switch (mode) {
      case ThemeMode.dark:   await prefs.setString('darkMode', 'dark');  break;
      case ThemeMode.light:  await prefs.setString('darkMode', 'light'); break;
      case ThemeMode.system: await prefs.remove('darkMode');             break;
    }
  }

  /// Toggle: ON → dark, OFF → follow system.
  void toggleDark(bool enabled) => setMode(enabled ? ThemeMode.dark : ThemeMode.system);
}
