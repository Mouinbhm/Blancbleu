import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../cubit/status_cubit.dart';
import '../../navigation/navigation_helper.dart';
import '../../documents/screens/signature_screen.dart';
import '../../documents/screens/pmt_photo_screen.dart';
import '../../shift/cubit/shift_cubit.dart';
import '../../tournee/cubit/tournee_cubit.dart';
import '../../../core/network/api_client.dart';
import '../../../core/location/location_service.dart';
import '../../../shared/theme/app_theme.dart';

class TransportDetailScreen extends StatefulWidget {
  final Map<String, dynamic> transport;
  const TransportDetailScreen({super.key, required this.transport});

  @override
  State<TransportDetailScreen> createState() => _TransportDetailScreenState();
}

class _TransportDetailScreenState extends State<TransportDetailScreen> {
  bool _pmtDone = false;
  bool _sigDone = false;

  static const _steps = [
    {'status': 'ASSIGNED',               'label': 'Assigné',        'icon': Icons.assignment},
    {'status': 'EN_ROUTE_TO_PICKUP',     'label': 'En route',       'icon': Icons.directions_car},
    {'status': 'ARRIVED_AT_PICKUP',      'label': 'Arrivé patient', 'icon': Icons.person_pin_circle},
    {'status': 'PATIENT_ON_BOARD',       'label': 'Patient à bord', 'icon': Icons.airline_seat_recline_normal},
    {'status': 'ARRIVED_AT_DESTINATION', 'label': 'À destination',  'icon': Icons.local_hospital},
    {'status': 'COMPLETED',              'label': 'Terminé',        'icon': Icons.check_circle},
  ];

  static const _nextAction = {
    'ASSIGNED':               'Partir',
    'EN_ROUTE_TO_PICKUP':     'Arrivé au patient',
    'ARRIVED_AT_PICKUP':      'Patient à bord',
    'PATIENT_ON_BOARD':       'Arrivé à destination',
    'ARRIVED_AT_DESTINATION': 'Terminer',
  };

  static const _nextStatus = {
    'ASSIGNED':               'EN_ROUTE_TO_PICKUP',
    'EN_ROUTE_TO_PICKUP':     'ARRIVED_AT_PICKUP',
    'ARRIVED_AT_PICKUP':      'PATIENT_ON_BOARD',
    'PATIENT_ON_BOARD':       'ARRIVED_AT_DESTINATION',
    'ARRIVED_AT_DESTINATION': 'COMPLETED',
  };

  static const _actionColors = {
    'ASSIGNED':               Color(0xFF16A34A), // green
    'EN_ROUTE_TO_PICKUP':     Color(0xFF2563EB), // blue
    'ARRIVED_AT_PICKUP':      Color(0xFFF59E0B), // amber
    'PATIENT_ON_BOARD':       Color(0xFF7C3AED), // purple
    'ARRIVED_AT_DESTINATION': Color(0xFF0D9488), // teal
  };

  static const _actionIcons = {
    'ASSIGNED':               Icons.directions_car,
    'EN_ROUTE_TO_PICKUP':     Icons.person_pin_circle,
    'ARRIVED_AT_PICKUP':      Icons.airline_seat_recline_normal,
    'PATIENT_ON_BOARD':       Icons.local_hospital,
    'ARRIVED_AT_DESTINATION': Icons.check_circle_outline,
  };

  String _fmtAdresse(dynamic a) {
    if (a == null) return '—';
    if (a is String) return a;
    final m = a as Map;
    return [m['nom'], m['rue'], m['ville']].where((s) => s != null && s.toString().isNotEmpty).join(', ');
  }

  double? _lat(dynamic a) {
    if (a is! Map) return null;
    final coords = a['coordonnees'];
    if (coords is! Map) return null;
    return (coords['lat'] as num?)?.toDouble();
  }

  double? _lng(dynamic a) {
    if (a is! Map) return null;
    final coords = a['coordonnees'];
    if (coords is! Map) return null;
    return (coords['lng'] as num?)?.toDouble();
  }

  int? _age(dynamic dateNaiss) {
    if (dateNaiss == null) return null;
    try {
      final dt = DateTime.parse(dateNaiss.toString());
      final now = DateTime.now();
      int age = now.year - dt.year;
      if (now.month < dt.month || (now.month == dt.month && now.day < dt.day)) age--;
      return age;
    } catch (_) {
      return null;
    }
  }

