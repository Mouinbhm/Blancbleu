/// Dio configurée pour les apps mobile : bearer token + refresh single-flight
/// + mapping des DioException vers BbException.
///
/// Sprint M1 a introduit le refresh token cote driver (api_client.dart) et
/// patient (api_service.dart) séparément. Sprint M3 consolide la logique
/// commune ici, paramétrée par :
///   - baseUrl (driver: /api/v1, patient: /api/patient)
///   - TokenManager (clés différentes selon l'app)
///   - refreshPath  (driver: /personnel/auth/refresh, patient: /refresh)
///   - onRefreshSuccess callback : permet aux apps de propager le nouveau
///     token au socket (cf. M2 SocketManager.reauthenticate).
///   - onAuthFailed callback : déclenche le logout côté app (clear storage,
///     navigation login).
library;

import 'dart:async';

import 'package:dio/dio.dart';

import '../errors/exceptions.dart';
import 'error_mapper.dart';
import 'ssl_pinning.dart';
import 'token_manager.dart';

class DioClient {
  late final Dio dio;
  final TokenManager _tokens;
  final String _refreshPath;
  final Future<void> Function()? _onRefreshSuccess;
  final Future<void> Function()? _onAuthFailed;
  final bool _forbiddenTriggersLogout;

  // Single-flight refresh : un seul appel /refresh à la fois, les autres
  // requêtes en 401 attendent ce Completer.
  Completer<_RefreshOutcome>? _refreshCompleter;

  /// Marker dans RequestOptions.extra pour éviter de retry indéfiniment.
  static const String _retriedKey = '_bb_retried';

  /// Permet à un appelant de désactiver le refresh/retry automatique pour UNE
  /// requête : `options: Options(extra: {DioClient.skipRefreshExtra: true})`.
  ///
  /// Utile pour les requêtes non rejouables (ex. multipart `FormData`, qui est
  /// un stream à usage unique : un retry après 401 planterait sur un corps déjà
  /// finalisé). Sur 401, une telle requête est rejetée directement en
  /// `AuthException` sans tentative de refresh ni `onAuthFailed`.
  static const String skipRefreshExtra = _retriedKey;

