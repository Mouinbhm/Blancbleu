/// Tests unitaires de [QueuedAction] — sérialisation + constructeurs typés.
///
/// Le test d'intégration complet (Hive box + sync + Connectivity) demande
/// un binding Flutter + mock du MethodChannel connectivity_plus — couvert
/// en QA manuel (mode avion, attente, retour réseau, vérif queue vide).
library;

import 'package:blancbleu_driver/core/offline/action_queue.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('QueuedAction.transportStatus', () {
    test('payload contient transportId + newStatus + note', () {
      final action = QueuedAction.transportStatus(
        transportId: 'trs-1',
        newStatus: 'EN_ROUTE_TO_PICKUP',
        note: 'départ confirmé',
      );

      expect(action.kind, QueuedActionKind.transportStatus);
      expect(action.payload['transportId'], 'trs-1');
      expect(action.payload['newStatus'], 'EN_ROUTE_TO_PICKUP');
      expect(action.payload['note'], 'départ confirmé');
      expect(action.id, startsWith('status-trs-1-'));
    });

    test('round-trip JSON', () {
      final original = QueuedAction.transportStatus(
        transportId: 'trs-2',
        newStatus: 'COMPLETED',
      );
      final json = original.toJson();
      final restored = QueuedAction.fromJson(json);

      expect(restored.id, original.id);
      expect(restored.kind, original.kind);
      expect(restored.payload, original.payload);
      expect(
        restored.createdAt.toIso8601String(),
        original.createdAt.toIso8601String(),
      );
    });
  });

  group('QueuedAction.positionUpdate', () {
    test('payload contient lat/lng/shiftId + timestamp ISO', () {
      final action = QueuedAction.positionUpdate(
        lat: 43.7102,
        lng: 7.262,
        shiftId: 'shift-1',
        speed: 12.5,
      );

      expect(action.kind, QueuedActionKind.positionUpdate);
      expect(action.payload['lat'], 43.7102);
      expect(action.payload['lng'], 7.262);
      expect(action.payload['shiftId'], 'shift-1');
      expect(action.payload['speed'], 12.5);
      expect(action.payload['timestamp'], isA<String>());
      expect(action.id, startsWith('pos-'));
    });

    test('champs optionnels speed/heading/accuracy peuvent être null', () {
      final action = QueuedAction.positionUpdate(
        lat: 0,
        lng: 0,
        shiftId: 's',
      );
      expect(action.payload['speed'], isNull);
      expect(action.payload['heading'], isNull);
      expect(action.payload['accuracy'], isNull);
    });
  });

  test('QueuedActionKind a 2 entrées (transportStatus, positionUpdate)', () {
    expect(QueuedActionKind.values.length, 2);
    expect(QueuedActionKind.values, contains(QueuedActionKind.transportStatus));
    expect(QueuedActionKind.values, contains(QueuedActionKind.positionUpdate));
  });
}
