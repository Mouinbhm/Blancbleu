import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../cubit/shift_cubit.dart';
import '../../tournee/cubit/tournee_cubit.dart';
import '../../../core/network/api_client.dart';
import '../../../core/location/location_service.dart';
import '../../../features/documents/services/route_sheet_service.dart';
import '../../../services/gps_service.dart';
import '../../../shared/theme/app_theme.dart';

class ShiftScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  const ShiftScreen({super.key, required this.user});

  @override
  State<ShiftScreen> createState() => _ShiftScreenState();
}

class _ShiftScreenState extends State<ShiftScreen> {
  // Start form state
  String? _vehicleId;
  List<dynamic> _vehicles = [];
  bool _loadingVehicles = true;
  String? _vehiclesError;

  // End shift dialog
  final _kmController    = TextEditingController();
  final _notesController = TextEditingController();

  // Live timer
  Timer? _timer;
  Duration _elapsed = Duration.zero;
  DateTime? _shiftStart;

  // Last shift summary (shown after end)
  Map<String, dynamic>? _lastShift;
  List<Map<String, dynamic>> _lastTransports = [];

  final Map<String, bool> _checklist = {
    'fuel':        false,
    'tires':       false,
    'medicalKit':  false,
    'stretcher':   false,
    'cleanliness': false,
    'documents':   false,
  };

  static const _checklistLabels = {
    'fuel':        'Carburant vérifié',
    'tires':       'Pneus OK',
    'medicalKit':  'Kit médical complet',
    'stretcher':   'Brancard opérationnel',
    'cleanliness': 'Véhicule propre',
    'documents':   'Documents à bord',
  };

  @override
  void initState() {
    super.initState();
    _loadVehicles();
    _syncTimerFromState();
  }

  void _syncTimerFromState() {
    final state = context.read<ShiftCubit>().state;
    if (state is ShiftActive) _startTimer(state.shift);
  }