  DioClient({
    required String baseUrl,
    required TokenManager tokens,
    required String refreshPath,
    Duration connectTimeout = const Duration(seconds: 15),
    Duration receiveTimeout = const Duration(seconds: 30),
    Future<void> Function()? onRefreshSuccess,
    Future<void> Function()? onAuthFailed,
    /// 403 = interdit. Par défaut (driver) un 403 déclenche `onAuthFailed`
    /// (logout). Le patient passe `false` : un 403 remonte alors comme
    /// `ForbiddenException` SANS logout (comportement historique = message
    /// affiché à l'utilisateur).
    bool forbiddenTriggersLogout = true,
    /// Sprint M5 — SSL public-key pinning (SPKI SHA-256 base64).
    /// Vide ou baseUrl non https → adapter par défaut (dev).
    /// Voir docs/mobile-security.md pour la procédure d'extraction.
    List<String> spkiSha256PinsBase64 = const [],
  })  : _tokens = tokens,
        _refreshPath = refreshPath,
        _onRefreshSuccess = onRefreshSuccess,
        _onAuthFailed = onAuthFailed,
        _forbiddenTriggersLogout = forbiddenTriggersLogout {
    dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: connectTimeout,
      receiveTimeout: receiveTimeout,
      headers: {'Content-Type': 'application/json'},
    ));

    // Sprint M5 — Si des pins SSL sont fournis ET baseUrl est https, on
    // installe l'adapter pinné (rejet automatique des certs non matchant).
    // Sinon adapter Dio par défaut (validation système).
    final pinnedAdapter = SslPinning.buildPinnedAdapter(
      spkiSha256PinsBase64: spkiSha256PinsBase64,
      baseUrl: baseUrl,
    );
    if (pinnedAdapter != null) {
      dio.httpClientAdapter = pinnedAdapter;
    }

    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _tokens.getAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (err, handler) async {
        final status = err.response?.statusCode;
        final ro = err.requestOptions;
        final isRefreshCall  = ro.path.endsWith(_refreshPath);
        final alreadyRetried = ro.extra[_retriedKey] == true;

        // 403 → vraiment interdit, pas une expiration.
        if (status == 403) {
          if (_forbiddenTriggersLogout) await _onAuthFailed?.call();
          return handler.reject(err.copyWith(error: ForbiddenException(_msg(err))));
        }

        if (status != 401 || isRefreshCall || alreadyRetried) {
          return handler.reject(err.copyWith(error: mapDioError(err)));
        }

        final outcome = await _ensureRefreshed();

        // Un refresh qui échoue pour cause de réseau (timeout, pas de
        // connectivité, 5xx) ne dit RIEN sur la validité de la session : la
        // déconnexion effacerait des identifiants encore bons, en plein shift
        // et souvent hors couverture — exactement le scénario que l'app
        // offline-first doit encaisser. On remonte l'erreur réseau telle
        // quelle et la session reste intacte pour la prochaine tentative.
        if (outcome == _RefreshOutcome.transientFailure) {
          return handler.reject(err.copyWith(error: mapDioError(err)));
        }
        if (outcome == _RefreshOutcome.sessionExpired) {
          await _onAuthFailed?.call();
          return handler.reject(err.copyWith(error: AuthException(_msg(err))));
        }

        try {
          final newToken = await _tokens.getAccessToken();
          final retryOptions = Options(
            method:         ro.method,
            headers: {...ro.headers, 'Authorization': 'Bearer $newToken'},
            contentType:    ro.contentType,
            responseType:   ro.responseType,
            sendTimeout:    ro.sendTimeout,
            receiveTimeout: ro.receiveTimeout,
            extra: {...ro.extra, _retriedKey: true},
            validateStatus: ro.validateStatus,
          );
          final response = await dio.request<dynamic>(
            ro.path,
            data:            ro.data,
            queryParameters: ro.queryParameters,
            options:         retryOptions,
          );
          return handler.resolve(response);
        } on DioException catch (e) {
          if (e.response?.statusCode == 401) {
            await _onAuthFailed?.call();
            return handler.reject(e.copyWith(error: AuthException(_msg(e))));
          }
          return handler.reject(e.copyWith(error: mapDioError(e)));
        }
      },
    ));
  }

  /// Appel atomique du endpoint /refresh, avec single-flight.
  /// L'app fournit le shape de la requête/réponse via [_refreshRequest] et
  /// [_extractTokens] passés en sous-classe ? Non — on simplifie : on POST
  /// `{refreshToken}` et on s'attend à `{token | accessToken, refreshToken?}`.
  Future<_RefreshOutcome> _ensureRefreshed() async {
    if (_refreshCompleter != null) return _refreshCompleter!.future;
    final c = Completer<_RefreshOutcome>();
    _refreshCompleter = c;
    try {
      final raw = await _tokens.getRefreshToken();
      if (raw == null || raw.isEmpty) {
        // Pas de refresh token stocké : rien à renouveler, session finie.
        c.complete(_RefreshOutcome.sessionExpired);
        return _RefreshOutcome.sessionExpired;
      }
      // Dio standalone sans intercepteur pour éviter de re-déclencher refresh.
      final plain = Dio(BaseOptions(
        baseUrl: dio.options.baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        headers: {'Content-Type': 'application/json'},
      ));
      // Même transport que le client principal : seule la chaîne d'intercepteurs
      // diffère. Garde aussi le pinning SSL et rend le refresh testable.
      plain.httpClientAdapter = dio.httpClientAdapter;
      final res = await plain.post(
        _refreshPath,
        data: {'refreshToken': raw},
        options: Options(validateStatus: (s) => s != null && s < 500),
      );
      if (res.statusCode == 200 && res.data is Map) {
        final body = res.data as Map<String, dynamic>;
        // Driver utilise 'token', patient utilise 'accessToken' — on accepte les 2.
        final newAccess  = (body['token'] ?? body['accessToken']) as String?;
        final newRefresh = body['refreshToken'] as String?;
        if (newAccess != null && newAccess.isNotEmpty) {
          await _tokens.saveTokens(access: newAccess, refresh: newRefresh);
          await _onRefreshSuccess?.call();
          c.complete(_RefreshOutcome.refreshed);
          return _RefreshOutcome.refreshed;
        }
      }

      // Seul le serveur qui REFUSE le refresh token prouve que la session est
      // morte (401/403, ou 400 "refreshToken requis"). Un 5xx est une panne
      // serveur, pas une révocation.
      final status = res.statusCode ?? 0;
      final outcome = (status >= 400 && status < 500)
          ? _RefreshOutcome.sessionExpired
          : _RefreshOutcome.transientFailure;
      c.complete(outcome);
      return outcome;
    } catch (_) {
      // Timeout, DNS, connexion refusée… : on ne sait pas si la session est
      // encore valide, donc on ne la détruit pas.
      c.complete(_RefreshOutcome.transientFailure);
      return _RefreshOutcome.transientFailure;
    } finally {
      _refreshCompleter = null;
    }
  }
}

/// Issue d'une tentative de refresh — distingue « session révoquée » (il faut
/// déconnecter) de « le réseau a échoué » (il faut réessayer plus tard).
enum _RefreshOutcome { refreshed, sessionExpired, transientFailure }

String _msg(DioException e) =>
    e.message ?? (e.response?.statusMessage ?? 'Erreur HTTP');
