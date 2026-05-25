/// Sprint M1 — Configuration build-time.
///
/// Les URLs sont injectées via `--dart-define` au build :
///
///   flutter run --dart-define=API_URL=http://192.168.1.42:5000
///   flutter build apk --release \
///     --dart-define=API_URL=https://api.blancbleu.fr \
///     --dart-define=WS_URL=wss://api.blancbleu.fr
///
/// Defaults :
///   - API_URL : `http://10.0.2.2:5000` (émulateur Android standard,
///     map vers `localhost:5000` de la machine hôte).
///   - WS_URL  : dérivé de `API_URL` (http→ws, https→wss). Override possible.
///
/// AUCUNE IP personnelle ne doit être committée ici — pour un device
/// physique sur le LAN, utilise --dart-define au lancement.
class AppConstants {
  static const String baseUrl =
      String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:5000');

  static const String apiBase = '$baseUrl/api/v1';

  /// WS_URL est explicitement fournissable. Si absent (chaîne vide), on dérive
  /// depuis baseUrl en remplaçant le schéma : http→ws / https→wss.
  static const String _wsOverride = String.fromEnvironment('WS_URL', defaultValue: '');
  static String get wsUrl => _wsOverride.isNotEmpty ? _wsOverride : _derivedWsUrl;

  static String get _derivedWsUrl {
    if (baseUrl.startsWith('https://')) return 'wss://${baseUrl.substring(8)}';
    if (baseUrl.startsWith('http://'))  return 'ws://${baseUrl.substring(7)}';
    return baseUrl;
  }

  static const String tokenKey   = 'personnel_token';
  static const String refreshKey = 'personnel_refresh';
  static const String userKey    = 'personnel_data';
  static const int    syncInterval = 300; // seconds
}