  Future<void> _call(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (!await launchUrl(uri)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Impossible d\'appeler $phone')),
        );
      }
    }
  }

  void _showSosDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(children: [
          Icon(Icons.emergency, color: Colors.red, size: 24),
          SizedBox(width: 8),
          Text('Envoyer une alerte SOS ?'),
        ]),
        content: const Text('Le dispatcher sera immédiatement notifié et votre position envoyée.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await _sendSos();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('ENVOYER SOS'),
          ),
        ],
      ),
    );
  }

  Future<void> _sendSos() async {
    // Sprint M6 — rationale UI avant la popup système (cf. permission_helper).
    await LocationService.instance.requestPermissionWithRationale(context);
    if (!mounted) return;
    final pos = await LocationService.instance.getCurrentPosition();
    if (!mounted) return;
    final shiftState = context.read<ShiftCubit>().state;
    final shiftId = shiftState is ShiftActive ? shiftState.shift['_id']?.toString() : null;
    final transportId = (widget.transport['_id'] ?? widget.transport['id'])?.toString();
    try {
      await ApiClient.instance.sosSend(
        lat: pos?.latitude,
        lng: pos?.longitude,
        shiftId: shiftId,
        transportId: transportId,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('🚨 Alerte SOS envoyée'),
          backgroundColor: Colors.red,
        ));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Erreur lors de l\'envoi SOS'),
          backgroundColor: Colors.red,
        ));
      }
    }
  }

  void _showIncidentDialog(BuildContext context) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Signaler un incident'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(hintText: 'Description du problème...'),
          maxLines: 3,
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () async {
              final desc = ctrl.text.trim();
              if (desc.isEmpty) return;
              Navigator.pop(ctx);
              try {
                await ApiClient.instance.addIncident(desc);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Incident signalé'), backgroundColor: AppTheme.warning),
                  );
                }
              } catch (_) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Incident enregistré localement'), backgroundColor: AppTheme.warning),
                  );
                }
              }
            },
            style: ElevatedButton.styleFrom(minimumSize: const Size(0, 0)),
            child: const Text('Signaler'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final id     = (widget.transport['_id'] ?? widget.transport['id'] ?? '') as String;
    final statut = widget.transport['statut'] as String? ?? 'ASSIGNED';
    final patient = widget.transport['patient'] as Map? ?? {};

    return BlocProvider(
      create: (_) => StatusCubit(transportId: id, currentStatus: statut),
      child: Builder(builder: (ctx) => _buildBody(ctx, patient)),
    );
  }

  Widget _buildBody(BuildContext context, Map patient) {
    final id = (widget.transport['_id'] ?? widget.transport['id'] ?? '') as String;
    return BlocConsumer<StatusCubit, StatusState>(
      listener: (context, state) {
        if (state is StatusOfflineQueued) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Hors ligne — sera synchronisé à la reconnexion'),
            backgroundColor: AppTheme.warning,
          ));
          // Keep TourneeCubit in sync even for offline queued updates
          context.read<TourneeCubit>().updateTransportStatus(id, state.status);
        }
        if (state is StatusUpdated) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Statut mis à jour ✓'),
            backgroundColor: AppTheme.success,
          ));
          // Sync TourneeCubit so the transport card shows the new status
          // immediately when the user navigates back — no server re-fetch needed.
          context.read<TourneeCubit>().updateTransportStatus(id, state.status);
        }
      },
      builder: (context, state) {
        final cubit   = context.read<StatusCubit>();
        final current = cubit.currentStatus;
        final action  = _nextAction[current];
        final next    = _nextStatus[current];
        final busy    = state is StatusUpdating;
        final color   = _actionColors[current] ?? AppTheme.primary;

        return Scaffold(
          backgroundColor: AppTheme.background,
          appBar: AppBar(
            title: Text(widget.transport['numero'] as String? ?? '—'),
            actions: [
              IconButton(
                icon: const Icon(Icons.report_problem_outlined),
                tooltip: 'Signaler un incident',
                onPressed: () => _showIncidentDialog(context),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton(
            onPressed: _showSosDialog,
            backgroundColor: Colors.red,
            tooltip: 'SOS',
            child: const Icon(Icons.emergency, color: Colors.white),
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Patient card
                _card(children: [
                  _section('Patient', Icons.person),
                  const SizedBox(height: 10),
                  Row(children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: AppTheme.primary.withOpacity(0.12),
                      child: Text(
                        '${(patient['prenom'] as String? ?? '?')[0]}${(patient['nom'] as String? ?? '')[0]}'.toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.primary, fontSize: 15),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${patient['prenom'] ?? ''} ${patient['nom'] ?? ''}'.trim().isNotEmpty
                            ? '${patient['prenom'] ?? ''} ${patient['nom'] ?? ''}'.trim()
                            : '—',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
                        ),
                        Row(children: [
                          if (_age(patient['dateNaissance']) != null) ...[
                            Text('${_age(patient['dateNaissance'])} ans', style: const TextStyle(fontSize: 12, color: AppTheme.secondary)),
                            const SizedBox(width: 8),
                          ],
                          if ((patient['mobilite'] as String? ?? '').isNotEmpty)
                            Text(patient['mobilite'] as String, style: const TextStyle(fontSize: 12, color: AppTheme.secondary)),
                        ]),
                      ],
                    )),
                  ]),
                  if ((patient['antecedents'] as String? ?? '').isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: const Color(0xFFFFF7ED), borderRadius: BorderRadius.circular(8)),
                      child: Row(children: [
                        const Icon(Icons.info_outline, size: 14, color: Color(0xFFF97316)),
                        const SizedBox(width: 6),
                        Expanded(child: Text(patient['antecedents'] as String, style: const TextStyle(fontSize: 12, color: Color(0xFF92400E)))),
                      ]),
                    ),
                  ],
                  // Emergency contact + call button
                  if ((patient['contactPhone'] ?? patient['telephone'] ?? patient['contactUrgence']) != null) ...[
                    const SizedBox(height: 10),
                    const Divider(height: 1),
                    const SizedBox(height: 10),
                    _contactRow(patient),
                  ],
                ]),
                const SizedBox(height: 12),

                // Addresses + navigation
                _card(children: [
                  _section('Itinéraire', Icons.route),
                  const SizedBox(height: 10),
                  _adresseRow(context, '🟢 Départ', widget.transport['adresseDepart'], AppTheme.primary, isPickup: true),
                  const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Divider(height: 1)),
                  _adresseRow(context, '🔴 Destination', widget.transport['adresseDestination'], AppTheme.error, isPickup: false),
                ]),
                const SizedBox(height: 12),

                // Status stepper
                _card(children: [
                  _section('Progression', Icons.linear_scale),
                  const SizedBox(height: 12),
                  ..._steps.map((s) => _stepRow(s['status'] as String, s['label'] as String, s['icon'] as IconData, current)),
                ]),
                const SizedBox(height: 12),

                // Notes
                if ((widget.transport['notes'] as String? ?? '').isNotEmpty)
                  _card(children: [
                    _section('Notes', Icons.notes),
                    const SizedBox(height: 8),
                    Text(widget.transport['notes'] as String, style: const TextStyle(fontSize: 13, color: AppTheme.secondary)),
                  ]),

                const SizedBox(height: 16),

                // Action button with status color
                if (action != null && next != null)
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: busy ? null : () => _confirmAction(context, next, action, color),
                      style: ElevatedButton.styleFrom(backgroundColor: color),
                      icon: busy
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : Icon(_actionIcons[current] ?? Icons.arrow_forward),
                      label: Text(busy ? 'Mise à jour...' : action),
                    ),
                  ),

                // Documents section (ARRIVED_AT_DESTINATION or COMPLETED)
                if (current == 'ARRIVED_AT_DESTINATION' || current == 'COMPLETED') ...[
                  const SizedBox(height: 16),
                  _card(children: [
                    _section('Documents', Icons.folder_outlined),
                    const SizedBox(height: 12),
                    _docButton(
                      label: 'Signature patient',
                      icon: Icons.draw,
                      done: _sigDone,
                      onTap: () async {
                        final ok = await Navigator.push<bool>(context, MaterialPageRoute(
                          builder: (_) => SignatureScreen(transportId: (widget.transport['_id'] ?? widget.transport['id']) as String),
                        ));
                        if (ok == true && mounted) setState(() => _sigDone = true);
                      },
                    ),
                    const SizedBox(height: 8),
                    _docButton(
                      label: 'Photo PMT / Ordonnance',
                      icon: Icons.camera_alt_outlined,
                      done: _pmtDone,
                      onTap: () async {
                        final ok = await Navigator.push<bool>(context, MaterialPageRoute(
                          builder: (_) => PmtPhotoScreen(transportId: (widget.transport['_id'] ?? widget.transport['id']) as String),
                        ));
                        if (ok == true && mounted) setState(() => _pmtDone = true);
                      },
                    ),
                  ]),
                ],

                const SizedBox(height: 16),
                // Incident link
                TextButton.icon(
                  onPressed: () => _showIncidentDialog(context),
                  icon: const Icon(Icons.warning_amber_outlined, size: 16, color: AppTheme.warning),
                  label: const Text('Signaler un problème', style: TextStyle(color: AppTheme.warning, fontSize: 13)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _confirmAction(BuildContext context, String next, String label, Color color) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmer ?'),
        content: Text('Passer le transport à : $label'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<StatusCubit>().update(next);
            },
            style: ElevatedButton.styleFrom(backgroundColor: color, minimumSize: const Size(0, 0)),
            child: const Text('Confirmer'),
          ),
        ],
      ),
    );
  }

  Widget _contactRow(Map patient) {
    final phone = patient['contactPhone']?.toString()
        ?? patient['telephone']?.toString()
        ?? patient['contactUrgence']?.toString()
        ?? '';
    final contactName = patient['contactNom']?.toString() ?? patient['nomContact']?.toString() ?? '';
    return Row(children: [
      const Icon(Icons.phone_in_talk_outlined, size: 16, color: AppTheme.secondary),
      const SizedBox(width: 8),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (contactName.isNotEmpty)
          Text(contactName, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
        Text(phone.isNotEmpty ? phone : '—', style: const TextStyle(fontSize: 12, color: AppTheme.secondary)),
      ])),
      if (phone.isNotEmpty)
        ElevatedButton.icon(
          onPressed: () => _call(phone),
          icon: const Icon(Icons.call, size: 16),
          label: const Text('Appeler'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.success,
            minimumSize: const Size(0, 0),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          ),
        ),
    ]);
  }

  Widget _docButton({required String label, required IconData icon, required bool done, required VoidCallback onTap}) =>
    InkWell(
      onTap: done ? null : onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: done ? const Color(0xFFECFDF5) : AppTheme.background,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: done ? const Color(0xFF6EE7B7) : Colors.grey.shade200),
        ),
        child: Row(children: [
          Icon(icon, size: 20, color: done ? AppTheme.success : AppTheme.primary),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
            color: done ? AppTheme.success : AppTheme.onSurface))),
          Icon(done ? Icons.check_circle : Icons.chevron_right,
            size: 18, color: done ? AppTheme.success : AppTheme.secondary),
        ]),
      ),
    );

  Widget _adresseRow(BuildContext context, String label, dynamic adresse, Color color, {required bool isPickup}) {
    final lat = _lat(adresse);
    final lng = _lng(adresse);
    return Row(children: [
      const SizedBox(width: 4),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 10, color: AppTheme.secondary, fontWeight: FontWeight.w500)),
        const SizedBox(height: 2),
        Text(_fmtAdresse(adresse), style: const TextStyle(fontSize: 13, color: AppTheme.onSurface, fontWeight: FontWeight.w500)),
      ])),
      if (lat != null && lng != null)
        ElevatedButton.icon(
          onPressed: () => NavigationHelper.showChoice(context, lat, lng, _fmtAdresse(adresse)),
          icon: const Icon(Icons.navigation, size: 16),
          label: const Text('Naviguer'),
          style: ElevatedButton.styleFrom(
            backgroundColor: color,
            minimumSize: const Size(0, 0),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          ),
        ),
    ]);
  }

  Widget _stepRow(String status, String label, IconData icon, String current) {
    final stepIdx    = _steps.indexWhere((s) => s['status'] == status);
    final currentIdx = _steps.indexWhere((s) => s['status'] == current);
    final done    = stepIdx < currentIdx;
    final active  = stepIdx == currentIdx;
    final pending = stepIdx > currentIdx;

    final color = done ? AppTheme.success : active ? AppTheme.primary : Colors.grey.shade300;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Container(
          width: 28, height: 28,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          child: Icon(icon, size: 14, color: done || active ? Colors.white : Colors.grey.shade500),
        ),
        const SizedBox(width: 10),
        Text(label, style: TextStyle(
          fontSize: 13,
          fontWeight: active ? FontWeight.w700 : FontWeight.w400,
          color: pending ? Colors.grey.shade400 : AppTheme.onSurface,
        )),
        if (active) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(color: AppTheme.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
            child: const Text('Actuel', style: TextStyle(fontSize: 10, color: AppTheme.primary, fontWeight: FontWeight.w600)),
          ),
        ],
      ]),
    );
  }

  Widget _card({required List<Widget> children}) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.grey.shade100),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
  );

  Widget _section(String title, IconData icon) => Row(children: [
    Icon(icon, size: 16, color: AppTheme.primary),
    const SizedBox(width: 6),
    Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
  ]);
}
