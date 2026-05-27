/// Sprint M5 — Détection root (Android) / jailbreak (iOS), **non bloquante**.
///
/// Choix de design : pour une app de dispatching ambulancier, un hard-exit sur
/// device compromis dégraderait l'accès en intervention d'urgence. On se
/// contente donc de :
///   - logguer un warning (`BbLog.w`, gardé en release),
///   - remonter un breadcrumb + un event Sentry (si Sentry actif),
/// puis on laisse l'app continuer. La décision de restreindre des
/// fonctionnalités sensibles reste au métier, pas à cette couche.
///
/// **Dégradation gracieuse** : si le plugin natif échoue (non supporté,
/// exception), la détection est un no-op silencieux — l'app fonctionne.
///
/// Usage (depuis main.dart, après l'init Sentry, sans bloquer le boot) :
/// ```dart
/// unawaited(DeviceIntegrity.reportIfCompromised(flavor: 'prod'));
/// ```
library;

import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../utils/logger.dart';

class DeviceIntegrity {
  DeviceIntegrity._();

  /// Renvoie `true` si le device est rooté/jailbreaké, `false` sinon OU si la
  /// détection a échoué (on ne bloque jamais sur une erreur de détection).
  static Future<bool> isCompromised() async {
    try {
      return await FlutterJailbreakDetection.jailbroken;
    } catch (e) {
      // Plugin indisponible / plateforme non supportée → on considère le
      // device comme sain pour ne pas dégrader l'app.
      BbLog.w('[DeviceIntegrity] check failed (treated as clean)', err: e);
      return false;
    }
  }

  /// Détecte et **rapporte** un device compromis sans bloquer l'app.
  /// Log warning + breadcrumb/event Sentry (si actif). No-op si sain.
  static Future<void> reportIfCompromised({required String flavor}) async {
    final compromised = await isCompromised();
    if (!compromised) return;

    BbLog.w('[DeviceIntegrity] rooted/jailbroken device detected');

    // Best-effort : si Sentry n'est pas initialisé, ces appels sont no-op.
    try {
      Sentry.addBreadcrumb(Breadcrumb(
        category: 'device.integrity',
        message: 'rooted/jailbroken device',
        level: SentryLevel.warning,
        data: {'flavor': flavor},
      ));
      await Sentry.captureMessage(
        'Device integrity: rooted/jailbroken',
        level: SentryLevel.warning,
      );
    } catch (_) {
      // Sentry non actif (DSN absent) — rien à remonter, on ignore.
    }
  }
}
