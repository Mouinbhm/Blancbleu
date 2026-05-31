import 'package:bb_core/bb_core.dart' show PermissionHelper;
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

/// Sprint M1 — Service de localisation simplifié.
///
/// Le tracking continu (push GPS toutes les N secondes) est désormais
/// la responsabilité EXCLUSIVE de [GpsService] (socket Socket.IO depuis
/// un isolate background, ~5s). Le timer 30s + écriture SQLite + HTTP
/// batch qui vivait ici a été retiré pour éliminer le double-flux GPS.
///
/// Ce service ne conserve que les helpers ponctuels utilisés par l'UI :
/// `requestPermission()` et `getCurrentPosition()`.
///
/// TODO(M2): offline GPS buffering in background isolate — quand le socket
/// est down, le worker bg devrait écrire les points dans SQLite et flush
/// au retour de la connexion. Sort du périmètre M1 (le chemin socket actuel
/// ne persiste pas hors-ligne).
class LocationService {
  static LocationService? _instance;
  static LocationService get instance => _instance ??= LocationService._();
  LocationService._();

  /// Transport actif (lecture seule pour les consumers UI éventuels).
  /// Le GPS background isolate utilise [GpsService.setActiveTransport] —
  /// ce champ n'est PAS consommé pour router les emits GPS.
  String? _activeTransportId;
  String? get activeTransportId => _activeTransportId;

  /// Demande la permission de géolocalisation **avec rationale UI**.
  ///
  /// Utiliser cette variante depuis l'UI (shift_screen, transport_detail,
  /// onboarding…) — elle explique l'usage avant la popup système et redirige
  /// vers les Réglages en cas de refus définitif. La permission est ensuite
  /// disponible silencieusement pour les flux internes (GPS background).
  Future<bool> requestPermissionWithRationale(BuildContext context) async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;
    if (!context.mounted) return false;
    return PermissionHelper.requestLocationWithRationale(context);
  }

  /// Variante silencieuse — pour les workers/services qui n'ont pas de
  /// BuildContext. Ne montre PAS de rationale ; à appeler uniquement après
  /// que [requestPermissionWithRationale] ait été utilisée au moins une fois
  /// au cours de la session.
  Future<bool> requestPermission() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied) return false;
    }
    if (perm == LocationPermission.deniedForever) return false;
    return true;
  }

  Future<Position?> getCurrentPosition() async {
    try {
      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );
    } catch (_) {
      return null;
    }
  }

  /// Conservé pour compat éventuelle — actif uniquement comme metadata locale
  /// (ne route plus le GPS, c'est [GpsService.setActiveTransport] qui le fait).
  void setActiveTransport(String? transportId) =>
      _activeTransportId = transportId;
}
