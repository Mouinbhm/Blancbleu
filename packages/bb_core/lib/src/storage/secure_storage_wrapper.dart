/// Wrapper léger autour de FlutterSecureStorage avec clés paramétrables.
///
/// Pourquoi : les 2 apps stockent leurs tokens sous des clés différentes
/// (`personnel_token`/`personnel_refresh` pour driver, `bb_token`/`bb_refresh`
/// pour patient). Plutôt que de réécrire 2 helpers, on encapsule.
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageWrapper {
  final FlutterSecureStorage _storage;

  SecureStorageWrapper({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  Future<String?> read(String key) => _storage.read(key: key);
  Future<void>    write(String key, String value) =>
      _storage.write(key: key, value: value);
  Future<void>    delete(String key) => _storage.delete(key: key);
  Future<void>    deleteAll() => _storage.deleteAll();
}
