import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import '../config/theme.dart';
import '../services/api_service.dart';
import 'login_screen.dart';

class FacturesScreen extends StatefulWidget {
  const FacturesScreen({super.key});

  @override
  State<FacturesScreen> createState() => _FacturesScreenState();
}

class _FacturesScreenState extends State<FacturesScreen> {
  bool          _loading  = true;
  String?       _error;
  List<dynamic> _factures = [];
  int           _tabIndex = 0;

  static const _tabs = ['Toutes', 'En attente', 'Payees', 'Annulees'];

  static const _navItems = [
    _NavItem(icon: Icons.home_outlined,             filledIcon: Icons.home,             label: 'Accueil'),
    _NavItem(icon: Icons.medical_services_outlined, filledIcon: Icons.medical_services, label: 'Transports'),
    _NavItem(icon: Icons.receipt_long_outlined,     filledIcon: Icons.receipt_long,     label: 'Factures'),
    _NavItem(icon: Icons.description_outlined,      filledIcon: Icons.description,      label: 'Ordonnances'),
    _NavItem(icon: Icons.person_outline,            filledIcon: Icons.person,           label: 'Profil'),
  ];

  static const _moisLong = [
    'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      setState(() { _loading = true; _error = null; });
      final f = await ApiService.getFactures();
      if (!mounted) return;
      setState(() { _factures = f; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      if (msg == 'SESSION_EXPIRED') {
        await ApiService.clearSession();
        if (!mounted) return;
        Navigator.pushAndRemoveUntil(
            context, MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
        return;
      }
      setState(() { _error = msg; _loading = false; });
    }
  }

  Future<void> _payer(Map<String, dynamic> facture) async {
    final factureId = facture['_id'] as String? ?? '';
    if (factureId.isEmpty) return;

    try {
      // 1. Créer le PaymentIntent côté serveur
      final pi = await ApiService.createPaymentIntent(factureId);
      final clientSecret    = pi['clientSecret']    as String;
      final paymentIntentId = pi['paymentIntentId'] as String;

      // 2. Préparer la feuille de paiement Stripe
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'Ambulances Blanc Bleu',
          style: ThemeMode.light,
        ),
      );

      // 3. Afficher la feuille de paiement
      await Stripe.instance.presentPaymentSheet();

      // 4. Confirmer côté serveur et marquer comme payée
      if (!mounted) return;
      await ApiService.confirmerPaiement(factureId, paymentIntentId);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Paiement effectue avec succes !'),
          backgroundColor: Colors.green,
          behavior: SnackBarBehavior.floating,
        ),
      );
      _load();
    } on StripeException catch (e) {
      if (!mounted) return;
      if (e.error.code == FailureCode.Canceled) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.error.localizedMessage ?? 'Paiement echoue'),
          backgroundColor: Colors.red.shade700,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          backgroundColor: Colors.red.shade700,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  List<dynamic> get _filtered {
    switch (_tabIndex) {
      case 1: return _factures.where((f) => f['statut'] == 'en_attente' || f['statut'] == 'emise').toList();
      case 2: return _factures.where((f) => f['statut'] == 'payee').toList();
      case 3: return _factures.where((f) => f['statut'] == 'annulee' || f['statut'] == 'brouillon').toList();
      default: return _factures;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  String _fmtDate(String? iso) {
    if (iso == null) return '--';
    final d = DateTime.parse(iso).toLocal();
    return '${d.day} ${_moisLong[d.month - 1]} ${d.year}';
  }

  String _fmtEur(dynamic v) {
    if (v == null) return '--';
    final n = (v is num) ? v.toDouble() : double.tryParse(v.toString()) ?? 0.0;
    return '${n.toStringAsFixed(2)} EUR';
  }

  static _StatutStyle _statut(String? s) {
    switch (s) {
      case 'payee':
        return _StatutStyle('Payee', Colors.green.shade700, Colors.green.shade50, Icons.check_circle);
      case 'emise':
        return _StatutStyle('Emise', const Color(0xFF2563EB), const Color(0xFFEFF6FF), Icons.send);
      case 'en_attente':
        return _StatutStyle('En attente', Colors.orange.shade700, Colors.orange.shade50, Icons.hourglass_empty);
      case 'annulee':
        return _StatutStyle('Annulee', const Color(0xFFDC2626), const Color(0xFFFEF2F2), Icons.cancel);
      case 'brouillon':
        return _StatutStyle('Brouillon', Colors.grey.shade600, Colors.grey.shade100, Icons.edit_note);
      default:
        return _StatutStyle(s ?? '--', Colors.grey.shade600, Colors.grey.shade100, Icons.receipt_long);
    }
  }

  String _typeVehiculeLabel(String? t) {
    switch (t) {
      case 'VSL':       return 'VSL';
      case 'TPMR':      return 'TPMR (fauteuil)';
      case 'AMBULANCE': return 'Ambulance';
      default:          return t ?? '--';
    }
  }

  // ── Stats Banner ───────────────────────────────────────────────────────────
  Widget _buildStatsBanner() {
    if (_factures.isEmpty) return const SizedBox.shrink();

    double totalGlobal = 0;
    double totalCPAM   = 0;
    double totalPatient= 0;
    int    payees      = 0;
    int    enAttente   = 0;

    for (final f in _factures) {
      totalGlobal  += (f['montantTotal']   as num? ?? 0).toDouble();
      totalCPAM    += (f['montantCPAM']    as num? ?? 0).toDouble();
      totalPatient += (f['montantPatient'] as num? ?? 0).toDouble();
      if (f['statut'] == 'payee')                                       payees++;
      if (f['statut'] == 'en_attente' || f['statut'] == 'emise')        enAttente++;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0047B3), AppTheme.primaryContainer],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(color: AppTheme.primary.withOpacity(0.25), blurRadius: 12, offset: const Offset(0, 6)),
        ],
      ),
      child: Stack(
        children: [
          // Decorative circle
          Positioned(
            right: -20, top: -20,
            child: Container(
              width: 120, height: 120,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withOpacity(0.07),
              ),
            ),
          ),
          Positioned(
            right: 30, bottom: -30,
            child: Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withOpacity(0.05),
              ),
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'TOTAL FACTURES',
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                              color: Colors.white70, letterSpacing: 1.5),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _fmtEur(totalGlobal),
                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800,
                              color: Colors.white, letterSpacing: -0.5),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.receipt_long, color: Colors.white, size: 28),
                    ),
                  ],
                ),

                const SizedBox(height: 16),
                Container(height: 1, color: Colors.white.withOpacity(0.2)),
                const SizedBox(height: 16),

                // CPAM / Patient split
                Row(
                  children: [
                    Expanded(
                      child: _statBannerItem(
                        icon: Icons.health_and_safety_outlined,
                        label: 'Prise CPAM',
                        value: _fmtEur(totalCPAM),
                      ),
                    ),
                    Container(width: 1, height: 40, color: Colors.white.withOpacity(0.2)),
                    Expanded(
                      child: _statBannerItem(
                        icon: Icons.person_outline,
                        label: 'Ticket moderateur',
                        value: _fmtEur(totalPatient),
                      ),
                    ),
                    Container(width: 1, height: 40, color: Colors.white.withOpacity(0.2)),
                    Expanded(
                      child: _statBannerItem(
                        icon: Icons.check_circle_outline,
                        label: 'Payees',
                        value: '$payees / ${_factures.length}',
                      ),
                    ),
                  ],
                ),

                if (enAttente > 0) ...[
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade400.withOpacity(0.25),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.orange.shade300.withOpacity(0.4)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.info_outline, color: Colors.white, size: 16),
                        const SizedBox(width: 8),
                        Text(
                          '$enAttente facture${enAttente > 1 ? 's' : ''} en attente de paiement',
                          style: const TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _statBannerItem({required IconData icon, required String label, required String value}) {
    return Column(
      children: [
        Icon(icon, color: Colors.white70, size: 18),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 10, color: Colors.white60), textAlign: TextAlign.center),
      ],
    );
  }

  // ── Facture Card ───────────────────────────────────────────────────────────
  Widget _buildCard(Map<String, dynamic> f) {
    final st         = _statut(f['statut'] as String?);
    final numero     = (f['numero']          as String?) ?? '';
    final dateStr    = _fmtDate(f['dateEmission']  as String?);
    final datePaie   = _fmtDate(f['datePaiement']  as String?);
    final dateEch    = _fmtDate(f['dateEcheance']  as String?);
    final motif      = (f['motif']            as String?) ?? '';
    final lieu1      = (f['lieuPrise']        as String?) ?? '';
    final lieu2      = (f['lieuDestination']  as String?) ?? '';
    final typeVeh    = _typeVehiculeLabel(f['typeVehicule'] as String?);
    final distKm     = (f['distanceKm']       as num?)?.toStringAsFixed(1) ?? '0';
    final montantTot = _fmtEur(f['montantTotal']);
    final montantCPAM= _fmtEur(f['montantCPAM']);
    final montantPat = _fmtEur(f['montantPatient']);
    final taux       = (f['tauxPriseEnCharge'] as num? ?? 65).toInt();
    final allerR     = (f['allerRetour'] as bool?) ?? false;
    final refExt     = (f['referenceExterne'] as String?) ?? '';

    final isPaid     = f['statut'] == 'payee';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, 4)),
        ],
        border: Border.all(
          color: isPaid ? Colors.green.shade100 : Colors.transparent,
          width: isPaid ? 1.5 : 0,
        ),
      ),
      child: Column(
        children: [
          // ── Header ──────────────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            decoration: BoxDecoration(
              color: isPaid ? Colors.green.shade50 : Colors.white,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Icon
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: st.bg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(st.icon, color: st.color, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        numero.isNotEmpty ? 'Facture $numero' : 'Facture',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700,
                            color: AppTheme.onSurface, letterSpacing: -0.2),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Emise le $dateStr',
                        style: const TextStyle(fontSize: 12, color: AppTheme.secondary),
                      ),
                      if (refExt.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(refExt, style: const TextStyle(fontSize: 11, color: AppTheme.secondary)),
                      ],
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: st.bg,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    st.label,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: st.color),
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 1, color: Color(0xFFF0F0F0)),

          // ── Transport info ───────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Column(
              children: [
                if (motif.isNotEmpty || lieu1.isNotEmpty || lieu2.isNotEmpty)
                  _infoRow(
                    Icons.local_hospital_outlined,
                    lieu2.isNotEmpty
                        ? '${lieu1.isNotEmpty ? '$lieu1 → ' : ''}$lieu2'
                        : (motif.isNotEmpty ? motif : 'Transport medical'),
                    sub: motif.isNotEmpty && lieu2.isNotEmpty ? motif : null,
                  ),
                if (typeVeh.isNotEmpty)
                  _infoRow(Icons.directions_car_outlined, typeVeh,
                      trailing: allerR
                          ? Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF3E8FF),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text('A/R', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.purple)),
                            )
                          : null),
                if (distKm != '0')
                  _infoRow(Icons.straighten, '$distKm km parcourus'),
              ],
            ),
          ),

          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Divider(height: 1, color: Color(0xFFF0F0F0)),
          ),

          // ── Montants ─────────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              children: [
                // Total
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Montant total', style: TextStyle(fontSize: 13, color: AppTheme.secondary, fontWeight: FontWeight.w500)),
                    Text(montantTot, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppTheme.onSurface)),
                  ],
                ),
                const SizedBox(height: 12),

                // CPAM / Patient split bar
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          // CPAM part
                          Expanded(
                            flex: taux,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(width: 10, height: 10,
                                        decoration: BoxDecoration(color: AppTheme.primaryContainer, borderRadius: BorderRadius.circular(2))),
                                    const SizedBox(width: 6),
                                    const Text('CPAM', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.secondary)),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(montantCPAM, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.primaryContainer)),
                                Text('$taux%', style: const TextStyle(fontSize: 10, color: AppTheme.secondary)),
                              ],
                            ),
                          ),
                          Container(width: 1, height: 40, color: const Color(0xFFE5E7EB)),
                          // Patient part
                          Expanded(
                            flex: 100 - taux,
                            child: Padding(
                              padding: const EdgeInsets.only(left: 16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Container(width: 10, height: 10,
                                          decoration: BoxDecoration(color: Colors.orange.shade400, borderRadius: BorderRadius.circular(2))),
                                      const SizedBox(width: 6),
                                      const Text('Votre part', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.secondary)),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(montantPat, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.orange.shade700)),
                                  Text('${100 - taux}%', style: const TextStyle(fontSize: 10, color: AppTheme.secondary)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 10),
                      // Visual bar
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: Row(
                          children: [
                            Expanded(
                              flex: taux,
                              child: Container(height: 6, color: AppTheme.primaryContainer),
                            ),
                            Expanded(
                              flex: 100 - taux,
                              child: Container(height: 6, color: Colors.orange.shade400),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Paid / due date info
                if (isPaid && datePaie != '--') ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.check_circle, size: 16, color: Colors.green.shade600),
                      const SizedBox(width: 6),
                      Text('Paye le $datePaie',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.green.shade700)),
                    ],
                  ),
                ] else if (!isPaid && dateEch != '--') ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.schedule, size: 16, color: Colors.orange.shade600),
                      const SizedBox(width: 6),
                      Text('Echeance : $dateEch',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.orange.shade700)),
                    ],
                  ),
                ],

                // Bouton paiement en ligne
                if (!isPaid && (f['statut'] == 'emise' || f['statut'] == 'en_attente')) ...[
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () => _payer(f),
                      icon: const Icon(Icons.credit_card, size: 18),
                      label: const Text(
                        'Payer en ligne',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String text, {String? sub, Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: AppTheme.secondary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(text, style: const TextStyle(fontSize: 14, color: AppTheme.onSurface, fontWeight: FontWeight.w500)),
                if (sub != null) Text(sub, style: const TextStyle(fontSize: 12, color: AppTheme.secondary)),
              ],
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }

  // ── Tab bar ────────────────────────────────────────────────────────────────
  Widget _buildTabBar() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: AppTheme.surfaceContainer, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: List.generate(_tabs.length, (i) {
          final active = _tabIndex == i;
          final count  = i == 0
              ? _factures.length
              : i == 1 ? _factures.where((f) => f['statut'] == 'en_attente' || f['statut'] == 'emise').length
              : i == 2 ? _factures.where((f) => f['statut'] == 'payee').length
              : _factures.where((f) => f['statut'] == 'annulee' || f['statut'] == 'brouillon').length;
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
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _tabs[i],
                      style: TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: active ? AppTheme.primary : AppTheme.secondary,
                      ),
                    ),
                    if (count > 0)
                      Text(
                        '$count',
                        style: TextStyle(
                          fontSize: 10, fontWeight: FontWeight.w700,
                          color: active ? AppTheme.primaryContainer : AppTheme.secondary,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          );
        }),
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
      title: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 20),
        child: Row(
          children: [
            Icon(Icons.receipt_long, color: AppTheme.primaryContainer, size: 24),
            SizedBox(width: 10),
            Text(
              'Mes factures',
              style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w900, fontSize: 19, letterSpacing: -0.5),
            ),
          ],
        ),
      ),
      actions: [
        IconButton(onPressed: _load, icon: const Icon(Icons.refresh_outlined, color: Colors.grey)),
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
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(_navItems.length, (i) {
              final item   = _navItems[i];
              final active = i == 2;
              return GestureDetector(
                onTap: () { if (i != 2) Navigator.of(context).pop(); },
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
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                              color: active ? AppTheme.primary : Colors.grey)),
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

  // ── Empty state ────────────────────────────────────────────────────────────
  Widget _buildEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 60),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(Icons.receipt_long_outlined, size: 40, color: AppTheme.primaryContainer),
            ),
            const SizedBox(height: 16),
            const Text(
              'Aucune facture',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
            ),
            const SizedBox(height: 6),
            const Text(
              'Vos factures apparaitront ici\nune fois vos transports termines.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: AppTheme.secondary, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final displayed = _filtered;

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
                        Container(
                          width: 72, height: 72,
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF2F2),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: const Icon(Icons.wifi_off, size: 36, color: Color(0xFFDC2626)),
                        ),
                        const SizedBox(height: 16),
                        const Text('Connexion impossible',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
                        const SizedBox(height: 6),
                        Text(_error!, textAlign: TextAlign.center,
                            style: const TextStyle(color: AppTheme.secondary, fontSize: 14)),
                        const SizedBox(height: 20),
                        ElevatedButton.icon(
                          onPressed: _load,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Reessayer'),
                          style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primaryContainer, foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                        ),
                      ],
                    ),
                  ),
                )
              : CustomScrollView(
                  slivers: [
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildStatsBanner(),
                            _buildTabBar(),
                            const SizedBox(height: 20),
                          ],
                        ),
                      ),
                    ),
                    if (displayed.isEmpty)
                      SliverFillRemaining(child: _buildEmpty())
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                        sliver: SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (_, i) => _buildCard(displayed[i] as Map<String, dynamic>),
                            childCount: displayed.length,
                          ),
                        ),
                      ),
                  ],
                ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class _StatutStyle {
  final String  label;
  final Color   color;
  final Color   bg;
  final IconData icon;
  const _StatutStyle(this.label, this.color, this.bg, this.icon);
}

class _NavItem {
  final IconData icon;
  final IconData filledIcon;
  final String   label;
  const _NavItem({required this.icon, required this.filledIcon, required this.label});
}
