import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../auth/cubit/auth_cubit.dart';
import '../../shift/cubit/shift_cubit.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/theme/theme_notifier.dart';
import '../../../shared/theme/app_theme.dart';

class ProfileScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  const ProfileScreen({super.key, required this.user});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String? _avatarUrl;
  Map<String, dynamic>? _stats;
  bool _loadingStats    = false;
  bool _uploadingAvatar = false;
  bool _notifEnabled    = true;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
    _loadStats();
  }

  Future<void> _loadPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _avatarUrl    = prefs.getString('avatar_url');
      _notifEnabled = prefs.getBool('notif_enabled') ?? true;
    });
  }

  Future<void> _loadStats() async {
    setState(() => _loadingStats = true);
    try {
      final uid = widget.user['_id']?.toString() ?? widget.user['id']?.toString() ?? '';
      if (uid.isNotEmpty) {
        final res = await ApiClient.instance.getShiftStats(uid);
        if (mounted) setState(() => _stats = res);
      }
    } catch (_) {} finally {
      if (mounted) setState(() => _loadingStats = false);
    }
  }

  // ── Avatar upload ────────────────────────────────────────────────────────────

  Future<void> _pickAndUploadAvatar() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 70,
      maxWidth: 512,
    );
    if (file == null) return;
    setState(() => _uploadingAvatar = true);
    try {
      final url = await ApiClient.instance.uploadAvatar(file.path);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('avatar_url', url);
      if (mounted) setState(() => _avatarUrl = url);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erreur upload: $e'),
          backgroundColor: AppTheme.error,
        ));
      }
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  // ── Document upload ──────────────────────────────────────────────────────────

  Future<void> _uploadDocument(String type) async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (file == null) return;
    try {
      await ApiClient.instance.uploadDocument(type, file.path);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Document uploadé ✓'),
          backgroundColor: AppTheme.success,
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erreur: $e'),
          backgroundColor: AppTheme.error,
        ));
      }
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final cs     = Theme.of(context).colorScheme;
    final nom    = widget.user['nom']       as String? ?? '';
    final prenom = widget.user['prenom']    as String? ?? '';
    final email  = widget.user['email']     as String? ?? '';
    final phone  = widget.user['telephone'] as String? ?? '';
    final role   = widget.user['role']      as String? ?? '';
    final initials = [
      prenom.isNotEmpty ? prenom[0] : '',
      nom.isNotEmpty    ? nom[0]    : '',
    ].join().toUpperCase();

    return Scaffold(
      appBar: AppBar(title: const Text('Mon profil'), automaticallyImplyLeading: false),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        child: Column(crossAxisAlignment: CrossAxisAlignment.center, children: [

          // ── Avatar ──────────────────────────────────────────────────────────
          const SizedBox(height: 8),
          Stack(alignment: Alignment.bottomRight, children: [
            _uploadingAvatar
                ? const SizedBox(
                    width: 88, height: 88,
                    child: CircularProgressIndicator(strokeWidth: 3),
                  )
                : CircleAvatar(
                    radius: 44,
                    backgroundColor: AppTheme.primary.withOpacity(0.15),
                    backgroundImage: _avatarUrl != null ? NetworkImage(_avatarUrl!) : null,
                    child: _avatarUrl == null
                        ? Text(
                            initials.isEmpty ? '?' : initials,
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.primary,
                            ),
                          )
                        : null,
                  ),
            GestureDetector(
              onTap: _pickAndUploadAvatar,
              child: Container(
                width: 30, height: 30,
                decoration: BoxDecoration(
                  color: AppTheme.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: cs.surface, width: 2),
                ),
                child: const Icon(Icons.camera_alt, size: 15, color: Colors.white),
              ),
            ),
          ]),

          const SizedBox(height: 12),
          Text(
            '$prenom $nom'.trim(),
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: cs.onSurface),
          ),
          const SizedBox(height: 4),
          Text(_roleLabel(role), style: const TextStyle(fontSize: 13, color: AppTheme.secondary)),
          const SizedBox(height: 8),
          BlocBuilder<ShiftCubit, ShiftState>(
            builder: (_, state) => _statusBadge(state),
          ),

          const SizedBox(height: 24),

          // ── Mon profil ───────────────────────────────────────────────────────
          _sectionTitle('Mon profil', cs),
          _card(cs, [
            _infoRow(Icons.person_outline,  '$prenom $nom'.trim(), cs),
            const Divider(height: 20),
            _infoRow(Icons.badge_outlined,   _roleLabel(role), cs),
            if (email.isNotEmpty) ...[
              const Divider(height: 20),
              _infoRow(Icons.email_outlined, email, cs),
            ],
            if (phone.isNotEmpty) ...[
              const Divider(height: 20),
              _infoRow(Icons.phone_outlined, phone, cs),
            ],
          ]),

          const SizedBox(height: 12),

          // ── Shift actif ──────────────────────────────────────────────────────
          BlocBuilder<ShiftCubit, ShiftState>(
            builder: (_, state) {
              if (state is! ShiftActive) return const SizedBox();
              final count = state.shift['transportCount'] ?? 0;
              final vi    = state.shift['vehicleId'];
              final plate = vi is Map ? vi['immatriculation']?.toString() ?? '' : '';
              return Column(children: [
                _sectionTitle('Shift actif', cs),
                _card(cs, [
                  if (plate.isNotEmpty) ...[
                    _infoRow(Icons.directions_car_outlined, plate, cs),
                    const Divider(height: 16),
                  ],
                  _infoRow(
                    Icons.assignment_outlined,
                    '$count transport${count != 1 ? 's' : ''} assigné${count != 1 ? 's' : ''}',
                    cs,
                  ),
                ]),
                const SizedBox(height: 12),
              ]);
            },
          ),

          // ── Stats du mois ────────────────────────────────────────────────────
          _sectionTitle('Mes stats du mois', cs),
          _buildStats(cs),

          const SizedBox(height: 12),

          // ── Documents ────────────────────────────────────────────────────────
          _sectionTitle('Mes documents', cs),
          _card(cs, [
            _docRow('Permis de conduire',    'permis',   cs),
            const Divider(height: 20),
            _docRow('Carte professionnelle', 'carte_pro', cs),
          ]),

          const SizedBox(height: 12),

          // ── Paramètres ───────────────────────────────────────────────────────
          _sectionTitle('Paramètres', cs),
          _card(cs, [
            // Dark mode
            ListenableBuilder(
              listenable: ThemeNotifier.instance,
              builder: (_, __) => _switchRow(
                Icons.dark_mode_outlined,
                'Mode sombre',
                ThemeNotifier.instance.isDark,
                (v) => ThemeNotifier.instance.toggleDark(v),
                cs,
              ),
            ),
            const Divider(height: 20),
            // Notifications push
            _switchRow(
              Icons.notifications_outlined,
              'Notifications push',
              _notifEnabled,
              (v) async {
                setState(() => _notifEnabled = v);
                final prefs = await SharedPreferences.getInstance();
                await prefs.setBool('notif_enabled', v);
              },
              cs,
            ),
            const Divider(height: 20),
            _actionTile(
              icon:  Icons.lock_outline,
              label: 'Changer le mot de passe',
              onTap: () => _showChangePassword(context),
              cs:    cs,
            ),
          ]),

          const SizedBox(height: 12),

          // ── Déconnexion ──────────────────────────────────────────────────────
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _confirmLogout(context),
              icon:  const Icon(Icons.logout, color: AppTheme.error),
              label: const Text('Se déconnecter', style: TextStyle(color: AppTheme.error)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppTheme.error),
                minimumSize: const Size(double.infinity, 52),
              ),
            ),
          ),

          const SizedBox(height: 24),
          Text(
            'BlancBleu Driver v1.0.0',
            style: TextStyle(fontSize: 11, color: cs.onSurface.withOpacity(0.35)),
          ),
        ]),
      ),
    );
  }

  // ── Stats widget ─────────────────────────────────────────────────────────────

  Widget _buildStats(ColorScheme cs) {
    if (_loadingStats) {
      return _card(cs, [
        const SizedBox(height: 12),
        const Center(child: CircularProgressIndicator()),
        const SizedBox(height: 12),
      ]);
    }
    final transports = ((_stats?['transports'] ?? _stats?['count'] ?? 0) as num).toInt();
    final km         = ((_stats?['km'] ?? _stats?['totalKm'] ?? 0) as num).toDouble();
    return _card(cs, [
      IntrinsicHeight(
        child: Row(children: [
          Expanded(child: _statCell(transports.toString(), 'Transports', Icons.route, cs)),
          VerticalDivider(width: 1, color: cs.outlineVariant),
          Expanded(child: _statCell('${km.toStringAsFixed(0)} km', 'Km totaux', Icons.speed, cs)),
        ]),
      ),
    ]);
  }

  Widget _statCell(String value, String label, IconData icon, ColorScheme cs) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 20, color: AppTheme.primary),
        const SizedBox(height: 6),
        Text(value,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: cs.onSurface)),
        const SizedBox(height: 2),
        Text(label,
          style: const TextStyle(fontSize: 11, color: AppTheme.secondary)),
      ]),
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  String _roleLabel(String role) {
    switch (role.toLowerCase()) {
      case 'ambulancier': return 'Ambulancier';
      case 'driver':      return 'Chauffeur';
      default:            return role.isNotEmpty ? role : 'Chauffeur';
    }
  }

  Widget _statusBadge(ShiftState state) {
    final isActive = state is ShiftActive;
    final color    = isActive ? const Color(0xFF2563EB) : AppTheme.success;
    final label    = isActive ? 'En shift' : (widget.user['statut'] as String? ?? 'Disponible');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
      ]),
    );
  }

  Widget _sectionTitle(String title, ColorScheme cs) => Padding(
    padding: const EdgeInsets.only(bottom: 8, left: 2),
    child: Align(
      alignment: Alignment.centerLeft,
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: cs.onSurface.withOpacity(0.45),
        ),
      ),
    ),
  );

  Widget _card(ColorScheme cs, List<Widget> children) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    decoration: BoxDecoration(
      color: cs.surface,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: cs.outlineVariant.withOpacity(0.5)),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
  );

  Widget _infoRow(IconData icon, String text, ColorScheme cs) => Row(children: [
    Icon(icon, size: 18, color: AppTheme.secondary),
    const SizedBox(width: 10),
    Expanded(child: Text(text, style: TextStyle(fontSize: 14, color: cs.onSurface))),
  ]);

  Widget _docRow(String label, String type, ColorScheme cs) => Row(children: [
    const Icon(Icons.description_outlined, size: 18, color: AppTheme.secondary),
    const SizedBox(width: 10),
    Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: cs.onSurface))),
    const SizedBox(width: 6),
    _smallBtn('Voir', () {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Fonctionnalité bientôt disponible')),
      );
    }),
    const SizedBox(width: 6),
    _smallBtn('Mettre à jour', () => _uploadDocument(type), filled: true),
  ]);

  Widget _smallBtn(String label, VoidCallback onTap, {bool filled = false}) =>
    GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color:  filled ? AppTheme.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppTheme.primary),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: filled ? Colors.white : AppTheme.primary,
          ),
        ),
      ),
    );

  Widget _switchRow(IconData icon, String label, bool value,
      ValueChanged<bool> onChanged, ColorScheme cs) =>
    Row(children: [
      Icon(icon, size: 20, color: AppTheme.primary),
      const SizedBox(width: 12),
      Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: cs.onSurface))),
      Switch(value: value, onChanged: onChanged, activeColor: AppTheme.primary),
    ]);

  Widget _actionTile({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    required ColorScheme cs,
  }) =>
    InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(children: [
          Icon(icon, size: 20, color: AppTheme.primary),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: cs.onSurface))),
          Icon(Icons.chevron_right, size: 18, color: cs.onSurface.withOpacity(0.35)),
        ]),
      ),
    );

  // ── Dialogs ──────────────────────────────────────────────────────────────────

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Se déconnecter ?'),
        content: const Text('Votre session sera fermée et les données locales effacées.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await LocalDatabase.instance.markMessagesRead();
              if (context.mounted) context.read<AuthCubit>().logout();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.error,
              minimumSize: const Size(0, 0),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            ),
            child: const Text('Déconnecter'),
          ),
        ],
      ),
    );
  }

  void _showChangePassword(BuildContext context) {
    final currentCtrl = TextEditingController();
    final newCtrl     = TextEditingController();
    bool saving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
            padding: EdgeInsets.fromLTRB(24, 24, 24,
                MediaQuery.of(ctx).viewInsets.bottom + 32),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('Changer le mot de passe',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 20),
              TextField(
                controller: currentCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Mot de passe actuel'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: newCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Nouveau mot de passe'),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: saving ? null : () async {
                  setSt(() => saving = true);
                  try {
                    await ApiClient.instance.changePassword(
                      currentCtrl.text, newCtrl.text);
                    if (ctx.mounted) {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Mot de passe modifié ✓'),
                        backgroundColor: AppTheme.success,
                      ));
                    }
                  } catch (e) {
                    setSt(() => saving = false);
                    if (ctx.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text('Erreur: $e'),
                        backgroundColor: AppTheme.error,
                      ));
                    }
                  }
                },
                child: saving
                    ? const Text('Enregistrement...')
                    : const Text('Confirmer'),
              ),
            ]),
          ),
      ),
    );
  }
}
