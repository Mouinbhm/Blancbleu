/// Gestion centralisée des tokens (access + refresh) en secure storage.
///
/// Chaque app fournit ses propres clés via le constructeur :
///   - driver  : `personnel_token` / `personnel_refresh`
///   - patient : `bb_token` / `bb_refresh`
library;

import '../storage/secure_storage_wrapper.dart';

class TokenManager {
  final SecureStorageWrapper _storage;
  final String _accessKey;
  final String _refreshKey;

  TokenManager({
    required SecureStorageWrapper storage,
    required String accessKey,
    required String refreshKey,
  })  : _storage = storage,
        _accessKey = accessKey,
        _refreshKey = refreshKey;

  Future<String?> getAccessToken()  => _storage.read(_accessKey);
  Future<String?> getRefreshToken() => _storage.read(_refreshKey);

  Future<void> saveTokens({required String access, String? refresh}) async {
    await _storage.write(_accessKey, access);
    if (refresh != null && refresh.isNotEmpty) {
      await _storage.write(_refreshKey, refresh);
    }
  }

  Future<void> clear() async {
    await _storage.delete(_accessKey);
    await _storage.delete(_refreshKey);
  }
}
