/// Sprint M5 — Logger centralisé avec :
///   - **no-op debug en release** (`kReleaseMode`) : aucun debug log n'est
///     écrit sur stdout en prod (économie + pas d'info pour un attaquant
///     qui dumpera logcat).
///   - **scrub automatique des clés sensibles** dans les Map loggées
///     (`token`, `refreshToken`, `fcmToken`, `password`, `authorization`,
///     `accessToken`, `secret`).
///   - 4 niveaux : `d`(ebug), `i`(nfo), `w`(arning), `e`(rror). Seuls
///     warnings et errors sont émis en release.
///
/// Usage :
/// ```dart
/// import 'package:bb_core/bb_core.dart' show BbLog;
/// BbLog.d('[Socket] connected'); // skip en release
/// BbLog.w('[Push] token refresh failed', err: e);
/// BbLog.e('[Crash] something bad', err: e, stack: s);
/// ```
library;

import 'package:flutter/foundation.dart';

class BbLog {
  BbLog._();

  /// Liste des clés sensibles qui sont systematiquement remplacees par '***'.
  static const _sensitiveKeys = <String>{
    'token', 'refreshtoken', 'accesstoken', 'fcmtoken',
    'password', 'authorization', 'secret', 'apikey', 'api_key',
    'bearer', 'session', 'jwt',
  };

  static String _maskValue(Object? value) {
    if (value == null) return 'null';
    if (value is Map) return _maskMap(value).toString();
    if (value is Iterable) return value.map(_maskValue).toList().toString();
    return value.toString();
  }

  static Map<String, dynamic> _maskMap(Map<dynamic, dynamic> input) {
    final out = <String, dynamic>{};
    input.forEach((k, v) {
      final keyStr = k.toString();
      if (_sensitiveKeys.contains(keyStr.toLowerCase())) {
        out[keyStr] = '***';
      } else if (v is Map) {
        out[keyStr] = _maskMap(v);
      } else {
        out[keyStr] = v;
      }
    });
    return out;
  }

  /// Debug — strictement no-op en release.
  static void d(String message, {Object? data}) {
    if (kReleaseMode) return;
    final suffix = data == null ? '' : ' ${_maskValue(data)}';
    // ignore: avoid_print
    print('[D] $message$suffix');
  }

  /// Info — no-op en release (les events normaux n'ont pas leur place en
  /// prod stdout ; pour les pousser à un APM, utiliser Sentry breadcrumbs).
  static void i(String message, {Object? data}) {
    if (kReleaseMode) return;
    final suffix = data == null ? '' : ' ${_maskValue(data)}';
    // ignore: avoid_print
    print('[I] $message$suffix');
  }

  /// Warning — gardé en release (utile pour diagnostiquer côté store/MDM
  /// si un user rapporte un bug).
  static void w(String message, {Object? err, Object? data}) {
    final parts = <String>['[W] $message'];
    if (err != null) parts.add('err=$err');
    if (data != null) parts.add(_maskValue(data));
    // ignore: avoid_print
    print(parts.join(' '));
  }

  /// Error — toujours gardé en release. Devrait aussi remonter à Sentry
  /// (cf. M5 étape 4).
  static void e(String message, {Object? err, StackTrace? stack, Object? data}) {
    final parts = <String>['[E] $message'];
    if (err != null) parts.add('err=$err');
    if (data != null) parts.add(_maskValue(data));
    // ignore: avoid_print
    print(parts.join(' '));
    if (stack != null && !kReleaseMode) {
      // ignore: avoid_print
      print(stack);
    }
  }
}
