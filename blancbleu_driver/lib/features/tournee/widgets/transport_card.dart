import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../cubit/tournee_cubit.dart';
import '../../../core/offline/action_queue.dart';
import '../../../shared/theme/app_theme.dart';

// ── Status configuration ──────────────────────────────────────────────────────
class _SCfg {
  final String label;
  final Color  color;
  final Color  bg;
  final bool   strike;
  const _SCfg(this.label, this.color, this.bg, {this.strike = false});
}

const _grey   = Color(0xFF6B7280);
const _blue   = Color(0xFF2563EB);
const _orange = Color(0xFFF97316);
const _violet = Color(0xFF7C3AED);
const _green  = Color(0xFF16A34A);
const _dkGrn  = Color(0xFF15803D);
const _red    = Color(0xFFDC2626);

const _bgGrey   = Color(0xFFF3F4F6);
const _bgBlue   = Color(0xFFEFF6FF);
const _bgOrange = Color(0xFFFFF7ED);
const _bgViolet = Color(0xFFF5F3FF);
const _bgGreen  = Color(0xFFF0FDF4);
const _bgRed    = Color(0xFFFEF2F2);

const _statusCfg = <String, _SCfg>{
  // Statuts nominaux (valeurs API)
  'REQUESTED':              _SCfg('Demande',    _grey,   _bgGrey),
  'CONFIRMED':              _SCfg('Confirmé',   _blue,   _bgBlue),
  'SCHEDULED':              _SCfg('Planifié',   _blue,   _bgBlue),
  'ASSIGNED':               _SCfg('À venir',    _grey,   _bgGrey),
  'DRIVER_ACCEPTED':        _SCfg('Accepté',    _blue,   _bgBlue),
  'DRIVER_REJECTED':        _SCfg('Refusé',     _red,    _bgRed),
  'EN_ROUTE_TO_PICKUP':     _SCfg('En route',   _blue,   _bgBlue),
  'ARRIVED_AT_PICKUP':      _SCfg('Arrivé',     _orange, _bgOrange),
  'PATIENT_ON_BOARD':       _SCfg('Embarqué',   _violet, _bgViolet),
  'ARRIVED_AT_DESTINATION': _SCfg('Déposé',     _green,  _bgGreen),
  'WAITING_AT_DESTINATION': _SCfg('En attente', _orange, _bgOrange),
  'RETURN_TO_BASE':         _SCfg('Retour base',_blue,   _bgBlue),
  'COMPLETED':              _SCfg('Terminé',    _dkGrn,  _bgGreen),
  'BILLING_PENDING':        _SCfg('Facturation',_grey,   _bgGrey),
  'BILLED':                 _SCfg('Facturé',    _green,  _bgGreen),
  'PAID':                   _SCfg('Payé',       _dkGrn,  _bgGreen),
  'CANCELLED':              _SCfg('Annulé',     _red,    _bgRed, strike: true),
  'NO_SHOW':                _SCfg('Absent',     _red,    _bgRed, strike: true),
  'FAILED':                 _SCfg('Échec',      _red,    _bgRed, strike: true),
  'RESCHEDULED':            _SCfg('Reprog.',    _orange, _bgOrange),
  // Alias courts (rétrocompat)
  'EN_ROUTE':               _SCfg('En route',   _blue,   _bgBlue),
  'ARRIVED':                _SCfg('Arrivé',     _orange, _bgOrange),
  'ON_BOARD':               _SCfg('Embarqué',   _violet, _bgViolet),
  'AT_DESTINATION':         _SCfg('Déposé',     _green,  _bgGreen),
};

// Statut suivant à envoyer à l'API pour chaque statut courant.
// L'API attend les noms complets (EN_ROUTE_TO_PICKUP, ARRIVED_AT_PICKUP, etc.)
const _nextStatus = <String, String>{
  // Statuts nominaux (valeurs renvoyées par l'API)
  'ASSIGNED':               'EN_ROUTE_TO_PICKUP',
  'DRIVER_ACCEPTED':        'EN_ROUTE_TO_PICKUP',
  'EN_ROUTE_TO_PICKUP':     'ARRIVED_AT_PICKUP',
  'ARRIVED_AT_PICKUP':      'PATIENT_ON_BOARD',
  'PATIENT_ON_BOARD':       'ARRIVED_AT_DESTINATION',
  'ARRIVED_AT_DESTINATION': 'COMPLETED',
  // Alias courts (rétrocompat, cas où l'API retournerait une ancienne valeur)
  'EN_ROUTE':               'ARRIVED_AT_PICKUP',
  'ARRIVED':                'PATIENT_ON_BOARD',
  'ON_BOARD':               'ARRIVED_AT_DESTINATION',
  'AT_DESTINATION':         'COMPLETED',
};

const _actionLabel = <String, String>{
  'ASSIGNED':               'Démarrer',
  'DRIVER_ACCEPTED':        'Démarrer',
  'EN_ROUTE_TO_PICKUP':     'Je suis arrivé',
  'ARRIVED_AT_PICKUP':      'Patient embarqué',
  'PATIENT_ON_BOARD':       'Déposer le patient',
  'ARRIVED_AT_DESTINATION': 'Terminer',
  // Alias courts
  'EN_ROUTE':               'Je suis arrivé',
  'ARRIVED':                'Patient embarqué',
  'ON_BOARD':               'Déposer le patient',
  'AT_DESTINATION':         'Terminer',
};

