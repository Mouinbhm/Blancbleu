import 'dart:io';
import 'package:bb_core/bb_core.dart' show AuthException;
import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import '../config/theme.dart';
import '../services/api_service.dart';

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
  final Set<String> _downloading = {};

  static const _tabs = ['Toutes', 'En attente', 'Payees', 'Annulees'];

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
    } on AuthException {
      // Session expirée : clearSession + navigation Login gérés centralement
      // par DioClient.onAuthFailed.
      return;
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      setState(() { _error = msg; _loading = false; });
    }
  }

  Future<void> _payer(Map<String, dynamic> facture) async {
    final factureId = facture['_id'] as String? ?? '';
    if (factureId.isEmpty) return;

    try {
      // 1. Creer le PaymentIntent cote serveur
      final pi = await ApiService.createPaymentIntent(factureId);
      final clientSecret    = pi['clientSecret']    as String;
      final paymentIntentId = pi['paymentIntentId'] as String;

      // 2. Preparer la feuille de paiement Stripe
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'Ambulances Blanc Bleu',
          style: ThemeMode.light,
        ),
      );

      // 3. Afficher la feuille de paiement
      await Stripe.instance.presentPaymentSheet();

      // 4. Appel de confirmation fallback (le webhook reste autoritaire)
      if (!mounted) return;
      await ApiService.confirmerPaiement(factureId, paymentIntentId);

      // 5. Informer l'utilisateur que la confirmation est en cours
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.hourglass_top, color: Colors.white, size: 18),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Paiement recu — confirmation bancaire en cours...',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          backgroundColor: Colors.orange,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 4),
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

  Future<void> _downloadPdf(String factureId, String numero) async {
    if (_downloading.contains('pdf_$factureId')) return;
    setState(() => _downloading.add('pdf_$factureId'));

    try {
      final bytes = await ApiService.downloadFacturePdf(factureId);
      final dir   = await getTemporaryDirectory();
      final name  = numero.isNotEmpty ? 'facture_$numero.pdf' : 'facture_$factureId.pdf';
      final file  = File('${dir.path}/$name');
      await file.writeAsBytes(bytes);
      final result = await OpenFile.open(file.path);
      if (!mounted) return;
      if (result.type != ResultType.done) {
        _showError('Impossible d\'ouvrir le PDF : ${result.message}');
      }
    } catch (e) {
      if (!mounted) return;
      _showError(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _downloading.remove('pdf_$factureId'));
    }
  }

  Future<void> _downloadReceipt(String factureId, String numero) async {
    if (_downloading.contains('receipt_$factureId')) return;
    setState(() => _downloading.add('receipt_$factureId'));

    try {
      final bytes = await ApiService.downloadReceiptPdf(factureId);
      final dir   = await getTemporaryDirectory();
      final name  = numero.isNotEmpty ? 'recu_$numero.pdf' : 'recu_$factureId.pdf';
      final file  = File('${dir.path}/$name');
      await file.writeAsBytes(bytes);
      final result = await OpenFile.open(file.path);
      if (!mounted) return;
      if (result.type != ResultType.done) {
        _showError('Impossible d\'ouvrir le recu : ${result.message}');
      }
    } catch (e) {
      if (!mounted) return;
      _showError(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _downloading.remove('receipt_$factureId'));
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: Colors.red.shade700,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  List<dynamic> get _filtered {
    switch (_tabIndex) {
      case 1: return _factures.where((f) {
        final s = f['statut'] as String?;
        return s == 'en_attente' || s == 'emise' || s == 'en_retard';
      }).toList();
      case 2: return _factures.where((f) {
        final s = f['statut'] as String?;
        return s == 'payee' || s == 'remboursee' || s == 'partiellement_remboursee';
      }).toList();
      case 3: return _factures.where((f) {
        final s = f['statut'] as String?;
        return s == 'annulee' || s == 'brouillon' || s == 'payment_failed';
      }).toList();
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

  static _StatutStyle _statutStyle(String? s) {
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
      case 'payment_failed':
        return const _StatutStyle('Echec paiement', Color(0xFFDC2626), Color(0xFFFEF2F2), Icons.error_outline);
      case 'remboursee':
        return _StatutStyle('Remboursee', Colors.purple.shade700, Colors.purple.shade50, Icons.undo);
      case 'partiellement_remboursee':
        return _StatutStyle('Remb. partielle', Colors.purple.shade400, Colors.purple.shade50, Icons.undo_outlined);
      case 'en_retard':
        return _StatutStyle('En retard', Colors.red.shade800, Colors.red.shade50, Icons.warning_amber_rounded);
      default:
        return _StatutStyle(s ?? '--', Colors.grey.shade600, Colors.grey.shade100, Icons.receipt_long);
    }
  }

  static _PaymentBadgeStyle _paymentBadgeStyle(String? ps) {
    switch (ps) {
      case 'SUCCEEDED':
        return _PaymentBadgeStyle('Confirme', Colors.green.shade700, Colors.green.shade50, Icons.verified);
      case 'PENDING':
        return _PaymentBadgeStyle('En attente', Colors.orange.shade700, Colors.orange.shade50, Icons.hourglass_top);
      case 'FAILED':
        return const _PaymentBadgeStyle('Echec', Color(0xFFDC2626), Color(0xFFFEF2F2), Icons.close_rounded);
      case 'REFUNDED':
        return _PaymentBadgeStyle('Rembourse', Colors.purple.shade700, Colors.purple.shade50, Icons.undo);
      case 'PARTIALLY_REFUNDED':
        return _PaymentBadgeStyle('Remb. partiel', Colors.purple.shade400, Colors.purple.shade50, Icons.undo_outlined);
      default:
        return _PaymentBadgeStyle('Non paye', Colors.grey.shade500, Colors.grey.shade100, Icons.radio_button_unchecked);
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
      final s = f['statut'] as String?;
      if (s == 'payee' || s == 'remboursee' || s == 'partiellement_remboursee') payees++;
      if (s == 'en_attente' || s == 'emise' || s == 'en_retard')                enAttente++;
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
    final factureId   = (f['_id']            as String?) ?? '';
    final st          = _statutStyle(f['statut'] as String?);
    final ps          = _paymentBadgeStyle(f['paymentStatus'] as String?);
    final numero      = (f['numero']          as String?) ?? '';
    final dateStr     = _fmtDate(f['dateEmission']  as String?);
    final datePaie    = _fmtDate(f['datePaiement']  as String?);
    final dateEch     = _fmtDate(f['dateEcheance']  as String?);
    final motif       = (f['motif']            as String?) ?? '';
    final lieu1       = (f['lieuPrise']        as String?) ?? '';
    final lieu2       = (f['lieuDestination']  as String?) ?? '';
    final typeVeh     = _typeVehiculeLabel(f['typeVehicule'] as String?);
    final distKm      = (f['distanceKm']       as num?)?.toStringAsFixed(1) ?? '0';
    final montantTot  = _fmtEur(f['montantTotal']);
    final montantCPAM = _fmtEur(f['montantCPAM']);
    final montantPat  = _fmtEur(f['montantPatient']);
    final taux        = (f['tauxPriseEnCharge'] as num? ?? 65).toInt();
    final allerR      = (f['allerRetour'] as bool?) ?? false;
    final refExt      = (f['referenceExterne'] as String?) ?? '';
    final statut      = f['statut'] as String? ?? '';
    final payStatus   = f['paymentStatus'] as String? ?? 'UNPAID';

    final isPaid      = statut == 'payee';
    final canPay      = statut == 'emise' || statut == 'en_attente' || statut == 'payment_failed';
    final hasReceipt  = payStatus == 'SUCCEEDED';
    final hasPdf      = statut != 'brouillon';

    final dlPdfKey     = 'pdf_$factureId';
    final dlReceiptKey = 'receipt_$factureId';

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
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // Statut badge
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
                    // PaymentStatus badge (only if not UNPAID, to avoid clutter on brand-new invoices)
                    if (payStatus != 'UNPAID') ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: ps.bg,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(ps.icon, size: 10, color: ps.color),
                            const SizedBox(width: 4),
                            Text(
                              ps.label,
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: ps.color),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Montant total', style: TextStyle(fontSize: 13, color: AppTheme.secondary, fontWeight: FontWeight.w500)),
                    Text(montantTot, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppTheme.onSurface)),
                  ],
                ),
                const SizedBox(height: 12),

                // CPAM / Patient split
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
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: Row(
                          children: [
                            Expanded(flex: taux,       child: Container(height: 6, color: AppTheme.primaryContainer)),
                            Expanded(flex: 100 - taux, child: Container(height: 6, color: Colors.orange.shade400)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Dates
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

                // Payer en ligne
                if (canPay) ...[
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () => _payer(f),
                      icon: const Icon(Icons.credit_card, size: 18),
                      label: Text(
                        statut == 'payment_failed' ? 'Reessayer le paiement' : 'Payer en ligne',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: statut == 'payment_failed' ? Colors.red.shade700 : AppTheme.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],

                // PDF / Recu buttons
                if (hasPdf || hasReceipt) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      if (hasPdf)
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _downloading.contains(dlPdfKey)
                                ? null
                                : () => _downloadPdf(factureId, numero),
                            icon: _downloading.contains(dlPdfKey)
                                ? const SizedBox(
                                    width: 14, height: 14,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary),
                                  )
                                : const Icon(Icons.picture_as_pdf_outlined, size: 16),
                            label: const Text('Facture PDF', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppTheme.primary,
                              side: const BorderSide(color: AppTheme.primary, width: 1.2),
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ),
                      if (hasPdf && hasReceipt) const SizedBox(width: 10),
                      if (hasReceipt)
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _downloading.contains(dlReceiptKey)
                                ? null
                                : () => _downloadReceipt(factureId, numero),
                            icon: _downloading.contains(dlReceiptKey)
                                ? const SizedBox(
                                    width: 14, height: 14,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.green),
                                  )
                                : const Icon(Icons.receipt_outlined, size: 16),
                            label: const Text('Recu PDF', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.green.shade700,
                              side: BorderSide(color: Colors.green.shade700, width: 1.2),
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ),
                    ],
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
    int countTab(int i) {
      switch (i) {
        case 1: return _factures.where((f) {
          final s = f['statut'] as String?;
          return s == 'en_attente' || s == 'emise' || s == 'en_retard';
        }).length;
        case 2: return _factures.where((f) {
          final s = f['statut'] as String?;
          return s == 'payee' || s == 'remboursee' || s == 'partiellement_remboursee';
        }).length;
        case 3: return _factures.where((f) {
          final s = f['statut'] as String?;
          return s == 'annulee' || s == 'brouillon' || s == 'payment_failed';
        }).length;
        default: return _factures.length;
      }
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: AppTheme.surfaceContainer, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: List.generate(_tabs.length, (i) {
          final active = _tabIndex == i;
          final count  = countTab(i);
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
    );
  }
}

// ── Value objects ─────────────────────────────────────────────────────────────

class _StatutStyle {
  final String   label;
  final Color    color;
  final Color    bg;
  final IconData icon;
  const _StatutStyle(this.label, this.color, this.bg, this.icon);
}

class _PaymentBadgeStyle {
  final String   label;
  final Color    color;
  final Color    bg;
  final IconData icon;
  const _PaymentBadgeStyle(this.label, this.color, this.bg, this.icon);
}
