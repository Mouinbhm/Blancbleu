import 'package:bb_core/bb_core.dart' show AuthException;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../config/theme.dart';
import '../services/api_service.dart';
import 'factures_screen.dart';
import 'nouveau_transport_screen.dart';
import 'prescriptions_screen.dart';
import 'profile_screen.dart';
import 'tracking_screen.dart';
import 'transports_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  // ── Dashboard state ────────────────────────────────────────────────────────
  bool _isLoading = true;
  Map<String, dynamic>? _dashboard;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    try {
      setState(() { _isLoading = true; _error = null; });
      final data = await ApiService.getDashboard();
      if (mounted) setState(() { _dashboard = data; _isLoading = false; });
    } on AuthException {
      // Session expirée : clearSession + navigation Login gérés centralement
      // par DioClient.onAuthFailed.
      return;
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      setState(() { _error = msg; _isLoading = false; });
    }
  }

  // ── Date helpers ───────────────────────────────────────────────────────────
  static const _jours = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  static const _mois  = ['janvier','février','mars','avril','mai','juin',
                          'juillet','août','septembre','octobre','novembre','décembre'];
  static const _moisCap = ['Janvier','Février','Mars','Avril','Mai','Juin',
                            'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  String _todayLabel() {
    final now = DateTime.now();
    return '${_jours[now.weekday - 1]} ${now.day} ${_moisCap[now.month - 1]}';
  }

  String _formatTransportDate(String? iso, String? heure) {
    if (iso == null) return '';
    final date = DateTime.parse(iso).toLocal();
    final now  = DateTime.now();
    final today    = DateTime(now.year,  now.month,  now.day);
    final tomorrow = today.add(const Duration(days: 1));
    final d        = DateTime(date.year, date.month, date.day);
    String prefix;
    if (d == today) {
      prefix = "Aujourd'hui";
    } else if (d == tomorrow) {
      prefix = 'Demain ${date.day} ${_mois[date.month - 1]}';
    } else {
      prefix = '${_jours[date.weekday - 1]} ${date.day} ${_mois[date.month - 1]}';
    }
    final h = (heure ?? '').replaceAll(':', 'h');
    return h.isNotEmpty ? '$prefix à $h' : prefix;
  }

  String _formatShortDate(String? iso) {
    if (iso == null) return '';
    final d = DateTime.parse(iso).toLocal();
    return '${d.day} ${_moisCap[d.month - 1]} · ${d.hour.toString().padLeft(2,'0')}h${d.minute.toString().padLeft(2,'0')}';
  }

  // ── Statut helpers ─────────────────────────────────────────────────────────
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
      case 'ARRIVED_AT_PICKUP':
      case 'PATIENT_ON_BOARD':
        return {'label': 'En cours', 'color': AppTheme.primaryContainer, 'bg': const Color(0xFFEFF6FF)};
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

  static const _navItems = [
    _NavItem(icon: Icons.home_outlined,           filledIcon: Icons.home,            label: 'Accueil'),
    _NavItem(icon: Icons.medical_services_outlined, filledIcon: Icons.medical_services, label: 'Transports'),
    _NavItem(icon: Icons.receipt_long_outlined,   filledIcon: Icons.receipt_long,    label: 'Factures'),
    _NavItem(icon: Icons.description_outlined,    filledIcon: Icons.description,     label: 'Ordonnances'),
    _NavItem(icon: Icons.person_outline,          filledIcon: Icons.person,          label: 'Profil'),
  ];

  // ── AppBar ─────────────────────────────────────────────────────────────────
  PreferredSizeWidget _buildAppBar() {
    return AppBar(
      backgroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 1,
      titleSpacing: 0,
      title: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Row(
          children: [
            // Avatar patient
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFDBEAFE),
                border: Border.all(color: AppTheme.primaryContainer, width: 2),
              ),
              child: const Center(
                child: Text(
                  'M',
                  style: TextStyle(
                    color: AppTheme.primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 17,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            const Text(
              'BlancBleu',
              style: TextStyle(
                color: AppTheme.primary,
                fontWeight: FontWeight.w900,
                fontSize: 19,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
      ),
      actions: [
        IconButton(
          onPressed: () {},
          icon: const Icon(Icons.notifications_outlined, color: Colors.grey),
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
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 12,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(_navItems.length, (i) {
              final item = _navItems[i];
              final active = _selectedIndex == i;
              return GestureDetector(
                onTap: () => setState(() => _selectedIndex = i),
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
                        active ? item.filledIcon : item.icon,
                        color: active ? AppTheme.primary : Colors.grey,
                        size: 24,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: active ? AppTheme.primary : Colors.grey,
                        ),
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

  // ── Body ───────────────────────────────────────────────────────────────────
  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 80),
          child: CircularProgressIndicator(color: AppTheme.primary),
        ),
      );
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
                onPressed: _loadDashboard,
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryContainer,
                    foregroundColor: Colors.white),
                child: const Text('Réessayer'),
              ),
            ],
          ),
        ),
      );
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildWelcome(),
          const SizedBox(height: 28),
          _buildNextTransportCard(),
          const SizedBox(height: 24),
          _buildQuickActions(),
          const SizedBox(height: 24),
          _buildLastTransports(),
          const SizedBox(height: 24),
          _buildMapSection(),
        ],
      ),
    );
  }

  // ── Section 1 — Welcome ────────────────────────────────────────────────────
  Widget _buildWelcome() {
    final prenom = (_dashboard?['patient']?['prenom'] as String?) ?? 'Patient';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Bonjour $prenom 👋',
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
            color: AppTheme.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '${_todayLabel()} · Nice ☀️',
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppTheme.secondary,
          ),
        ),
      ],
    );
  }

  // ── Section 2 — Prochain transport ─────────────────────────────────────────
  Widget _buildNextTransportCard() {
    final transport = _dashboard?['prochainTransport'];
    if (transport == null) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey.shade100),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))],
        ),
        child: Row(
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(color: AppTheme.surfaceContainer, borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.calendar_today_outlined, color: AppTheme.secondary),
            ),
            const SizedBox(width: 16),
            const Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Aucun transport prévu', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
                SizedBox(height: 2),
                Text('Demandez un nouveau transport', style: TextStyle(fontSize: 12, color: AppTheme.secondary)),
              ]),
            ),
          ],
        ),
      );
    }

    final statut     = (transport['statut'] as String?) ?? 'REQUESTED';
    final si         = _statutInfo(statut);
    final dateStr    = _formatTransportDate(transport['dateTransport'] as String?, transport['heureRDV'] as String?);
    final dest       = (transport['adresseDestination']?['nom'] as String?) ?? 'Destination';
    final rue        = (transport['adresseDestination']?['rue'] as String?) ?? '';
    final ville      = (transport['adresseDestination']?['ville'] as String?) ?? '';
    final motif      = (transport['motif'] as String?) ?? '';
    final vehicule   = transport['vehicule'];
    final vehicleNom = vehicule != null ? (vehicule['nom'] as String? ?? '') : '';

    final adresseLine = [rue, ville].where((s) => s.isNotEmpty).join(', ');
    final destLabel   = motif.isNotEmpty ? '$dest · $motif' : dest;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('PROCHAIN TRANSPORT',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                            color: AppTheme.primary, letterSpacing: 1.2)),
                    const SizedBox(height: 4),
                    Text(dateStr,
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600,
                            color: AppTheme.onSurface, letterSpacing: -0.3)),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: si['bg'] as Color,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(si['label'] as String,
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: si['color'] as Color)),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Destination
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFF2F3FE), borderRadius: BorderRadius.circular(10)),
              child: Row(
                children: [
                  Container(
                    width: 48, height: 48,
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10),
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4, offset: const Offset(0, 2))]),
                    child: const Icon(Icons.medical_services, color: AppTheme.primary),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(destLabel,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
                        if (adresseLine.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(adresseLine, style: const TextStyle(fontSize: 12, color: AppTheme.secondary)),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Footer
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (vehicleNom.isNotEmpty)
                  Row(children: [
                    const Icon(Icons.directions_car_outlined, size: 18, color: AppTheme.secondary),
                    const SizedBox(width: 6),
                    Text('Véhicule : $vehicleNom',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.secondary)),
                  ])
                else
                  const Text('Véhicule non assigné',
                      style: TextStyle(fontSize: 13, color: AppTheme.secondary)),
                ElevatedButton.icon(
                  onPressed: () {
                    final id = transport['_id']?.toString() ?? '';
                    if (id.isNotEmpty) {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => TrackingScreen(
                            transportId: id,
                            transport: transport as Map<String, dynamic>,
                          ),
                        ),
                      );
                    }
                  },
                  icon: const Text('Suivre en direct', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  label: const Icon(Icons.arrow_forward, size: 16),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryContainer,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── Section 3 — Quick Actions ──────────────────────────────────────────────
  Widget _buildQuickActions() {
    const actions = [
      _QuickAction(
        icon: Icons.add_circle,
        label: 'Nouveau',
        bgColor: AppTheme.primary,
        iconColor: Colors.white,
        textColor: Colors.white,
        filled: true,
      ),
      _QuickAction(
        icon: Icons.calendar_month,
        label: 'Mes transports',
        bgColor: Colors.white,
        iconColor: AppTheme.primary,
        textColor: AppTheme.onSurface,
        filled: false,
      ),
      _QuickAction(
        icon: Icons.receipt_long,
        label: 'Factures',
        bgColor: Colors.white,
        iconColor: AppTheme.primary,
        textColor: AppTheme.onSurface,
        filled: false,
      ),
      _QuickAction(
        icon: Icons.person,
        label: 'Profil',
        bgColor: Colors.white,
        iconColor: AppTheme.primary,
        textColor: AppTheme.onSurface,
        filled: false,
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 14,
      mainAxisSpacing: 14,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.8,
      children: List.generate(actions.length, (i) {
        final a = actions[i];
        return GestureDetector(
          onTap: () {
            if (i == 0) {
              Navigator.push(context, MaterialPageRoute(builder: (_) => const NouveauTransportScreen()))
                  .then((_) => _loadDashboard());
            } else if (i == 1) {
              setState(() => _selectedIndex = 1);
            } else if (i == 2) {
              setState(() => _selectedIndex = 2);
            } else if (i == 3) {
              setState(() => _selectedIndex = 4);
            }
          },
          child: AnimatedScale(
            scale: 1,
            duration: const Duration(milliseconds: 100),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: a.bgColor,
                borderRadius: BorderRadius.circular(14),
                border: a.filled ? null : Border.all(color: Colors.grey.shade100),
                boxShadow: [
                  BoxShadow(
                    color: a.filled
                        ? AppTheme.primary.withOpacity(0.2)
                        : Colors.black.withOpacity(0.04),
                    blurRadius: a.filled ? 10 : 6,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(a.icon, color: a.iconColor, size: 26),
                  const SizedBox(height: 6),
                  Text(
                    a.label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: a.textColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }

  // ── Section 4 — Derniers transports ───────────────────────────────────────
  Widget _buildLastTransports() {
    final raw = (_dashboard?['derniersTransports'] as List<dynamic>?) ?? [];

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Derniers transports',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
            TextButton(
              onPressed: () => setState(() => _selectedIndex = 1),
              child: const Text('Tout voir', style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (raw.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Center(child: Text('Aucun transport récent', style: TextStyle(color: AppTheme.secondary))),
          )
        else
          ...raw.map((t) {
            final statut   = (t['statut'] as String?) ?? '';
            final si       = _statutInfo(statut);
            final cancelled = statut == 'CANCELLED' || statut == 'NO_SHOW';
            final dest     = (t['adresseDestination']?['nom'] as String?)
                          ?? (t['adresseDestination']?['ville'] as String?)
                          ?? 'Destination';
            final dateStr  = _formatShortDate(t['dateTransport'] as String?);
            final icon     = cancelled ? Icons.cancel : (statut == 'COMPLETED' || statut == 'BILLED' ? Icons.task_alt : Icons.local_shipping_outlined);

            return Opacity(
              opacity: cancelled ? 0.75 : 1.0,
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.grey.shade100),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 2))],
                ),
                child: Row(
                  children: [
                    Container(
                      width: 42, height: 42,
                      decoration: BoxDecoration(color: si['bg'] as Color, borderRadius: BorderRadius.circular(10)),
                      child: Icon(icon, color: si['color'] as Color, size: 22),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(dest, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
                          const SizedBox(height: 2),
                          Text(dateStr, style: const TextStyle(fontSize: 12, color: AppTheme.secondary)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(color: si['bg'] as Color, borderRadius: BorderRadius.circular(6)),
                          child: Text(
                            si['label'] as String,
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: si['color'] as Color),
                          ),
                        ),
                        if (!cancelled) ...[
                          const SizedBox(height: 4),
                          const Icon(Icons.chevron_right, color: Colors.black12, size: 18),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }

  // ── Section 5 — Map ────────────────────────────────────────────────────────
  Widget _buildMapSection() {
    // Nice city center
    const nice = LatLng(43.7102, 7.262);

    return SizedBox(
      height: 148,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            FlutterMap(
              options: const MapOptions(
                initialCenter: nice,
                initialZoom: 13.0,
                interactionOptions: InteractionOptions(flags: InteractiveFlag.none),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.blancbleu.patient',
                ),
                const MarkerLayer(
                  markers: [
                    Marker(
                      point: nice,
                      width: 36,
                      height: 36,
                      child: Icon(Icons.location_on, color: Color(0xFF0056CB), size: 36),
                    ),
                  ],
                ),
              ],
            ),
            // Bottom label overlay
            Positioned(
              bottom: 0, left: 0, right: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(12, 18, 12, 10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.white.withOpacity(0.92)],
                  ),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.location_on, size: 13, color: AppTheme.secondary),
                    SizedBox(width: 4),
                    Text(
                      'Zone de service active : Nice et environs',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.secondary),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: _selectedIndex == 0 ? _buildAppBar() : null,
      body: IndexedStack(
        index: _selectedIndex,
        children: [
          _buildBody(),
          const TransportsScreen(),
          const FacturesScreen(),
          const PrescriptionsScreen(),
          const ProfileScreen(),
        ],
      ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class _NavItem {
  final IconData icon;
  final IconData filledIcon;
  final String label;
  const _NavItem({required this.icon, required this.filledIcon, required this.label});
}

class _QuickAction {
  final IconData icon;
  final String label;
  final Color bgColor;
  final Color iconColor;
  final Color textColor;
  final bool filled;
  const _QuickAction({
    required this.icon, required this.label, required this.bgColor,
    required this.iconColor, required this.textColor, required this.filled,
  });
}
