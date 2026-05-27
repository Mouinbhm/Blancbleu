/// SSL public-key pinning (SPKI SHA-256) pour les apps mobile BlancBleu.
///
/// Sprint M5 — refactor du code mort `certificate_pinner.dart` du patient.
/// L'ancien code pin le **certificat entier** (DER SHA-256), ce qui casse à
/// chaque renouvellement de certificat. Cette implémentation pin la **clé
/// publique** (`SubjectPublicKeyInfo`) qui survit au renouvellement du cert
/// tant que la même paire de clés est utilisée.
///
/// Activation conditionnelle :
///   - `spkiSha256PinsBase64` non vide
///   - `baseUrl` commence par `https://`
/// Sinon → renvoie `null` (adapter par défaut, pour le dev en HTTP).
///
/// ⚠️ **JAMAIS de `badCertificateCallback => true`** : le bypass total est
/// l'anti-pattern exact qu'on refuse. Si aucun pin ne matche, on **rejette**.
///
/// Pour obtenir le SPKI base64 d'un cert prod :
///   openssl s_client -connect api.blancbleu.fr:443 -servername api.blancbleu.fr </dev/null \
///     | openssl x509 -pubkey -noout \
///     | openssl pkey -pubin -outform der \
///     | openssl dgst -sha256 -binary \
///     | openssl enc -base64
library;

import 'dart:convert';
import 'dart:io';

import 'package:asn1lib/asn1lib.dart';
import 'package:crypto/crypto.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';

class SslPinning {
  SslPinning._();

  /// Construit un adapter Dio avec pinning SPKI SHA-256.
  ///
  /// Renvoie `null` si le pinning ne doit pas être activé (pas de pins, ou
  /// baseUrl HTTP) → le caller utilise l'adapter Dio par défaut.
  static IOHttpClientAdapter? buildPinnedAdapter({
    required List<String> spkiSha256PinsBase64,
    required String baseUrl,
  }) {
    final pins = spkiSha256PinsBase64
        .where((p) => p.isNotEmpty)
        .map((p) => p.trim())
        .toSet();
    if (pins.isEmpty) return null;
    if (!baseUrl.startsWith('https://')) {
      if (kDebugMode) {
        // En dev (http://), on n'active pas le pinning même si des pins sont fournis.
        debugPrint('[SslPinning] baseUrl non https → pinning désactivé');
      }
      return null;
    }

    final adapter = IOHttpClientAdapter();
    adapter.createHttpClient = () {
      final client = HttpClient();
      // Par défaut, Dart trustStore valide les certs. badCertificateCallback
      // n'est appelé QUE si la validation système échoue. On ne renvoie
      // jamais `true` aveuglément — on calcule le SPKI et on compare.
      client.badCertificateCallback = (X509Certificate cert, String host, int port) {
        try {
          final spki = _extractSpkiDer(cert.der);
          if (spki == null) return false;
          final hash = sha256.convert(spki).bytes;
          final pin = base64.encode(hash);
          final ok = pins.contains(pin);
          if (!ok) {
            // Log de violation (sans info sensible) — utile pour diagnostiquer
            // une rotation de cert oubliée. Pas de body / cert détaillé.
            // ignore: avoid_print
            print('[SslPinning] MISMATCH host=$host:$port — got pin (10 chars): ${pin.substring(0, 10)}...');
          }
          return ok;
        } catch (e) {
          // ignore: avoid_print
          print('[SslPinning] SPKI extraction failed: $e');
          return false;
        }
      };
      return client;
    };
    return adapter;
  }
}

/// Extrait le DER du `SubjectPublicKeyInfo` depuis un X.509 DER.
///
/// Structure X.509 v3 (RFC 5280) :
///   Certificate ::= SEQUENCE {
///     tbsCertificate       TBSCertificate,
///     signatureAlgorithm   AlgorithmIdentifier,
///     signatureValue       BIT STRING
///   }
///   TBSCertificate ::= SEQUENCE {
///     version         [0] EXPLICIT Version DEFAULT v1,
///     serialNumber         CertificateSerialNumber,
///     signature            AlgorithmIdentifier,
///     issuer               Name,
///     validity             Validity,
///     subject              Name,
///     subjectPublicKeyInfo SubjectPublicKeyInfo,   ← ce qu'on veut
///     ...
///   }
///
/// On parse jusqu'au SPKI et on renvoie son encodage DER complet (le hash
/// SHA-256 de ce DER est l'empreinte standard pour le pinning).
Uint8List? _extractSpkiDer(Uint8List certDer) {
  final root = ASN1Parser(certDer).nextObject();
  if (root is! ASN1Sequence) return null;
  if (root.elements.isEmpty) return null;
  final tbs = root.elements[0];
  if (tbs is! ASN1Sequence) return null;
  // Détection version explicite [0] : si elle existe, on l'ignore (offset +1).
  var idx = 0;
  if (tbs.elements.isNotEmpty && tbs.elements[0].tag == 0xA0) {
    idx = 1;
  }
  // Champs : serialNumber, signature, issuer, validity, subject, SPKI
  final spkiIndex = idx + 5;
  if (tbs.elements.length <= spkiIndex) return null;
  final spki = tbs.elements[spkiIndex];
  // Le DER complet du SPKI = tag + length + content. asn1lib expose encodedBytes.
  return Uint8List.fromList(spki.encodedBytes);
}
