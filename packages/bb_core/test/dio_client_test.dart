/// Tests du `DioClient` — le SEUL endroit où la logique réseau partagée
/// (bearer + refresh single-flight + mapping d'erreurs typées) est désormais
/// vérifiée pour les deux apps (driver + patient).
///
/// Choix : serveur HTTP loopback réel + storage en mémoire injecté.
/// - On N'UTILISE PAS `TestWidgetsFlutterBinding` : ce binding remplace tout
///   HttpClient par un mock qui renvoie 400, ce qui empêcherait les vrais
///   appels réseau. Sans binding, le loopback fonctionne.
/// - On N'UTILISE PAS `http_mock_adapter` : `_ensureRefreshed()` instancie un
///   `Dio` DÉDIÉ pour l'appel `/refresh`, qu'un adapter posé sur le `dio`
///   principal n'intercepterait pas. Le loopback exerce donc le VRAI chemin de
///   refresh, le single-flight et le retry de bout en bout.
/// - Le secure storage est un sous-type en mémoire de `SecureStorageWrapper`
///   (pas de MethodChannel, donc pas besoin du binding).
library;

import 'dart:convert';
import 'dart:io';

import 'package:bb_core/bb_core.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// Storage en mémoire : surcharge les 4 méthodes de SecureStorageWrapper pour
/// ne jamais toucher le MethodChannel flutter_secure_storage.
class _MemStorage extends SecureStorageWrapper {
  final Map<String, String> map = {};
  @override
  Future<String?> read(String key) async => map[key];
  @override
  Future<void> write(String key, String value) async => map[key] = value;
  @override
  Future<void> delete(String key) async => map.remove(key);
  @override
  Future<void> deleteAll() async => map.clear();
}

