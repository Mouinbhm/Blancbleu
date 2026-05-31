/// Routeur deep-link FCM partagé entre les deux apps.
///
/// Sprint M4 : `_handleFcmDeepLink` se contentait d'un snackbar. M6 :
/// vraie navigation vers une route nommée définie côté app.
///
/// Contrat : chaque app construit une map `{ type → routeBuilder }` qui
/// renvoie une chaîne de route nommée à partir des `data` du push. La map
/// est différente entre driver et patient (le même push `transport_assigned`
/// route vers `/transport/:id` côté driver et `/my-transport/:id` côté
/// patient).
///
/// Types FCM supportés (clé `data.type`) :
///   - transport_assigned : nouvelle mission (driver) / véhicule attribué (patient)
///   - transport_status   : changement de statut
///   - message_received   : nouveau message chat → data.conversationId
///   - payment_completed  : paiement encaissé → data.factureId ou data.id
///   - new_prescription   : nouvelle PMT → data.prescriptionId ou data.id
///
/// La navigation utilise le `GlobalKey<NavigatorState>` fourni par l'app.
/// Si le navigator n'est pas encore monté (cold start très précoce), un
/// retry au prochain frame.
library;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';

import '../utils/logger.dart';

/// Builder qui transforme un payload FCM en route nommée + arguments.
/// Renvoie `null` si la route ne s'applique pas (type inconnu / id manquant).
typedef FcmRouteBuilder = FcmRoute? Function(Map<String, dynamic> data);

class FcmRoute {
  const FcmRoute(this.name, {this.arguments});
  final String name;
  final Object? arguments;
}

class FcmRouter {
  FcmRouter({
    required this.navigatorKey,
    required this.routes,
  });

  final GlobalKey<NavigatorState> navigatorKey;

  /// Map keyée par `data.type`. Une app driver et une app patient
  /// fournissent des maps différentes.
  final Map<String, FcmRouteBuilder> routes;

  /// À appeler dans `PushService.attachHandlers(onMessageTap: router.route)`.
  void route(RemoteMessage message) {
    final type = message.data['type']?.toString();
    if (type == null || type.isEmpty) {
      BbLog.d('[FcmRouter] message sans data.type, ignoré');
      return;
    }
    final builder = routes[type];
    if (builder == null) {
      BbLog.d('[FcmRouter] type "$type" sans route définie, ignoré');
      return;
    }
    // Normalise les valeurs en String pour les builders (FCM data est tjs
    // String mais on protège contre les payloads de tests).
    final data = <String, dynamic>{
      for (final e in message.data.entries) e.key: e.value?.toString(),
    };
    final target = builder(data);
    if (target == null) {
      BbLog.d('[FcmRouter] builder "$type" a renvoyé null, payload incomplet');
      return;
    }
    _pushWhenReady(target);
  }

  /// Tente de naviguer ; si le NavigatorState n'est pas encore monté
  /// (cold start très précoce), retry au prochain frame puis abandonne
  /// après 10 frames (~166 ms).
  void _pushWhenReady(FcmRoute target, {int retriesLeft = 10}) {
    final state = navigatorKey.currentState;
    if (state != null) {
      BbLog.d('[FcmRouter] navigation vers ${target.name}');
      state.pushNamed(target.name, arguments: target.arguments);
      return;
    }
    if (retriesLeft <= 0) {
      BbLog.d('[FcmRouter] navigator non monté après 10 retries, abandon');
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _pushWhenReady(target, retriesLeft: retriesLeft - 1);
    });
  }
}

/// Helpers — extraction d'identifiants depuis le payload FCM, qui sont
/// systématiquement des `String`. Certains backends envoient `id` plutôt
/// que `<entité>Id` ; on accepte les deux.
String? fcmId(Map<String, dynamic> data, String preferredKey) {
  final v = data[preferredKey] ?? data['id'];
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}