  void _startTimer(Map<String, dynamic> shift) {
    _timer?.cancel();
    final rawStart = shift['startTime'];
    if (rawStart != null) {
      try {
        _shiftStart = DateTime.parse(rawStart.toString()).toLocal();
        _elapsed = DateTime.now().difference(_shiftStart!);
      } catch (_) {}
    }
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _shiftStart != null) {
        setState(() => _elapsed = DateTime.now().difference(_shiftStart!));
      }
    });
  }

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
    _elapsed = Duration.zero;
    _shiftStart = null;
  }

  @override
  void dispose() {
    _timer?.cancel();
    _kmController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadVehicles() async {
    setState(() { _loadingVehicles = true; _vehiclesError = null; });
    try {
      final data = await ApiClient.instance.getAvailableVehicles();
      if (mounted) setState(() { _vehicles = data; _loadingVehicles = false; _vehiclesError = null; });
    } catch (e) {
      String? msg;
      final dynamic err = e;
      if (err?.response?.data is Map) {
        msg = (err.response.data as Map)['message']?.toString();
      }
      msg ??= e.toString();
      if (mounted) setState(() { _loadingVehicles = false; _vehiclesError = msg; });
    }
  }

  void _start() {
    if (_vehicleId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sélectionnez un véhicule')),
      );
      return;
    }
    context.read<ShiftCubit>().start(_vehicleId!, _checklist);
  }

  void _confirmEnd(Map<String, dynamic> shift) {
    _kmController.clear();
    _notesController.clear();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Terminer le shift'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: _kmController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Kilométrage total (optionnel)'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            decoration: const InputDecoration(labelText: 'Notes (optionnel)'),
            maxLines: 2,
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _lastShift = shift;
              // Snapshot current transports for the PDF before they're cleared
              final tourneeState = context.read<TourneeCubit>().state;
              if (tourneeState is TourneeLoaded) {
                _lastTransports = List<Map<String, dynamic>>.from(tourneeState.transports);
              }
              context.read<ShiftCubit>().end(
                totalKm: int.tryParse(_kmController.text) ?? 0,
                notes: _notesController.text,
              );
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.error),
            child: const Text('Terminer'),
          ),
        ],
      ),
    );
  }

  void _showSosDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(children: [
          Icon(Icons.emergency, color: Colors.red),
          SizedBox(width: 8),
          Text('Envoyer une alerte SOS ?'),
        ]),
        content: const Text('Le dispatcher sera immédiatement notifié.'),
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
    final pos = await LocationService.instance.getCurrentPosition();
    if (!mounted) return;
    final shiftState = context.read<ShiftCubit>().state;
    final shiftId = shiftState is ShiftActive ? shiftState.shift['_id']?.toString() : null;
    try {
      await ApiClient.instance.sosSend(
        lat: pos?.latitude,
        lng: pos?.longitude,
        shiftId: shiftId,
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

  String _fmtElapsed(Duration d) {
    final h = d.inHours.toString().padLeft(2, '0');
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<ShiftCubit, ShiftState>(
      listener: (context, state) {
        if (state is ShiftActive) {
          _startTimer(state.shift);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Shift démarré'),
            backgroundColor: AppTheme.primary,
          ));
        }
        if (state is ShiftEnded) {
          _stopTimer();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Shift terminé')),
          );
          setState(() {
            _vehicleId = null;
            _checklist.updateAll((_, __) => false);
          });
          _loadVehicles();
          // Show summary
          if (_lastShift != null) _showSummary(_lastShift!);
        }
        if (state is ShiftError) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(state.message),
            backgroundColor: AppTheme.error,
          ));
        }
      },
      child: BlocBuilder<ShiftCubit, ShiftState>(
        builder: (context, state) {
          if (state is ShiftActive) return _buildActive(state.shift);
          return _buildStartForm(state);
        },
      ),
    );
  }

  void _showSummary(Map<String, dynamic> shift) {
    final vehicleInfo = shift['vehicleId'];
    final plate = vehicleInfo is Map ? vehicleInfo['immatriculation']?.toString() ?? '—' : '—';
    final totalKm = shift['totalKm'] ?? 0;
    final total = shift['totalTransports'] ?? 0;
    final done  = shift['completedTransports'] ?? 0;

    String durStr = '';
    final rawStart = shift['startTime'];
    final rawEnd   = shift['endTime'];
    if (rawStart != null && rawEnd != null) {
      try {
        final diff = DateTime.parse(rawEnd.toString()).difference(DateTime.parse(rawStart.toString()));
        final h = diff.inHours;
        final m = diff.inMinutes % 60;
        durStr = '${h}h ${m}min';
      } catch (_) {}
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 20),
          const SizedBox(
            width: 64, height: 64,
            child: DecoratedBox(
              decoration: BoxDecoration(color: Color(0xFFECFDF5), shape: BoxShape.circle),
              child: Icon(Icons.check_circle, color: AppTheme.success, size: 36),
            ),
          ),
          const SizedBox(height: 12),
          const Text('Shift terminé', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
          const SizedBox(height: 24),
          _summaryRow(Icons.timer_outlined, 'Durée', durStr.isNotEmpty ? durStr : '—'),
          _summaryRow(Icons.directions_car_outlined, 'Véhicule', plate),
          _summaryRow(Icons.assignment_turned_in_outlined, 'Transports', '$done / $total complétés'),
          _summaryRow(Icons.social_distance_outlined, 'Distance', '$totalKm km'),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () async {
              Navigator.pop(context);
              try {
                final user = widget.user;
                await RouteSheetService.shareRouteSheet(
                  shift: shift,
                  transports: _lastTransports,
                  user: user,
                );
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Erreur PDF: $e'), backgroundColor: AppTheme.error),
                  );
                }
              }
            },
            icon: const Icon(Icons.picture_as_pdf),
            label: const Text('Feuille de route PDF'),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1)),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => Navigator.pop(context),
            style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 52)),
            child: const Text('Fermer'),
          ),
        ]),
      ),
    );
  }

  Widget _summaryRow(IconData icon, String label, String val) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(children: [
      Icon(icon, size: 18, color: AppTheme.secondary),
      const SizedBox(width: 12),
      Text(label, style: const TextStyle(fontSize: 13, color: AppTheme.secondary)),
      const Spacer(),
      Text(val, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
    ]),
  );

  Widget _buildActive(Map<String, dynamic> shift) {
    final vehicleInfo    = shift['vehicleId'];
    final plate          = vehicleInfo is Map ? vehicleInfo['immatriculation']?.toString() ?? '' : '';
    final vehicleType    = vehicleInfo is Map ? vehicleInfo['type']?.toString() ?? '' : '';
    final transportCount = shift['transportCount'] ?? 0;

    return Stack(children: [
      SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Mon shift', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
          const SizedBox(height: 16),

          // Active banner with live timer
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF6EE7B7)),
            ),
            child: Row(children: [
              Container(width: 10, height: 10, decoration: const BoxDecoration(color: Color(0xFF10B981), shape: BoxShape.circle)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Shift en cours', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF065F46))),
                const SizedBox(height: 2),
                Text('$transportCount transport${transportCount != 1 ? 's' : ''} assigné${transportCount != 1 ? 's' : ''}',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF047857))),
              ])),
              // Live timer
              Text(
                _fmtElapsed(_elapsed),
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, fontFamily: 'monospace', color: Color(0xFF065F46)),
              ),
            ]),
          ),
          const SizedBox(height: 16),

          // Vehicle card
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(children: [
              const Icon(Icons.directions_car, color: AppTheme.primary, size: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(plate.isNotEmpty ? plate : '—',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
                  if (vehicleType.isNotEmpty)
                    Text(vehicleType, style: const TextStyle(fontSize: 12, color: AppTheme.secondary)),
                ]),
              ),
              // GPS status badge
              ValueListenableBuilder<bool>(
                valueListenable: GpsService.instance.isTracking,
                builder: (_, tracking, __) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: tracking ? const Color(0xFFECFDF5) : const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: tracking ? const Color(0xFF6EE7B7) : const Color(0xFFFCA5A5),
                    ),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: tracking ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      tracking ? 'GPS actif' : 'GPS inactif',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: tracking ? const Color(0xFF065F46) : const Color(0xFF991B1B),
                      ),
                    ),
                  ]),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 24),

          // PDF button
          OutlinedButton.icon(
            onPressed: () async {
              try {
                final user = widget.user;
                await RouteSheetService.shareRouteSheet(
                  shift: shift,
                  transports: _lastTransports,
                  user: user,
                );
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Erreur PDF: $e'), backgroundColor: AppTheme.error),
                  );
                }
              }
            },
            icon: const Icon(Icons.picture_as_pdf),
            label: const Text('Feuille de route'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF6366F1),
              side: const BorderSide(color: Color(0xFF6366F1)),
              minimumSize: const Size(double.infinity, 48),
            ),
          ),
          const SizedBox(height: 16),

          // End shift button
          BlocBuilder<ShiftCubit, ShiftState>(
            builder: (context, state) => ElevatedButton.icon(
              onPressed: state is ShiftLoading ? null : () => _confirmEnd(shift),
              icon: state is ShiftLoading
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Icon(Icons.stop_circle_outlined),
              label: const Text('Terminer le shift'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.error,
                minimumSize: const Size(double.infinity, 52),
              ),
            ),
          ),
        ]),
      ),
      // SOS FAB
      Positioned(
        right: 16,
        bottom: 16,
        child: FloatingActionButton(
          onPressed: _showSosDialog,
          backgroundColor: Colors.red,
          tooltip: 'SOS',
          child: const Icon(Icons.emergency, color: Colors.white),
        ),
      ),
    ]);
  }

  Widget _buildStartForm(ShiftState state) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Démarrer mon shift',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
        const SizedBox(height: 4),
        const Text('Sélectionnez votre véhicule et vérifiez la checklist avant de démarrer.',
          style: TextStyle(fontSize: 13, color: AppTheme.secondary)),
        const SizedBox(height: 24),

        const Text('Véhicule', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
        const SizedBox(height: 8),
        if (_loadingVehicles)
          const Center(child: Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: CircularProgressIndicator(color: AppTheme.primary),
          ))
        else if (_vehiclesError != null)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF2F2),
              border: Border.all(color: const Color(0xFFFCA5A5)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(children: [
                Icon(Icons.error_outline, color: Color(0xFFDC2626), size: 20),
                SizedBox(width: 8),
                Text('Erreur de chargement', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
              ]),
              const SizedBox(height: 6),
              Text(_vehiclesError!, style: const TextStyle(fontSize: 12, color: Color(0xFF7F1D1D))),
              const SizedBox(height: 10),
              TextButton.icon(
                onPressed: _loadVehicles,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Réessayer', style: TextStyle(fontSize: 12)),
                style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626), padding: EdgeInsets.zero),
              ),
            ]),
          )
        else if (_vehicles.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED),
              border: Border.all(color: const Color(0xFFFED7AA)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Row(children: [
              Icon(Icons.warning_amber_rounded, color: Color(0xFFF97316), size: 20),
              SizedBox(width: 10),
              Expanded(child: Text(
                'Aucun véhicule disponible — contactez le dispatcher',
                style: TextStyle(fontSize: 13, color: Color(0xFF9A3412)),
              )),
            ]),
          )
        else
          DropdownButtonFormField<String>(
            value: _vehicleId,
            hint: const Text('Sélectionner un véhicule disponible'),
            decoration: const InputDecoration(),
            items: _vehicles.map<DropdownMenuItem<String>>((v) {
              final id    = v['_id']?.toString() ?? v['id']?.toString() ?? '';
              final plate = v['immatriculation']?.toString() ?? '';
              final brand = v['marque']?.toString() ?? '';
              final model = v['modele']?.toString() ?? '';
              final type  = v['type']?.toString() ?? '';
              final label = [plate, if (brand.isNotEmpty) '$brand $model', type].join(' — ');
              return DropdownMenuItem(value: id, child: Text(label));
            }).toList(),
            onChanged: (val) => setState(() => _vehicleId = val),
          ),

        const SizedBox(height: 24),
        const Text('Checklist pré-départ',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
        const SizedBox(height: 4),
        ..._checklistLabels.entries.map((e) => CheckboxListTile(
          value: _checklist[e.key],
          onChanged: (v) => setState(() => _checklist[e.key] = v ?? false),
          title: Text(e.value, style: const TextStyle(fontSize: 14)),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          activeColor: AppTheme.primary,
        )),

        const SizedBox(height: 32),
        SizedBox(
          width: double.infinity,
          child: BlocBuilder<ShiftCubit, ShiftState>(
            builder: (context, st) => ElevatedButton.icon(
              onPressed: (_vehicles.isEmpty || _vehiclesError != null || st is ShiftLoading) ? null : _start,
              icon: st is ShiftLoading
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Icon(Icons.play_arrow),
              label: const Text('Démarrer le shift'),
            ),
          ),
        ),
      ]),
    );
  }
}
