/// Tests DioClient — un échec RÉSEAU du refresh ne doit pas déconnecter.
///
/// Régression : `_ensureRefreshed()` renvoyait `false` pour n'importe quel
/// échec, timeout réseau compris. Un 401 sur une requête quelconque pendant
/// une coupure déclenchait donc `onAuthFailed` → purge du secure storage →
/// chauffeur déconnecté en plein shift, alors que ses identifiants étaient
/// parfaitement valides. C'est le contraire de l'objectif offline-first.
///
/// Règle : seul un refus explicite du serveur (4xx sur /refresh) prouve que la
/// session est morte. Timeout, connexion refusée et 5xx sont transitoires.
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:bb_core/src/network/dio_client.dart';
import 'package:bb_core/src/network/token_manager.dart';
import 'package:bb_core/src/storage/secure_storage_wrapper.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

const _accessKey = 'test_token';
const _refreshKey = 'test_refresh';
const _refreshPath = '/auth/refresh';

TokenManager _tokens() => TokenManager(
      storage: SecureStorageWrapper(),
      accessKey: _accessKey,
      refreshKey: _refreshKey,
    );

/// Transport scriptable : 401 sur les requêtes métier, comportement paramétrable
/// sur `/auth/refresh`. Aucune socket réelle — le binding de test transforme
/// sinon toute requête sortante en 400, ce qui masquerait le cas testé.
class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter({required this.onRefresh, this.retrySucceeds = false});

  /// Renvoie la réponse du refresh, ou lève pour simuler une panne réseau.
  final ResponseBody Function() onRefresh;

  /// Quand true, le rejeu après refresh réussi renvoie 200 (cas nominal).
  final bool retrySucceeds;

  int _appelsMetier = 0;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream,
      Future<void>? cancelFuture) async {
    if (options.path.endsWith(_refreshPath)) return onRefresh();
    _appelsMetier++;
    if (retrySucceeds && _appelsMetier > 1) return _json(200, '{"shift":null}');
    return _json(401, '{"message":"expiré"}');
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, String body) => ResponseBody.fromString(
      body,
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Future<bool> _run(
  ResponseBody Function() onRefresh, {
  bool retrySucceeds = false,
}) async {
  var logout = false;
  final client = DioClient(
    baseUrl: 'http://localhost',
    tokens: _tokens(),
    refreshPath: _refreshPath,
    onAuthFailed: () async => logout = true,
  );
  client.dio.httpClientAdapter =
      _ScriptedAdapter(onRefresh: onRefresh, retrySucceeds: retrySucceeds);

  final appel = client.dio.get<dynamic>('/shifts/active');
  if (retrySucceeds) {
    await appel; // le rejeu doit aboutir
  } else {
    await expectLater(appel, throwsA(isA<DioException>()));
  }
  return logout;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({
      _accessKey: 'access-perime',
      _refreshKey: 'refresh-valide',
    });
  });

  test('refresh injoignable (panne réseau) → pas de logout, tokens conservés', () async {
    final logout = await _run(() => throw DioException.connectionTimeout(
          timeout: const Duration(seconds: 10),
          requestOptions: RequestOptions(path: _refreshPath),
        ));

    expect(logout, isFalse, reason: 'une panne réseau ne prouve pas une session morte');
    expect(await _tokens().getRefreshToken(), 'refresh-valide');
  });

  test('refresh en erreur serveur (500) → pas de logout', () async {
    final logout = await _run(() => _json(500, '{"message":"boom"}'));

    expect(logout, isFalse, reason: 'une panne serveur ne révoque pas la session');
    expect(await _tokens().getRefreshToken(), 'refresh-valide');
  });

  test('refresh refusé par le serveur (401) → logout', () async {
    final logout = await _run(() => _json(401, '{"message":"Refresh token invalide"}'));

    expect(logout, isTrue, reason: 'un refus explicite du serveur termine la session');
  });

  test('refresh OK → nouveaux tokens persistés, pas de logout', () async {
    final logout = await _run(
      () => _json(200, '{"token":"nouvel-access","refreshToken":"nouveau-refresh"}'),
      retrySucceeds: true,
    );

    expect(logout, isFalse);
    expect(await _tokens().getAccessToken(), 'nouvel-access');
    expect(await _tokens().getRefreshToken(), 'nouveau-refresh');
  });
}
