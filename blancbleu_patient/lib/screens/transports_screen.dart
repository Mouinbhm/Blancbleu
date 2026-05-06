import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../config/theme.dart';
import '../services/api_service.dart';
import 'login_screen.dart';
import 'transport_detail_screen.dart';
import 'tracking_screen.dart';
import 'nouveau_transport_screen.dart';

class TransportsScreen extends StatefulWidget {
  const TransportsScreen({super.key});

  @override
  State<TransportsScreen> createState() => _TransportsScreenState();
}

class _TransportsScreenState extends State<TransportsScreen> {
  int _tabIndex = 0;
  bool _loading = true;
  String? _error;
  List<dynamic> _transports = [];

  static const _tabs = ['Tous', 'À venir', 'Passés'];

  static const _statutsAVenir = [
    'REQUESTED', 'CONFIRMED', 'SCHEDULED', 'ASSIGNED',
    'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PATIENT_ON_BOARD',
    'ARRIVED_AT_DESTINATION',
  ];
  static const _statutsPasses = ['COMPLETED', 'BILLED', 'CANCELLED', 'NO_SHOW'];

  static const _navItems = [
    _NavItem(icon: Icons.home_outlined,             filledIcon: Icons.home,             label: 'Accueil'),
    _NavItem(icon: Icons.medical_services_outlined, filledIcon: Icons.medical_services, label: 'Transports'),
    _NavItem(icon: Icons.receipt_long_outlined,     filledIcon: Icons.receipt_long,     label: 'Factures'),
    _NavItem(icon: Icons.description_outlined,      filledIcon: Icons.description,      label: 'Ordonnances'),
    _NavItem(icon: Icons.person_outline,            filledIcon: Icons.person,           label: 'Profil'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      setState(() { _loading = true; _error = null; });
      final t = await ApiService.getTransports();
      if (!mounted) return;
      setState(() { _transports = t; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      if (msg == 'SESSION_EXPIRED') {
        await ApiService.clearSession();
        if (!mounted) return;
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (_) => false,
        );
        return;
      }
      setState(() { _error = msg; _loading = false; });
    }
  }

  List<dynamic> get _filtered {
    switch (_tabIndex) {
      case 1: return _transports.where((t) => _statutsAVenir.contains(t['statut'])).toList();
      case 2: return _transports.where((t) => _statutsPasses.contains(t['statut'])).toList();
      default: return _transports;
    }
  }

  // ── Statut helper ──────────────────────────────────────────────────────────
  static Map<String, dynamic> _statutInfo(String statut) {
    switch (statut) {
      case 'REQUESTED':
        return {'label': 'En attente', 'color': Colors.orange.shade700, 'bg': Colors.orange.shade50};
      case 'CONFIRMED':
        return {'label': 'Confirmé ✅', 'color': const Color(0xFF2563EB), 'bg': const Color(0xFFEFF6FF)};
      case 'SCHEDULED':
      case 'ASSIGNED':
        return {'label': 'Planifié', 'color': Colors.purple.shade700, 'bg': Colors.purple.shade50};
      case 'EN_ROUTE_TO_PICKUP':
        return {'label': 'En route', 'color': AppTheme.primaryContainer, 'bg': const Color(0xFFEFF6FF)};
      case 'ARRIVED_AT_PICKUP':
        return {'label': 'Arrivé au départ', 'color': AppTheme.primaryContainer, 'bg': const Color(0xFFEFF6FF)};
      case 'PATIENT_ON_BOARD':
        return {'label': 'À bord', 'color': AppTheme.primaryContainer, 'bg': const Color(0xFFEFF6FF)};
      case 'ARRIVED_AT_DESTINATION':
        return {'label': 'Arrivé', 'color': Colors.teal.shade700, 'bg': Colors.teal.shade50};
      case 'COMPLETED':
      case 'BILLED':
        return {'label': 'Terminé', 'color': Colors.green.shade700, 'bg': Colors.green.shade50};
      case 'CANCELLED':
        return {'label': 'Annulé', 'color': const Color(0xFFDC2626), 'bg': const Color(0xFFFEF2F2)};
      case 'NO_SHOW':
        return {'label': 'Non présenté', 'color': Colors.grey.shade600, 'bg': Colors.grey.shade100};
      default:
        return {'label': statut, 'color': Colors.grey.shade600, 'bg': Colors.grey.shade100};
    }
  }

  // ── Date helpers ───────────────────────────────────────────────────────────
  static const _mois = [
    'jan', 'fév', 'mar', 'avr', 'mai', 'jun',
    'jul', 'aoû', 'sep', 'oct', 'nov', 'déc',
  ];

  static String _fmtDate(String? iso, String? heure) {
    if (iso == null) return '';
    final d = DateTime.parse(iso).toLocal();
    final h = (heure ?? '').replaceAll(':', 'h');
    final dateStr = '${d.day} ${_mois[d.month - 1]}';
    return h.isNotEmpty ? '$dateStr · $h' : dateStr;
  }

  bool _isActif(String statut) => [
    'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PATIENT_ON_BOARD',
  ].contains(statut);

  // ── Transport card ─────────────────────────────────────────────────────────
  Widget _buildCard(Map<String, dynamic> t) {
    final statut   = (t['statut'] as String?) ?? '';
    final si       = _statutInfo(statut);
    final dest     = (t['adresseDestination']?['nom'] as String?)
                  ?? (t['adresseDestination']?['ville'] as String?)
                  ?? 'Destination';
    final dateStr  = _fmtDate(t['dateTransport'] as String?, t['heureRDV'] as String?);
    final motif    = (t['motif'] as String?) ?? '';
    final vehicule = t['vehicule'];
    final chauffeur = t['chauffeur'];
    final driverNom = chauffeur != null
        ? '${(chauffeur['prenom'] as String?) ?? ''} ${(chauffeur['nom'] as String?) ?? ''}'.trim()
        : '';
    final driverTel = (chauffeur?['telephone'] as String?) ?? '';
    final actif    = _isActif(statut);
    final termine  = statut == 'COMPLETED' || statut == 'BILLED';
    final cancelled = statut == 'CANCELLED' || statut == 'NO_SHOW';
    final id = t['_id']?.toString() ?? '';

    return Opacity(
      opacity: cancelled ? 0.72 : 1.0,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          dateStr,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.secondary),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Icon(Icons.arrow_forward, size: 16, color: actif ? AppTheme.primaryContainer : AppTheme.primary),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                dest,
                                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppTheme.onSurface),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
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

              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: Color(0xFFF0F0F0)),
              ),

              // Motif ou chauffeur
              if (actif && driverNom.isNotEmpty)
                Row(
                  children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFFDBEAFE),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Icon(Icons.directions_car, color: AppTheme.primary, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Chauffeur', style: TextStyle(fontSize: 11, color: AppTheme.secondary)),
                        Text(driverNom, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
                      ],
                    ),
                  ],
                )
              else
                Row(
                  children: [
                    const Icon(Icons.medical_information_outlined, size: 18, color: AppTheme.secondary),
                    const SizedBox(width: 8),
                    Text(
                      motif.isNotEmpty ? motif : 'Transport médical',
                      style: const TextStyle(fontSize: 15, color: AppTheme.onSurface),
                    ),
                    if (vehicule != null) ...[
                      const SizedBox(width: 14),
                      Container(width: 1, height: 14, color: const Color(0xFFE0E0E0)),
                      const SizedBox(width: 14),
                      const Icon(Icons.directions_car_outlined, size: 18, color: AppTheme.secondary),
                      const SizedBox(width: 6),
                      Text(
                        (vehicule['nom'] as String?) ?? '',
                        style: const TextStyle(fontSize: 14, color: AppTheme.secondary),
                      ),
                    ],
                  ],
                ),

              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: Color(0xFFF0F0F0)),
              ),

              // Actions
              if (actif)
                Row(
                  children: [
                    Expanded(
                      child: SizedBox(
                        height: 44,
                        child: ElevatedButton.icon(
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => TrackingScreen(transportId: id, transport: t),
                            ),
                          ),
                          icon: const Icon(Icons.location_on, size: 18),
                          label: const Text('Suivre le trajet', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primaryContainer,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            elevation: 0,
                          ),
                        ),
                      ),
                    ),
                    if (driverTel.isNotEmpty) ...[
                      const SizedBox(width: 10),
                      Container(
                        width: 44, height: 44,
                        decoration: BoxDecoration(
                          border: Border.all(color: const Color(0xFFE5E7EB)),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: IconButton(
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: driverTel));
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Numéro copié : $driverTel'),
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          },
                          icon: const Icon(Icons.call_outlined, color: AppTheme.secondary, size: 20),
                          tooltip: driverTel,
                        ),
                      ),
                    ],
                  ],
                )
              else
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: cancelled
                          ? null
                          : () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => TransportDetailScreen(transportId: id),
                                ),
                              ),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        termine ? 'Voir les détails' : 'Détails du trajet',
                        style: TextStyle(
                          color: cancelled ? AppTheme.secondary : AppTheme.primary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (!cancelled)
                      const Icon(Icons.chevron_right, color: Colors.black12, size: 22),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ── AppBar ─────────────────────────────────────────────────────────────────
  PreferredSizeWidget _buildAppBar() {
    return AppBar(
      backgroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 1,
      automaticallyImplyLeading: false,
      titleSpacing: 0,
      title: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: FutureBuilder<Map<String, dynamic>?>(
          future: ApiService.getCachedPatient(),
          builder: (_, snap) {
            final p = snap.data;
            final initials = p != null
                ? '${(p['prenom'] as String? ?? '?')[0]}${(p['nom'] as String? ?? '?')[0]}'
                : '?';
            return Row(
              children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFFDBEAFE),
                    border: Border.all(color: AppTheme.primaryContainer, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      initials,
                      style: const TextStyle(color: AppTheme.primary, fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                const Text(
                  'BlancBleu',
                  style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w900, fontSize: 19, letterSpacing: -0.5),
                ),
              ],
            );
          },
        ),
      ),
      actions: [
        IconButton(
          onPressed: _load,
          icon: const Icon(Icons.refresh_outlined, color: Colors.grey),
        ),
        const SizedBox(width: 8),
      ],
    );
  }

  // ── Bottom Nav ─────────────────────────────────────────────────────────────
  Widget _buildBottomNav() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, -4)),
        ],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(_navItems.length, (i) {
              final item = _navItems[i];
              final active = i == 1;
              return GestureDetector(
                onTap: () { if (i != 1) Navigator.of(context).pop(); },
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
                      Icon(active ? item.filledIcon : item.icon,
                          color: active ? AppTheme.primary : Colors.grey, size: 24),
                      const SizedBox(height: 2),
                      Text(item.label,
                          style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w600,
                            color: active ? AppTheme.primary : Colors.grey,
                          )),
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

  // ── Tab Bar ────────────────────────────────────────────────────────────────
  Widget _buildTabBar() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: AppTheme.surfaceContainer, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: List.generate(_tabs.length, (i) {
          final active = _tabIndex == i;
          return Expanded(
            child: GestureDetector(
              onTap: () => setState(() => _tabIndex = i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: active ? Colors.white : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: active
                      ? [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4, offset: const Offset(0, 1))]
                      : null,
                ),
                child: Center(
                  child: Text(
                    _tabs[i],
                    style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w600,
                      color: active ? AppTheme.primary : AppTheme.secondary,
                    ),
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: _buildAppBar(),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
          : _error != null
              ? Center(
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
                              backgroundColor: AppTheme.primaryContainer, foregroundColor: Colors.white),
                          child: const Text('Réessayer'),
                        ),
                      ],
                    ),
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Mes transports',
                        style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700,
                            letterSpacing: -0.5, color: AppTheme.onSurface),
                      ),
                      const SizedBox(height: 16),
                      _buildTabBar(),
                      const SizedBox(height: 20),
                      if (_filtered.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 40),
                          child: Opacity(
                            opacity: 0.4,
                            child: Column(
                              children: [
                                const Icon(Icons.history, size: 40, color: AppTheme.secondary),
                                const SizedBox(height: 8),
                                Text(
                                  _tabIndex == 1 ? 'Aucun transport à venir' : 'Aucun transport',
                                  style: const TextStyle(fontSize: 15, color: AppTheme.secondary),
                                ),
                              ],
                            ),
                          ),
                        )
                      else
                        ..._filtered.map((t) => _buildCard(t as Map<String, dynamic>)),
                    ],
                  ),
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const NouveauTransportScreen()),
        ).then((_) => _load()),
        backgroundColor: AppTheme.primaryContainer,
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }
}

class _NavItem {
  final IconData icon;
  final IconData filledIcon;
  final String label;
  const _NavItem({required this.icon, required this.filledIcon, required this.label});
}
