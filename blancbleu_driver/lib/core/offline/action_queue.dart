/// File d'actions offline pour le chauffeur (zones blanches).
///
/// Problème métier : en zone montagneuse / parking sous-sol / tunnel le
/// chauffeur perd la connexion mais doit pouvoir valider une arrivée, un
/// embarquement, ou pousser une position GPS. Sans cette queue, l'appel
/// HTTP throw et l'action est perdue.
///
/// Pattern :
///   1. UI appelle `ActionQueue.instance.enqueue(QueuedAction.foo(...))`.
///   2. Action persistée dans une box Hive (résiste au kill / reboot).
///   3. `_trySync()` est appelé immédiatement → si online, l'action passe
///      direct et est supprimée. Si offline, elle reste en queue.
///   4. Au retour réseau (Connectivity listener), `_trySync()` repart en
///      FIFO. Les échecs réseau remettent l'action en tête pour retry.
///
/// Limites volontaires :
///   - Une seule sync à la fois (mutex `_syncing`).
///   - Pas de retry exponentiel : on retente au prochain changement réseau
///     ou au prochain enqueue.
///   - Les actions sont supposées idempotentes côté backend (updateStatus
///     est déjà idempotent ; position GPS est un timeseries append-only).
library;

import 'dart:async';
import 'dart:convert';

import 'package:bb_core/bb_core.dart' show BbLog;
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../network/api_client.dart';

/// Types d'actions supportés. Étend l'enum quand un nouveau call doit être
/// offline-tolerant. Le payload est sérialisé JSON dans Hive.
enum QueuedActionKind {
  transportStatus, // PATCH /api/transports/:id/<transition>
  positionUpdate,  // POST /api/tracking/batch (1 point ici, batché par le service)
}

class QueuedAction {
  QueuedAction({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
  });

  /// Identifiant stable de l'action (pour dédup / debug).
  final String id;
  final QueuedActionKind kind;
  final Map<String, dynamic> payload;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind.name,
        'payload': payload,
        'createdAt': createdAt.toIso8601String(),
      };

  static QueuedAction fromJson(Map<String, dynamic> j) => QueuedAction(
        id: j['id'] as String,
        kind: QueuedActionKind.values.firstWhere((k) => k.name == j['kind']),
        payload: Map<String, dynamic>.from(j['payload'] as Map),
        createdAt: DateTime.parse(j['createdAt'] as String),
      );

  // ── Constructeurs typés ────────────────────────────────────────────────
  factory QueuedAction.transportStatus({
    required String transportId,
    required String newStatus,
    String note = '',
  }) =>
      QueuedAction(
        id: 'status-$transportId-${DateTime.now().millisecondsSinceEpoch}',
        kind: QueuedActionKind.transportStatus,
        payload: {
          'transportId': transportId,
          'newStatus': newStatus,
          'note': note,
        },
        createdAt: DateTime.now(),
      );

  factory QueuedAction.positionUpdate({
    required double lat,
    required double lng,
    required String shiftId,
    double? speed,
    double? heading,
    double? accuracy,
  }) =>
      QueuedAction(
        id: 'pos-${DateTime.now().millisecondsSinceEpoch}',
        kind: QueuedActionKind.positionUpdate,
        payload: {
          'lat': lat,
          'lng': lng,
          'shiftId': shiftId,
          'speed': speed,
          'heading': heading,
          'accuracy': accuracy,
          'timestamp': DateTime.now().toIso8601String(),
        },
        createdAt: DateTime.now(),
      );
}

class ActionQueue extends ChangeNotifier {
  ActionQueue._();
  static final ActionQueue instance = ActionQueue._();

  static const String _boxName = 'queued_actions';

  Box<String>? _box;
  StreamSubscription<ConnectivityResult>? _connSub;
  bool _syncing = false;
  bool _online = true;

  /// Nombre d'actions en attente (sert au badge UI).
  int get pendingCount => _box?.length ?? 0;

  bool get isOnline => _online;

  Future<void> init() async {
    if (_box != null) return;
    await Hive.initFlutter();
    _box = await Hive.openBox<String>(_boxName);
    notifyListeners();

    // État réseau initial + listener.
    final conn = await Connectivity().checkConnectivity();
    _online = conn != ConnectivityResult.none;
    _connSub = Connectivity().onConnectivityChanged.listen((result) {
      final wasOffline = !_online;
      _online = result != ConnectivityResult.none;
      if (wasOffline && _online) {
        BbLog.d('[ActionQueue] retour réseau → tentative de sync');
        unawaited(_trySync());
      }
      notifyListeners();
    });

    if (_online && pendingCount > 0) {
      unawaited(_trySync());
    }
  }

  /// Enqueue + tente immédiatement la sync. Si offline, l'action reste
  /// persistée jusqu'au retour du réseau.
  Future<void> enqueue(QueuedAction action) async {
    assert(_box != null, 'ActionQueue.init() doit être appelé avant enqueue');
    await _box!.put(action.id, jsonEncode(action.toJson()));
    notifyListeners();
    if (_online) {
      unawaited(_trySync());
    }
  }

  /// Vide la queue (debug / logout).
  Future<void> clear() async {
    await _box?.clear();
    notifyListeners();
  }

  /// FIFO sync. Si une action échoue, on s'arrête (la suivante échouera
  /// probablement aussi — réseau toujours mauvais). Retry au prochain
  /// retour réseau ou prochain enqueue.
  Future<void> _trySync() async {
    if (_syncing) return;
    if (_box == null || _box!.isEmpty) return;
    if (!_online) return;
    _syncing = true;
    try {
      // Clone des clés triées par insertion (Hive Box préserve l'ordre).
      final keys = _box!.keys.toList();
      for (final key in keys) {
        final raw = _box!.get(key);
        if (raw == null) continue;
        final action = QueuedAction.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        );
        try {
          await _execute(action);
          await _box!.delete(key);
          notifyListeners();
        } catch (e) {
          BbLog.d('[ActionQueue] échec action ${action.id} : $e — pause sync');
          break;
        }
      }
    } finally {
      _syncing = false;
    }
  }

  Future<void> _execute(QueuedAction action) async {
    switch (action.kind) {
      case QueuedActionKind.transportStatus:
        await ApiClient.instance.updateTransportStatus(
          action.payload['transportId'] as String,
          action.payload['newStatus'] as String,
          note: (action.payload['note'] as String?) ?? '',
        );
        break;
      case QueuedActionKind.positionUpdate:
        // Le contrat /api/tracking/batch attend un batch — on push 1 point
        // ici. Si la queue contient plusieurs positions consécutives, elles
        // sont envoyées séquentiellement (1 HTTP/point). Acceptable hors
        // ligne — au retour réseau, c'est rapide.
        await ApiClient.instance.pushTrackingPoint(
          shiftId: action.payload['shiftId'] as String,
          lat: (action.payload['lat'] as num).toDouble(),
          lng: (action.payload['lng'] as num).toDouble(),
          speed: (action.payload['speed'] as num?)?.toDouble(),
          heading: (action.payload['heading'] as num?)?.toDouble(),
          accuracy: (action.payload['accuracy'] as num?)?.toDouble(),
          timestamp: action.payload['timestamp'] as String,
        );
        break;
    }
  }

  @override
  void dispose() {
    _connSub?.cancel();
    super.dispose();
  }
}
