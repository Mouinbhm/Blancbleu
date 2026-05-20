import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../cubit/shift_cubit.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/theme/app_theme.dart';

class StartShiftScreen extends StatefulWidget {
  const StartShiftScreen({super.key});
  @override
  State<StartShiftScreen> createState() => _StartShiftScreenState();
}

class _StartShiftScreenState extends State<StartShiftScreen> {
  String? _vehicleId;
  List<dynamic> _vehicles = [];
  bool _loadingVehicles = true;
  String? _vehiclesError;

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
  }

  Future<void> _loadVehicles() async {
    try {
      final data = await ApiClient.instance.getAvailableVehicles();
      if (mounted) setState(() { _vehicles = data; _loadingVehicles = false; _vehiclesError = null; });
    } catch (e) {
      String? msg;
      // DioException carries the server JSON message
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sélectionnez un véhicule')));
      return;
    }
    context.read<ShiftCubit>().start(_vehicleId!, _checklist);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Démarrer le shift')),
      body: BlocListener<ShiftCubit, ShiftState>(
        listener: (context, state) {
          if (state is ShiftActive) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text('Shift démarré — ${_vehiclePlate()}'),
              backgroundColor: AppTheme.primary,
            ));
            Navigator.pop(context);
          }
          if (state is ShiftError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: AppTheme.error));
          }
        },
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Véhicule', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
              const SizedBox(height: 8),
              if (_loadingVehicles)
                const Center(child: CircularProgressIndicator(color: AppTheme.primary))
              else if (_vehiclesError != null)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    border: Border.all(color: const Color(0xFFFCA5A5)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(children: [
                        Icon(Icons.error_outline, color: Color(0xFFDC2626), size: 20),
                        SizedBox(width: 8),
                        Text('Erreur de chargement', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
                      ]),
                      const SizedBox(height: 6),
                      Text(_vehiclesError!, style: const TextStyle(fontSize: 12, color: Color(0xFF7F1D1D))),
                      const SizedBox(height: 10),
                      TextButton.icon(
                        onPressed: () { setState(() { _loadingVehicles = true; _vehiclesError = null; }); _loadVehicles(); },
                        icon: const Icon(Icons.refresh, size: 16),
                        label: const Text('Réessayer', style: TextStyle(fontSize: 12)),
                        style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626), padding: EdgeInsets.zero),
                      ),
                    ],
                  ),
                )
              else if (_vehicles.isEmpty)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF7ED),
                    border: Border.all(color: const Color(0xFFFED7AA)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, color: Color(0xFFF97316), size: 20),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Aucun véhicule disponible — contactez le dispatcher',
                          style: TextStyle(fontSize: 13, color: Color(0xFF9A3412)),
                        ),
                      ),
                    ],
                  ),
                )
              else
                DropdownButtonFormField<String>(
                  value: _vehicleId,
                  hint: const Text('Sélectionner un véhicule disponible'),
                  decoration: const InputDecoration(),
                  items: _vehicles.map<DropdownMenuItem<String>>((v) {
                    final id     = v['_id']?.toString() ?? v['id']?.toString() ?? '';
                    final plate  = v['immatriculation']?.toString() ?? '';
                    final brand  = v['marque']?.toString() ?? '';
                    final model  = v['modele']?.toString() ?? '';
                    final type   = v['type']?.toString() ?? '';
                    final label  = [plate, if (brand.isNotEmpty) '$brand $model', type].join(' — ');
                    return DropdownMenuItem(value: id, child: Text(label));
                  }).toList(),
                  onChanged: (val) => setState(() => _vehicleId = val),
                ),

              const SizedBox(height: 24),
              const Text('Checklist pré-départ', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
              const SizedBox(height: 8),
              ..._checklistLabels.entries.map((e) => CheckboxListTile(
                value: _checklist[e.key],
                onChanged: (v) => setState(() => _checklist[e.key] = v ?? false),
                title: Text(e.value, style: const TextStyle(fontSize: 14)),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                activeColor: AppTheme.primary,
              )),

              const SizedBox(height: 32),
              BlocBuilder<ShiftCubit, ShiftState>(
                builder: (context, state) => ElevatedButton.icon(
                  onPressed: (_vehicles.isEmpty || _vehiclesError != null || state is ShiftLoading) ? null : _start,
                  icon: state is ShiftLoading
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(Icons.play_arrow),
                  label: const Text('Démarrer le shift'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _vehiclePlate() {
    final v = _vehicles.firstWhere(
      (v) => (v['_id']?.toString() ?? '') == _vehicleId,
      orElse: () => <String, dynamic>{},
    );
    return v['immatriculation']?.toString() ?? '';
  }
}
