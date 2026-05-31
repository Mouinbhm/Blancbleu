/// Helpers de demande de permission avec rationale UI.
///
/// Sans rationale, l'utilisateur voit la popup système sans contexte et
/// refuse 2-3× plus souvent (cf. Google Material guidelines + Apple HIG).
/// Pour un transport sanitaire, le refus de la géoloc casse silencieusement
/// le tracking → on prévient l'utilisateur, puis on demande, puis si refus
/// persistant on l'envoie aux Réglages système.
///
/// Flux :
///   1. Si déjà accordée → return true tout de suite (no-op silencieux).
///   2. Si jamais demandée → AlertDialog "voici pourquoi" → request().
///   3. Si refus définitif → AlertDialog "ouvrir les Réglages".
///
/// Les textes sont français, respectueux, expliquent l'usage concret côté
/// métier (pas du jargon technique).
library;

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

class PermissionHelper {
  PermissionHelper._();

  /// Demande la permission de géolocalisation avec rationale.
  ///
  /// Cas d'usage : chauffeur ambulance → tracking GPS temps réel pour que
  /// le dispatcher et le patient voient la position du véhicule pendant la
  /// course.
  ///
  /// Renvoie `true` si accordée (au minimum `whileInUse`), `false` sinon.
  static Future<bool> requestLocationWithRationale(
    BuildContext context, {
    String? customRationale,
  }) async {
    final current = await Permission.location.status;
    if (current.isGranted) return true;

    if (current.isPermanentlyDenied) {
      // ignore: use_build_context_synchronously
      return _showOpenSettingsDialog(
        context,
        title: 'Localisation désactivée',
        body:
            'Vous avez refusé la localisation de manière définitive. Pour activer le '
            'suivi GPS pendant vos courses, ouvrez les Réglages et autorisez la '
            'localisation pour Blanc Bleu.',
      );
    }

    // ignore: use_build_context_synchronously
    final accepted = await _showRationaleDialog(
      context,
      title: 'Pourquoi accéder à votre position ?',
      body: customRationale ??
          'Blanc Bleu utilise votre position en temps réel pour :\n'
              '\n'
              '• transmettre le suivi GPS au dispatcher pendant la course,\n'
              '• permettre au patient de voir le véhicule approcher,\n'
              '• calculer l’itinéraire optimal vers le point de prise en charge.\n'
              '\n'
              'La position n’est partagée que pendant un shift actif. Aucune trace '
              'n’est conservée en dehors des missions.',
      acceptLabel: 'Autoriser',
      declineLabel: 'Plus tard',
    );
    if (!accepted) return false;

    final result = await Permission.location.request();
    if (result.isPermanentlyDenied) {
      // ignore: use_build_context_synchronously
      return _showOpenSettingsDialog(
        context,
        title: 'Localisation requise',
        body:
            'Le suivi GPS est indispensable au métier. Vous pouvez réactiver la '
            'permission depuis les Réglages système.',
      );
    }
    return result.isGranted;
  }

  /// Demande la permission de notifications avec rationale.
  ///
  /// Cas d'usage commun aux deux apps : push FCM pour alertes mission
  /// (chauffeur) ou évolution de statut transport (patient).
  ///
  /// Renvoie `true` si accordée, `false` sinon.
  static Future<bool> requestNotificationsWithRationale(
    BuildContext context, {
    String? customRationale,
  }) async {
    final current = await Permission.notification.status;
    if (current.isGranted) return true;

    if (current.isPermanentlyDenied) {
      // ignore: use_build_context_synchronously
      return _showOpenSettingsDialog(
        context,
        title: 'Notifications désactivées',
        body:
            'Vous avez refusé les notifications de manière définitive. Pour recevoir '
            'les alertes importantes (nouvelle mission, statut transport), ouvrez les '
            'Réglages et autorisez les notifications pour Blanc Bleu.',
      );
    }

    // ignore: use_build_context_synchronously
    final accepted = await _showRationaleDialog(
      context,
      title: 'Recevoir les alertes importantes',
      body: customRationale ??
          'Blanc Bleu envoie des notifications uniquement pour des évènements '
              'critiques :\n'
              '\n'
              '• nouvelle mission assignée,\n'
              '• changement de statut de votre transport,\n'
              '• facture disponible ou paiement reçu.\n'
              '\n'
              'Pas de publicité, pas de spam. Vous pouvez les désactiver à tout '
              'moment dans les Réglages.',
      acceptLabel: 'Activer',
      declineLabel: 'Plus tard',
    );
    if (!accepted) return false;

    final result = await Permission.notification.request();
    if (result.isPermanentlyDenied) {
      // ignore: use_build_context_synchronously
      return _showOpenSettingsDialog(
        context,
        title: 'Notifications requises',
        body:
            'Sans notifications, vous risquez de manquer des évènements importants. '
            'Vous pouvez les réactiver depuis les Réglages système.',
      );
    }
    return result.isGranted;
  }

  // ── Internes ──────────────────────────────────────────────────────────────

  static Future<bool> _showRationaleDialog(
    BuildContext context, {
    required String title,
    required String body,
    required String acceptLabel,
    required String declineLabel,
  }) async {
    if (!context.mounted) return false;
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(child: Text(body)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(declineLabel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(acceptLabel),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  /// Renvoie `true` si l'utilisateur a cliqué "Ouvrir les Réglages" — pas si
  /// la permission est effectivement accordée (impossible à savoir avant le
  /// retour app au foreground).
  static Future<bool> _showOpenSettingsDialog(
    BuildContext context, {
    required String title,
    required String body,
  }) async {
    if (!context.mounted) return false;
    final opened = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(child: Text(body)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Plus tard'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(ctx).pop(true);
              await openAppSettings();
            },
            child: const Text('Ouvrir les Réglages'),
          ),
        ],
      ),
    );
    return opened ?? false;
  }
}