void main() {
  late HttpServer server;
  late String baseUrl;
  late _MemStorage storage;
  late int refreshCalls;       // nb d'appels POST /refresh
  late String goodAccessToken; // token que /protected accepte
  late bool refreshSucceeds;   // /refresh renvoie 200 ou 401
  late Duration refreshDelay;  // élargit la fenêtre single-flight

  setUp(() async {
    storage = _MemStorage();
    refreshCalls = 0;
    goodAccessToken = 'new-access';
    refreshSucceeds = true;
    refreshDelay = Duration.zero;

    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    baseUrl = 'http://${server.address.host}:${server.port}';
    server.listen((HttpRequest req) async {
      final path = req.uri.path;
      Future<void> json(int code, Object body) async {
        req.response.statusCode = code;
        req.response.headers.contentType = ContentType.json;
        req.response.write(jsonEncode(body));
        await req.response.close();
      }

      if (path.endsWith('/refresh')) {
        refreshCalls++;
        if (refreshDelay > Duration.zero) await Future.delayed(refreshDelay);
        if (refreshSucceeds) {
          await json(200, {'token': goodAccessToken, 'refreshToken': 'r2'});
        } else {
          await json(401, {'message': 'refresh invalide'});
        }
        return;
      }
      if (path.endsWith('/protected')) {
        final auth = req.headers.value(HttpHeaders.authorizationHeader);
        if (auth == 'Bearer $goodAccessToken') {
          await json(200, {'ok': true, 'auth': auth});
        } else {
          await json(401, {'message': 'token expiré'});
        }
        return;
      }
      if (path.endsWith('/forbidden')) {
        await json(403, {'message': 'interdit'});
        return;
      }
      await json(404, {'message': 'not found'});
    });
  });

  tearDown(() async => server.close(force: true));

  // Construit un DioClient branché sur le serveur + storage en mémoire.
  ({DioClient client, List<String> authFailed}) build({
    bool forbiddenTriggersLogout = true,
  }) {
    final authFailed = <String>[];
    final client = DioClient(
      baseUrl: baseUrl,
      tokens: TokenManager(
        storage: storage,
        accessKey: 'acc',
        refreshKey: 'ref',
      ),
      refreshPath: '/refresh',
      onAuthFailed: () async => authFailed.add('x'),
      forbiddenTriggersLogout: forbiddenTriggersLogout,
    );
    return (client: client, authFailed: authFailed);
  }

  group('DioClient', () {
    test('injecte le Bearer depuis le TokenManager', () async {
      storage.map['acc'] = goodAccessToken;
      final b = build();
      final res = await b.client.dio.get<Map<String, dynamic>>('/protected');
      expect(res.statusCode, 200);
      expect(res.data!['auth'], 'Bearer $goodAccessToken');
      expect(refreshCalls, 0);
    });

    test('401 → refresh single-flight (1 seul /refresh pour N requêtes) → retry OK',
        () async {
      storage.map['acc'] = 'expired';
      storage.map['ref'] = 'r1';
      refreshDelay = const Duration(milliseconds: 120); // fenêtre concurrente
      final b = build();

      final results = await Future.wait([
        for (var i = 0; i < 5; i++)
          b.client.dio.get<Map<String, dynamic>>('/protected'),
      ]);

      expect(results.every((r) => r.statusCode == 200), isTrue);
      expect(refreshCalls, 1, reason: 'single-flight : un seul POST /refresh');
      expect(storage.map['acc'], goodAccessToken, reason: 'nouveau token persisté');
      expect(storage.map['ref'], 'r2', reason: 'refresh token tourné');
      expect(b.authFailed, isEmpty);
    });

    test('échec du refresh → onAuthFailed + AuthException', () async {
      storage.map['acc'] = 'expired';
      storage.map['ref'] = 'r1';
      refreshSucceeds = false;
      final b = build();

      Object? caught;
      try {
        await b.client.dio.get('/protected');
      } on DioException catch (e) {
        caught = e.error;
      }
      expect(caught, isA<AuthException>());
      expect(b.authFailed, hasLength(1));
    });

    test('403 → onAuthFailed + ForbiddenException (défaut driver)', () async {
      storage.map['acc'] = goodAccessToken;
      final b = build();

      Object? caught;
      try {
        await b.client.dio.get('/forbidden');
      } on DioException catch (e) {
        caught = e.error;
      }
      expect(caught, isA<ForbiddenException>());
      expect(b.authFailed, hasLength(1));
      expect(refreshCalls, 0, reason: '403 n’est pas une expiration');
    });

    test('403 avec forbiddenTriggersLogout=false → ForbiddenException SANS logout',
        () async {
      storage.map['acc'] = goodAccessToken;
      final b = build(forbiddenTriggersLogout: false);

      Object? caught;
      try {
        await b.client.dio.get('/forbidden');
      } on DioException catch (e) {
        caught = e.error;
      }
      expect(caught, isA<ForbiddenException>());
      expect(b.authFailed, isEmpty, reason: 'patient : 403 = message, pas de logout');
    });

    test('pas de boucle : un 401 sur le endpoint /refresh ne relance pas de refresh',
        () async {
      storage.map['acc'] = goodAccessToken;
      refreshSucceeds = false; // le POST /refresh renvoie 401
      final b = build();

      Object? caught;
      try {
        // Appel DIRECT du refresh path via le dio principal.
        await b.client.dio.post('/refresh', data: {'refreshToken': 'r1'});
      } on DioException catch (e) {
        caught = e.error;
      }
      expect(caught, isA<AuthException>());
      expect(refreshCalls, 1, reason: 'appelé une fois, jamais re-déclenché');
      expect(b.authFailed, isEmpty,
          reason: 'le garde isRefreshCall court-circuite avant onAuthFailed');
    });

    test('skipRefreshExtra : un 401 ne déclenche ni refresh ni onAuthFailed',
        () async {
      storage.map['acc'] = 'expired';
      storage.map['ref'] = 'r1';
      final b = build();

      Object? caught;
      try {
        await b.client.dio.get(
          '/protected',
          options: Options(extra: {DioClient.skipRefreshExtra: true}),
        );
      } on DioException catch (e) {
        caught = e.error;
      }
      expect(caught, isA<AuthException>());
      expect(refreshCalls, 0, reason: 'opt-out du refresh (ex. multipart)');
      expect(b.authFailed, isEmpty);
    });
  });
}