const _actionColor = <String, Color>{
  'ASSIGNED':               _blue,
  'DRIVER_ACCEPTED':        _blue,
  'EN_ROUTE_TO_PICKUP':     _orange,
  'ARRIVED_AT_PICKUP':      _violet,
  'PATIENT_ON_BOARD':       _green,
  'ARRIVED_AT_DESTINATION': _dkGrn,
  // Alias courts
  'EN_ROUTE':               _orange,
  'ARRIVED':                _violet,
  'ON_BOARD':               _green,
  'AT_DESTINATION':         _dkGrn,
};

// ── Widget ────────────────────────────────────────────────────────────────────
class TransportCard extends StatefulWidget {
  final Map<String, dynamic> transport;
  const TransportCard({super.key, required this.transport});

  @override
  State<TransportCard> createState() => _TransportCardState();
}

class _TransportCardState extends State<TransportCard> {
  bool _loading = false;

  // ── Helpers ────────────────────────────────────────────────────────────────

  String _fmtAdresse(dynamic a) {
    if (a == null) return '—';
    if (a is String) return a;
    final m = a as Map;
    return [m['nom'], m['rue'], m['ville']]
        .where((s) => s != null && s.toString().isNotEmpty)
        .join(', ');
  }

  String _fmtHeure(dynamic h) {
    final s = h?.toString() ?? '';
    return s.length >= 5 ? s.substring(0, 5) : '--:--';
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  Future<void> _updateStatus(String newStatus) async {
    final id = (widget.transport['_id'] ?? widget.transport['id'])?.toString();
    if (id == null) return;
    setState(() => _loading = true);
    try {
      // Sprint M6 — offline-first : enqueue plutôt qu'appel direct. Si
      // online la queue exécute immédiatement, sinon l'action sera
      // rejouée au retour réseau (zones blanches montagne/parking).
      await ActionQueue.instance.enqueue(
        QueuedAction.transportStatus(transportId: id, newStatus: newStatus),
      );
      if (mounted) {
        // Update optimiste du cubit — l'utilisateur voit l'effet immédiat ;
        // si la sync échoue plus tard, la prochaine SyncService.sync() corrigera.
        context.read<TourneeCubit>().updateTransportStatus(id, newStatus);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erreur: ${e.toString()}'),
          backgroundColor: AppTheme.error,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _navigate(String address) async {
    if (address == '—') return;
    final encoded = Uri.encodeComponent(address);

    // Try native Google Maps intent on Android
    if (!Platform.isIOS) {
      final gMaps = Uri.parse('google.navigation:q=$encoded&mode=d');
      if (await canLaunchUrl(gMaps)) {
        await launchUrl(gMaps, mode: LaunchMode.externalApplication);
        return;
      }
    }

    // iOS — try Apple Maps; Android fallback
    final mapsUrl = Platform.isIOS
        ? 'https://maps.apple.com/?q=$encoded&dirflg=d'
        : 'https://maps.google.com/maps?q=$encoded';
    await launchUrl(Uri.parse(mapsUrl), mode: LaunchMode.externalApplication);
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final statut      = widget.transport['statut'] as String? ?? 'ASSIGNED';
    final cfg         = _statusCfg[statut] ?? const _SCfg('À venir', _grey, _bgGrey);
    final patient     = widget.transport['patient'] as Map? ?? {};
    final patientNom  = [patient['prenom'], patient['nom']]
        .where((s) => s != null && s.toString().isNotEmpty)
        .join(' ');
    final destination = _fmtAdresse(widget.transport['adresseDestination']);
    final heure       = _fmtHeure(widget.transport['heureRDV']);

    final nextStatus  = _nextStatus[statut];
    final actionLabel = _actionLabel[statut];
    final actionColor = _actionColor[statut] ?? _blue;
    final isTerminal  = statut == 'COMPLETED' || statut == 'CANCELLED' ||
                       statut == 'NO_SHOW'   || statut == 'FAILED';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF0F0F0)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Row 1 : heure + badge statut ─────────────────────────────────
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.access_time, size: 12, color: AppTheme.secondary),
                  const SizedBox(width: 4),
                  Text(
                    heure,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
                  ),
                ]),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: cfg.bg, borderRadius: BorderRadius.circular(20)),
                child: Text(
                  cfg.label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: cfg.color,
                    decoration: cfg.strike ? TextDecoration.lineThrough : null,
                    decorationColor: cfg.color,
                  ),
                ),
              ),
            ]),

            const SizedBox(height: 10),

            // ── Nom patient ───────────────────────────────────────────────────
            Text(
              patientNom.isNotEmpty ? patientNom : '—',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
            ),

            const SizedBox(height: 4),

            // ── Adresse destination ───────────────────────────────────────────
            Row(children: [
              const Icon(Icons.location_on, size: 14, color: AppTheme.error),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  destination,
                  style: const TextStyle(fontSize: 12, color: AppTheme.secondary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ]),

            // ── Boutons d'action (masqués si terminal) ────────────────────────
            if (!isTerminal) ...[
              const SizedBox(height: 12),
              const Divider(height: 1, color: Color(0xFFF0F0F0)),
              const SizedBox(height: 10),
              Row(children: [
                // Naviguer
                Expanded(
                  flex: 2,
                  child: OutlinedButton.icon(
                    onPressed: () => _navigate(destination),
                    icon: const Icon(Icons.navigation_outlined, size: 15),
                    label: const Text('Naviguer', style: TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primary,
                      side: const BorderSide(color: AppTheme.primary),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ),

                if (nextStatus != null && actionLabel != null) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 3,
                    child: ElevatedButton(
                      onPressed: _loading ? null : () => _updateStatus(nextStatus),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: actionColor,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: actionColor.withOpacity(0.6),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: _loading
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                            )
                          : Text(
                              actionLabel,
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                            ),
                    ),
                  ),
                ],
              ]),
            ],
          ],
        ),
      ),
    );
  }
}
