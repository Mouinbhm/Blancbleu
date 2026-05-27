/// Sprint M5 — Init Sentry centralisé pour les 2 apps mobile.
///
/// **Opt-in** : si `SENTRY_DSN` (env build-time via --dart-define) n'est pas
/// fourni, runApp est lancé sans Sentry (dégradation gracieuse, mêmes
/// principes que FCM en M4 et SSL pinning en M5 étape 1).
///
/// **PII scrubbing** obligatoire (RGPD + données santé) : tout event/breadcrumb
/// est filtré via `beforeSend` / `beforeBreadcrumb` pour retirer :
///   - user.email, user.phone, user.username (PII RGPD)
///   - extra.token, extra.refreshToken, etc. (sécurité)
///   - request.headers.authorization, request.cookies (sécurité)
///   - request.data (peut contenir email/password/profil patient)
///
/// Usage type (depuis main.dart de chaque app) :
/// ```dart
/// await SentryInit.runWithSentry(
///   flavor: 'prod',
///   appRunner: () => runApp(const MyApp()),
/// );
/// ```
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

class SentryInit {
  SentryInit._();

  /// DSN injecté via `--dart-define=SENTRY_DSN=...`.
  /// Vide en dev / si non configuré → Sentry désactivé.
  static const String dsn = String.fromEnvironment('SENTRY_DSN');

  /// Trace sample rate (proportion de transactions performance loggées).
  /// 0.2 par défaut (20%) — bon compromis volume/coût.
  static const double tracesSampleRate = 0.2;

  /// Active Sentry si DSN fourni, sinon `appRunner()` direct.
  /// Le caller passe son `runApp(...)` dans `appRunner`.
  static Future<void> runWithSentry({
    required String flavor,
    required Future<void> Function() appRunner,
    String? release,
  }) async {
    if (dsn.isEmpty) {
      WidgetsFlutterBinding.ensureInitialized();
      await appRunner();
      return;
    }

    await SentryFlutter.init(
      (options) {
        options.dsn = dsn;
        options.environment = flavor;
        if (release != null) options.release = release;
        options.tracesSampleRate = tracesSampleRate;
        options.sendDefaultPii = false; // RGPD : pas de PII par défaut
        options.attachScreenshot = false; // peut capturer données patient à l'écran
        options.attachViewHierarchy = false;
        // Capture les uncaught Bloc errors via setUp d'une zone — laissé
        // au caller (override Bloc.observer).
        options.beforeSend = _scrubEvent;
        options.beforeBreadcrumb = _scrubBreadcrumb;
      },
      appRunner: appRunner,
    );
  }

  // ── PII scrubbing ─────────────────────────────────────────────────────────

  static FutureOr<SentryEvent?> _scrubEvent(SentryEvent event, Hint hint) {
    // 1. User : vider email / username / autres PII.
    if (event.user != null) {
      event = event.copyWith(
        user: event.user!.copyWith(
          email: null,
          username: null,
          ipAddress: null,
          name: null,
        ),
      );
    }

    // 2. Request : retirer headers d'auth + body.
    if (event.request != null) {
      final req = event.request!;
      final scrubbedHeaders = <String, String>{};
      (req.headers).forEach((k, v) {
        if (_isSensitiveHeaderKey(k)) {
          scrubbedHeaders[k] = '***';
        } else {
          scrubbedHeaders[k] = v;
        }
      });
      event = event.copyWith(
        request: req.copyWith(
          headers: scrubbedHeaders,
          cookies: '***',
          data: null, // jamais de body remonté (peut contenir email/password/profil)
        ),
      );
    }

    // 3. Extra : scrub clés sensibles.
    if (event.extra != null) {
      event = event.copyWith(extra: _scrubMap(event.extra!));
    }

    return event;
  }

  static Breadcrumb? _scrubBreadcrumb(Breadcrumb? breadcrumb, Hint hint) {
    if (breadcrumb == null) return null;
    // Drop breadcrumbs HTTP qui pourraient contenir body/auth.
    final data = breadcrumb.data;
    if (data == null) return breadcrumb;
    return breadcrumb.copyWith(data: _scrubMap(Map<String, dynamic>.from(data)));
  }

  static const _sensitiveKeys = <String>{
    'token', 'refreshtoken', 'accesstoken', 'fcmtoken',
    'password', 'authorization', 'secret', 'apikey', 'api_key',
    'bearer', 'session', 'jwt',
    'email', 'phone', 'telephone', 'numerosecu', 'nir',
    'mobilite', 'medecin', 'mutuelle', // données santé
  };

  static bool _isSensitiveHeaderKey(String key) {
    final l = key.toLowerCase();
    return l == 'authorization' || l == 'cookie' || l == 'set-cookie' ||
           l == 'x-api-key' || l == 'x-auth-token';
  }

  static Map<String, dynamic> _scrubMap(Map<String, dynamic> input) {
    final out = <String, dynamic>{};
    input.forEach((k, v) {
      if (_sensitiveKeys.contains(k.toLowerCase())) {
        out[k] = '***';
      } else if (v is Map) {
        out[k] = _scrubMap(Map<String, dynamic>.from(v));
      } else {
        out[k] = v;
      }
    });
    return out;
  }
}
