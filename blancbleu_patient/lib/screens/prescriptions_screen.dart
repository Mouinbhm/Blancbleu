import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../services/api_service.dart';
import 'nouvelle_prescription_screen.dart';

class PrescriptionsScreen extends StatefulWidget {
  const PrescriptionsScreen({super.key});

  @override
  State<PrescriptionsScreen> createState() => _PrescriptionsScreenState();
}

class _PrescriptionsScreenState extends State<PrescriptionsScreen> {
  bool _isLoading = true;
  List<dynamic> _prescriptions = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      setState(() { _isLoading = true; _error = null; });
      final data = await ApiService.getPrescriptions();
      if (mounted) setState(() { _prescriptions = data; _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _isLoading = false; });
    }
  }

  static Map<String, dynamic> _statutInfo(String statut) {
    switch (statut) {
      case 'active':
        return {'label': 'Active', 'color': Colors.green.shade700, 'bg': Colors.green.shade50, 'icon': Icons.check_circle_outline};
      case 'expiree':
        return {'label': 'Expirée', 'color': Colors.grey.shade600, 'bg': Colors.grey.shade100, 'icon': Icons.access_time_outlined};
      case 'annulee':
        return {'label': 'Annulée', 'color': const Color(0xFFDC2626), 'bg': const Color(0xFFFEF2F2), 'icon': Icons.cancel_outlined};
      case 'incomplet':
        return {'label': 'Incomplet', 'color': Colors.orange.shade800, 'bg': Colors.orange.shade50, 'icon': Icons.report_problem_outlined};
      default:
        return {'label': 'En attente', 'color': Colors.amber.shade700, 'bg': Colors.amber.shade50, 'icon': Icons.hourglass_empty_outlined};
    }
  }

  String _fmtDate(String? iso) {
    if (iso == null) return '—';
    final d = DateTime.parse(iso).toLocal();
    const mois = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    return '${d.day} ${mois[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1,
        title: const Text(
          'Mes ordonnances',
          style: TextStyle(color: AppTheme.onSurface, fontWeight: FontWeight.w700, fontSize: 17),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: AppTheme.onSurface, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            onPressed: _load,
            icon: const Icon(Icons.refresh, color: AppTheme.secondary),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: _buildBody(),
      bottomNavigationBar: _buildBottomNav(),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await Navigator.push<bool>(
            context,
            MaterialPageRoute(builder: (_) => const NouvellePrescriptionScreen()),
          );
          if (created == true) _load();
        },
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nouvelle ordonnance', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
    );
  }

  Widget _buildBottomNav() {
    const items = [
      {'icon': Icons.home_outlined,             'filledIcon': Icons.home,             'label': 'Accueil'},
      {'icon': Icons.medical_services_outlined, 'filledIcon': Icons.medical_services, 'label': 'Transports'},
      {'icon': Icons.receipt_long_outlined,     'filledIcon': Icons.receipt_long,     'label': 'Factures'},
      {'icon': Icons.description_outlined,      'filledIcon': Icons.description,      'label': 'Ordonnances'},
      {'icon': Icons.person_outline,            'filledIcon': Icons.person,           'label': 'Profil'},
    ];
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(items.length, (i) {
              final active = i == 3;
              final item   = items[i];
              return GestureDetector(
                onTap: () { if (i != 3) Navigator.of(context).pop(); },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: active ? const Color(0xFFEFF6FF) : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        active ? item['filledIcon'] as IconData : item['icon'] as IconData,
                        color: active ? AppTheme.primary : Colors.grey,
                        size: 24,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item['label'] as String,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                            color: active ? AppTheme.primary : Colors.grey),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppTheme.primary));
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.wifi_off, size: 48, color: AppTheme.secondary),
              const SizedBox(height: 16),
              Text(_error!, textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTheme.secondary, fontSize: 14)),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: _load,
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary, foregroundColor: Colors.white),
                child: const Text('Réessayer'),
              ),
            ],
          ),
        ),
      );
    }
    if (_prescriptions.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(Icons.description_outlined, size: 36, color: AppTheme.primary),
              ),
              const SizedBox(height: 20),
              const Text('Aucune ordonnance', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
              const SizedBox(height: 8),
              const Text(
                'Initialisez votre première prescription médicale de transport.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppTheme.secondary, height: 1.4),
              ),
              const SizedBox(height: 80),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      color: AppTheme.primary,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        itemCount: _prescriptions.length,
        itemBuilder: (_, i) => _buildCard(_prescriptions[i] as Map<String, dynamic>),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> p) {
    final statut = (p['statut'] as String?) ?? 'en_attente_validation';
    final si = _statutInfo(statut);
    final motif = (p['motif'] as String?) ?? '—';
    final numero = (p['numero'] as String?) ?? '';
    final medecin = p['medecin'] as Map<String, dynamic>?;
    final medecinNom = [medecin?['prenom'], medecin?['nom']].where((s) => s != null && s != '').join(' ');
    final dateEmission = _fmtDate(p['dateEmission'] as String?);
    final dateExpiration = _fmtDate(p['dateExpiration'] as String?);
    final etab = (p['etablissementDestination'] as String?) ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: motif + statut badge
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: si['bg'] as Color,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(si['icon'] as IconData, color: si['color'] as Color, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(motif, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
                      if (numero.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(numero, style: TextStyle(fontSize: 11, color: Colors.grey.shade400, fontFamily: 'monospace')),
                      ],
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: si['bg'] as Color,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    si['label'] as String,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: si['color'] as Color),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 14),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),
            const SizedBox(height: 12),

            // Details grid
            _infoRow(Icons.medical_information_outlined, 'Médecin', medecinNom.isNotEmpty ? medecinNom : '—'),
            if (etab.isNotEmpty) ...[
              const SizedBox(height: 6),
              _infoRow(Icons.local_hospital_outlined, 'Établissement', etab),
            ],
            const SizedBox(height: 6),
            _infoRow(Icons.event_note_outlined, 'Émise le', dateEmission),
            if (p['dateExpiration'] != null) ...[
              const SizedBox(height: 6),
              _infoRow(Icons.event_outlined, 'Expire le', dateExpiration),
            ],

            if (statut == 'en_attente_validation') ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade100),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, size: 15, color: Colors.amber.shade700),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'En attente de validation par votre transporteur.',
                        style: TextStyle(fontSize: 12, color: Colors.amber.shade800),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            if (statut == 'incomplet') ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.report_problem_outlined, size: 15, color: Colors.orange.shade800),
                        const SizedBox(width: 6),
                        Text(
                          'Action requise',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.orange.shade800),
                        ),
                      ],
                    ),
                    if ((p['commentaireDispatcher'] as String? ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        p['commentaireDispatcher'] as String,
                        style: TextStyle(fontSize: 12, color: Colors.orange.shade900, height: 1.4),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      'Corrigez et soumettez une nouvelle ordonnance.',
                      style: TextStyle(fontSize: 11, color: Colors.orange.shade700, fontStyle: FontStyle.italic),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 15, color: AppTheme.secondary),
        const SizedBox(width: 8),
        Text('$label : ', style: const TextStyle(fontSize: 12, color: AppTheme.secondary, fontWeight: FontWeight.w500)),
        Expanded(
          child: Text(value, style: const TextStyle(fontSize: 12, color: AppTheme.onSurface, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }
}
