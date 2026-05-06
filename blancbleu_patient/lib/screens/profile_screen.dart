import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../config/theme.dart';
import '../services/api_service.dart';
import 'login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  static const _errorColor          = Color(0xFFBA1A1A);
  static const _errorContainerColor = Color(0xFFFFDAD6);
  static const _onErrorContainer    = Color(0xFF93000A);

  Map<String, dynamic>? _patient;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await ApiService.getCachedPatient();
    if (!mounted) return;
    setState(() { _patient = p; _loading = false; });
  }

  String _initials() {
    if (_patient == null) return '?';
    final p = (_patient!['prenom'] as String? ?? '?');
    final n = (_patient!['nom']    as String? ?? '?');
    return '${p.isNotEmpty ? p[0] : '?'}${n.isNotEmpty ? n[0] : '?'}';
  }

  String _fullName() {
    if (_patient == null) return '';
    final p = (_patient!['prenom'] as String? ?? '');
    final n = (_patient!['nom']    as String? ?? '');
    return '$p $n'.trim();
  }

  String _mobiliteLabel() {
    switch (_patient?['mobilite'] as String?) {
      case 'FAUTEUIL_ROULANT': return 'Fauteuil roulant';
      case 'ALLONGE':          return 'Allonge / Civiere';
      default:                 return 'Marche seul';
    }
  }

  IconData _mobiliteIcon() {
    switch (_patient?['mobilite'] as String?) {
      case 'FAUTEUIL_ROULANT': return Icons.accessible;
      case 'ALLONGE':          return Icons.airline_seat_flat;
      default:                 return Icons.directions_walk;
    }
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Deconnexion'),
        content: const Text('Voulez-vous vraiment vous deconnecter ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: _errorColor),
            child: const Text('Se deconnecter'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await ApiService.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  void _copyAndShowPhone(String tel) {
    Clipboard.setData(ClipboardData(text: tel));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Numero copie : $tel'),
        duration: const Duration(seconds: 2),
        action: SnackBarAction(label: 'OK', onPressed: () {}),
      ),
    );
  }

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
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(shape: BoxShape.circle, color: AppTheme.primaryFixed),
              child: Center(
                child: Text(
                  _loading ? '?' : _initials(),
                  style: const TextStyle(color: Color(0xFF001946), fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
            ),
            const SizedBox(width: 12),
            const Text(
              'Profil',
              style: TextStyle(color: Color(0xFF2563EB), fontWeight: FontWeight.w700, fontSize: 18),
            ),
          ],
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

  // ── BottomNav ──────────────────────────────────────────────────────────────
  Widget _buildBottomNav() {
    const items = [
      {'icon': Icons.home_outlined,             'label': 'Accueil'},
      {'icon': Icons.medical_services_outlined, 'label': 'Transports'},
      {'icon': Icons.receipt_long_outlined,     'label': 'Factures'},
      {'icon': Icons.description_outlined,      'label': 'Ordonnances'},
      {'icon': Icons.person,                    'label': 'Profil'},
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
              final active = i == 4;
              final item   = items[i];
              return GestureDetector(
                onTap: () { if (i != 4) Navigator.of(context).pop(); },
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
                      Icon(item['icon'] as IconData, color: active ? AppTheme.primary : Colors.grey, size: 24),
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

  // ── Section 1 — Header ─────────────────────────────────────────────────────
  Widget _buildProfileHeader() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      child: Column(
        children: [
          Container(
            width: 88, height: 88,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.primaryContainer,
              border: Border.all(color: Colors.white, width: 4),
              boxShadow: [BoxShadow(color: AppTheme.primary.withOpacity(0.2), blurRadius: 16, offset: const Offset(0, 6))],
            ),
            child: Center(
              child: Text(
                _loading ? '?' : _initials(),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 32),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            _loading ? '...' : _fullName(),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: AppTheme.onSurface, letterSpacing: -0.3),
          ),
          const SizedBox(height: 4),
          if (!_loading && (_patient?['email'] as String? ?? '').isNotEmpty)
            Text(
              _patient!['email'] as String,
              style: const TextStyle(fontSize: 13, color: AppTheme.secondary),
            ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0xFFBFDBFE)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(_loading ? Icons.person : _mobiliteIcon(), size: 14, color: const Color(0xFF1D4ED8)),
                const SizedBox(width: 4),
                Text(
                  _loading ? '...' : _mobiliteLabel(),
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF1D4ED8)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Section 2 — Perso ──────────────────────────────────────────────────────
  Widget _buildPersoSection() {
    final tel     = (_patient?['telephone'] as String?) ?? '';
    final adresse = (_patient?['adresse']   as String?) ?? '';

    return _card(
      child: Column(
        children: [
          _sectionHeader(Icons.person, 'PERSO'),
          const SizedBox(height: 16),
          _infoRow(
            label: 'Telephone',
            value: tel.isNotEmpty ? tel : '--',
            trailing: tel.isNotEmpty
                ? GestureDetector(
                    onTap: () => _copyAndShowPhone(tel),
                    child: const Icon(Icons.content_copy, color: Colors.black12, size: 20),
                  )
                : null,
          ),
          _divider(),
          _infoRow(
            label: 'Adresse',
            value: adresse.isNotEmpty ? adresse : '--',
            trailing: const Icon(Icons.location_on, color: Colors.black12, size: 22),
          ),
          _divider(),
          _infoRowCustom(
            label: 'Mobilite',
            child: Row(
              children: [
                Icon(_mobiliteIcon(), size: 16, color: AppTheme.primary),
                const SizedBox(width: 6),
                Text(
                  _mobiliteLabel(),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.onSurface),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Section 3 — Medical + Urgence ──────────────────────────────────────────
  Widget _buildMedicalUrgenceRow() {
    final medecin = (_patient?['medecin']  as String?) ?? '--';
    final mutuelle = (_patient?['mutuelle'] as String?) ?? '--';
    final urgNom = (_patient?['contactUrgence']?['nom']       as String?) ?? '';
    final urgTel = (_patient?['contactUrgence']?['telephone'] as String?) ?? '';

    final urgInitials = urgNom.isNotEmpty
        ? urgNom.trim().split(' ').map((w) => w.isNotEmpty ? w[0] : '').join()
        : '?';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionHeader(Icons.medical_information, 'MEDICAL'),
                const SizedBox(height: 14),
                const Text('Medecin', style: TextStyle(fontSize: 11, color: AppTheme.secondary, fontWeight: FontWeight.w500)),
                const SizedBox(height: 2),
                Text(medecin.isNotEmpty ? medecin : '--',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
                const SizedBox(height: 12),
                const Text('Mutuelle', style: TextStyle(fontSize: 11, color: AppTheme.secondary, fontWeight: FontWeight.w500)),
                const SizedBox(height: 2),
                Text(mutuelle.isNotEmpty ? mutuelle : '--',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
              ],
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionHeader(Icons.emergency, 'URGENCE', color: _errorColor),
                const SizedBox(height: 14),
                if (urgNom.isEmpty)
                  const Text('Aucun contact', style: TextStyle(fontSize: 14, color: AppTheme.secondary))
                else ...[
                  Row(
                    children: [
                      Container(
                        width: 40, height: 40,
                        decoration: const BoxDecoration(shape: BoxShape.circle, color: _errorContainerColor),
                        child: Center(
                          child: Text(
                            urgInitials.toUpperCase().substring(0, urgInitials.length.clamp(0, 2)),
                            style: const TextStyle(color: _onErrorContainer, fontWeight: FontWeight.w700, fontSize: 13),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(urgNom, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
                            if (urgTel.isNotEmpty)
                              Text(urgTel, style: const TextStyle(fontSize: 11, color: AppTheme.secondary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (urgTel.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 44,
                      child: ElevatedButton.icon(
                        onPressed: () => _copyAndShowPhone(urgTel),
                        icon: const Icon(Icons.content_copy, size: 17),
                        label: const Text('Copier tel', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _errorContainerColor,
                          foregroundColor: _onErrorContainer,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ── Section 4 — Map ────────────────────────────────────────────────────────
  Widget _buildMapSection() {
    return Container(
      height: 124,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [const Color(0xFFBFD7FF), AppTheme.primaryFixed, const Color(0xFFE8F0FE)],
        ),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [BoxShadow(color: AppTheme.primary.withOpacity(0.08), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: CustomPaint(painter: _GridPainter()),
            ),
          ),
          const Positioned(top: 24, left: 0, right: 0,
              child: Icon(Icons.home_outlined, color: AppTheme.primary, size: 32)),
          Positioned(
            bottom: 10, left: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.9),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.white.withOpacity(0.5)),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.home, size: 13, color: AppTheme.primary),
                  SizedBox(width: 4),
                  Text('Domicile enregistre', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Section 5 — Parametres ────────────────────────────────────────────────
  Widget _buildParametresSection() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: _sectionHeader(Icons.settings, 'PARAMETRES'),
          ),
          const Divider(height: 1, color: Color(0xFFF8F8F8)),
          _settingsItem(
            icon: Icons.notifications_outlined,
            label: 'Notifications',
            trailing: const Icon(Icons.chevron_right, color: Colors.black12),
            onTap: () {},
          ),
          const Divider(height: 1, color: Color(0xFFF8F8F8)),
          _settingsItem(
            icon: Icons.language_outlined,
            label: 'Langue',
            trailing: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Francais', style: TextStyle(fontSize: 13, color: AppTheme.secondary)),
                Icon(Icons.chevron_right, color: Colors.black12),
              ],
            ),
            onTap: () {},
          ),
          const Divider(height: 1, color: Color(0xFFF8F8F8)),
          _settingsItem(
            icon: Icons.logout,
            label: 'Se deconnecter',
            iconColor: _errorColor,
            textColor: _errorColor,
            onTap: _logout,
          ),
        ],
      ),
    );
  }

  // ── Shared widgets ─────────────────────────────────────────────────────────
  Widget _card({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: child,
    );
  }

  Widget _sectionHeader(IconData icon, String label, {Color? color}) {
    return Row(
      children: [
        Icon(icon, color: color ?? AppTheme.primary, size: 20),
        const SizedBox(width: 8),
        Text(label,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                color: color ?? AppTheme.secondary, letterSpacing: 1.2)),
      ],
    );
  }

  Widget _infoRow({required String label, required String value, Widget? trailing, bool mono = false}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(),
                  style: const TextStyle(fontSize: 10, color: AppTheme.secondary, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
              const SizedBox(height: 2),
              Text(value,
                  style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.onSurface,
                    fontFamily: mono ? 'monospace' : null, letterSpacing: mono ? 1.5 : 0,
                  )),
            ],
          ),
        ),
        if (trailing != null) trailing,
      ],
    );
  }

  Widget _infoRowCustom({required String label, required Widget child}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: const TextStyle(fontSize: 10, color: AppTheme.secondary, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
        const SizedBox(height: 6),
        child,
      ],
    );
  }

  Widget _divider() => const Padding(
    padding: EdgeInsets.symmetric(vertical: 10),
    child: Divider(height: 1, color: Color(0xFFF9F9F9)),
  );

  Widget _settingsItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    Widget? trailing,
    Color? iconColor,
    Color? textColor,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: iconColor ?? AppTheme.secondary, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Text(label,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: textColor ?? AppTheme.onSurface)),
            ),
            if (trailing != null) trailing,
          ],
        ),
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
          : SingleChildScrollView(
              child: Column(
                children: [
                  _buildProfileHeader(),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      children: [
                        const SizedBox(height: 8),
                        _buildPersoSection(),
                        const SizedBox(height: 16),
                        _buildMedicalUrgenceRow(),
                        const SizedBox(height: 16),
                        _buildMapSection(),
                        const SizedBox(height: 16),
                        _buildParametresSection(),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ],
              ),
            ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withOpacity(0.3)..strokeWidth = 1;
    const step  = 24.0;
    for (double x = 0; x < size.width;  x += step) canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    for (double y = 0; y < size.height; y += step) canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    final road = Paint()..color = Colors.white.withOpacity(0.55)..strokeWidth = 2.5..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(0, size.height * 0.45), Offset(size.width, size.height * 0.45), road);
    canvas.drawLine(Offset(size.width * 0.4, 0), Offset(size.width * 0.4, size.height), road);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
