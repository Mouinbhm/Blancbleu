import 'package:bb_core/bb_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('TransportStatus', () {
    test('parse wire values + isTerminal + isActive', () {
      expect(TransportStatus.fromString('REQUESTED'),  TransportStatus.requested);
      expect(TransportStatus.fromString('EN_ROUTE_TO_PICKUP'), TransportStatus.enRouteToPickup);
      expect(TransportStatus.fromString('UNKNOWN_XYZ'), TransportStatus.unknown);

      expect(TransportStatus.completed.isTerminal, true);
      expect(TransportStatus.cancelled.isTerminal, true);
      expect(TransportStatus.scheduled.isTerminal, false);

      expect(TransportStatus.enRouteToPickup.isActive, true);
      expect(TransportStatus.completed.isActive, false);

      expect(TransportStatus.requested.progressionPercent, 0);
      expect(TransportStatus.completed.progressionPercent, 100);
    });
  });

  group('Mobilite', () {
    test('isAutoDispatchEligible — règle Sprint 6', () {
      expect(Mobilite.assis.isAutoDispatchEligible, true);
      expect(Mobilite.fauteuilRoulant.isAutoDispatchEligible, true);
      expect(Mobilite.allonge.isAutoDispatchEligible, false);
      expect(Mobilite.civiere.isAutoDispatchEligible, false);
    });
  });

  group('Transport.fromJson', () {
    test('round-trip JSON minimal (id seul)', () {
      final json = {'_id': '6a0d8845be76ac66e4195bf6', 'statut': 'REQUESTED'};
      final t = Transport.fromJson(json);
      expect(t.id, '6a0d8845be76ac66e4195bf6');
      expect(t.statut, TransportStatus.requested);
      expect(t.vehicule, isNull);

      // round-trip
      final back = t.toJson();
      expect(back['_id'], '6a0d8845be76ac66e4195bf6');
      expect(back['statut'], 'REQUESTED');
    });

    test('parse JSON réaliste (liste tournée driver — vehicule = id String)', () {
      final json = {
        '_id': '6abc',
        'numero': 'TRS-20260524-0001',
        'statut': 'EN_ROUTE_TO_PICKUP',
        'typeTransport': 'VSL',
        'motif': 'Dialyse',
        'dateTransport': '2026-05-24T08:30:00.000Z',
        'heureRDV': '08:30',
        'patient': {
          'nom': 'DUPONT', 'prenom': 'Marie', 'mobilite': 'ASSIS',
          'telephone': '0612345678', 'oxygene': false, 'brancardage': false,
        },
        'adresseDepart': {
          'rue': '12 rue X', 'ville': 'Nice', 'codePostal': '06000',
          'coordonnees': {'lat': 43.7102, 'lng': 7.262},
        },
        'adresseDestination': {
          'nom': 'CHU Pasteur', 'ville': 'Nice', 'codePostal': '06000',
        },
        'vehicule': 'v_id_xyz',
        'chauffeur': 'c_id_abc',
      };

      final t = Transport.fromJson(json);
      expect(t.id, '6abc');
      expect(t.numero, 'TRS-20260524-0001');
      expect(t.statut, TransportStatus.enRouteToPickup);
      expect(t.patient?.mobilite, Mobilite.assis);
      expect(t.patient?.oxygene, false);
      expect(t.adresseDepart?.coordonnees?.lat, 43.7102);
      expect(t.adresseDestination?.nom, 'CHU Pasteur');

      // PopulatedRef — id String reçu, populated == null
      expect(t.vehicule?.id, 'v_id_xyz');
      expect(t.vehicule?.isPopulated, false);
      expect(t.chauffeur, 'c_id_abc');
    });

    test('PopulatedRef — vehicule peuplé (chemin détail)', () {
      final json = {
        '_id': '6abc',
        'statut': 'ASSIGNED',
        'vehicule': {
          '_id': 'v_id_xyz',
          'immatriculation': 'AB-001-CD',
          'nom': 'VSL-01',
          'type': 'VSL',
          'statut': 'En service',
          'position': {'lat': 43.71, 'lng': 7.26},
        },
      };
      final t = Transport.fromJson(json);
      expect(t.vehicule?.id, 'v_id_xyz');
      expect(t.vehicule?.isPopulated, true);
      expect(t.vehicule?.populated?.nom, 'VSL-01');
      expect(t.vehicule?.populated?.type, VehicleType.vsl);
      expect(t.vehicule?.populated?.position?.lat, 43.71);
    });

    test('graceful : statut inconnu → TransportStatus.unknown (pas de crash)', () {
      final json = {'_id': '6a', 'statut': 'BRAND_NEW_STATUS_2027'};
      final t = Transport.fromJson(json);
      expect(t.statut, TransportStatus.unknown);
    });
  });

  group('Vehicle.fromJson', () {
    test('parse + équipements via @JsonKey capacites', () {
      final json = {
        '_id': 'v1',
        'immatriculation': 'AB-001-CD',
        'nom': 'AMB-01',
        'type': 'AMBULANCE',
        'statut': 'Disponible',
        'capacites': {
          'equipeFauteuil': true,
          'equipeOxygene':  true,
          'equipeBrancard': true,
        },
        'carburant': 87.5,
      };
      final v = Vehicle.fromJson(json);
      expect(v.id, 'v1');
      expect(v.type, VehicleType.ambulance);
      expect(v.equipements?.fauteuil, true);
      expect(v.equipements?.oxygene, true);
      expect(v.equipements?.brancard, true);
      expect(v.carburant, 87.5);
    });
  });

  group('PatientAccount / Personnel / Shift', () {
    test('PatientAccount — accepte id OU _id', () {
      final p1 = PatientAccount.fromJson({'_id': 'u1', 'nom': 'X', 'prenom': 'Y'});
      expect(p1.id, 'u1');
      final p2 = PatientAccount.fromJson({'id': 'u2', 'nom': 'X', 'prenom': 'Y'});
      expect(p2.id, 'u2');
    });

    test('Personnel parse', () {
      final p = Personnel.fromJson({
        '_id': 'p1', 'nom': 'Martin', 'prenom': 'Jean',
        'email': 'j@bb.fr', 'role': 'Chauffeur', 'statut': 'En shift',
      });
      expect(p.id, 'p1');
      expect(p.role, 'Chauffeur');
    });

    test('Shift — vehicleId polymorphe (string vs map)', () {
      final s1 = Shift.fromJson({
        '_id': 's1', 'personnelId': 'p1', 'vehicleId': 'v1', 'status': 'ACTIVE',
      });
      expect(s1.vehicleId, 'v1');

      final s2 = Shift.fromJson({
        '_id': 's2', 'personnelId': 'p1',
        'vehicleId': {'_id': 'v2', 'immatriculation': 'XX'},
        'status': 'ACTIVE',
      });
      expect(s2.vehicleId, 'v2');
    });
  });

  group('Facture / Prescription / AppNotification / TrackingPoint', () {
    test('Facture parse minimal', () {
      final f = Facture.fromJson({
        '_id': 'f1', 'numero': 'FAC-2026-0042', 'montantTotal': 120.5,
        'statut': 'payee',
      });
      expect(f.id, 'f1');
      expect(f.montantTotal, 120.5);
    });

    test('Prescription parse', () {
      final pr = Prescription.fromJson({
        '_id': 'pr1', 'motif': 'Dialyse', 'source': 'app_mobile',
      });
      expect(pr.id, 'pr1');
      expect(pr.source, 'app_mobile');
    });

    test('AppNotification parse + read=false par défaut', () {
      final n = AppNotification.fromJson({
        '_id': 'n1', 'title': 'Hello', 'message': 'World',
      });
      expect(n.id, 'n1');
      expect(n.read, false);
      expect(n.archived, false);
    });

    test('TrackingPoint round-trip', () {
      final pt = TrackingPoint(lat: 43.71, lng: 7.26, speed: 50);
      final json = pt.toJson();
      final back = TrackingPoint.fromJson(json);
      expect(back.lat, 43.71);
      expect(back.lng, 7.26);
      expect(back.speed, 50);
    });
  });
}
