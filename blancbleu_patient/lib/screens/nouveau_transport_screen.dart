import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../services/api_service.dart';
import 'transports_screen.dart';

class NouveauTransportScreen extends StatefulWidget {
  const NouveauTransportScreen({super.key});

  @override
  State<NouveauTransportScreen> createState() => _NouveauTransportScreenState();
}

class _NouveauTransportScreenState extends State<NouveauTransportScreen> {
  final _departController     = TextEditingController();
  final _destinationController = TextEditingController();
  DateTime? _selectedDate;
  TimeOfDay? _selectedTime;
  String?   _selectedMotif;
  bool      _allerRetour = false;
  bool      _isLoading   = false;
  String?   _errorMessage;

  static const _motifs = [
    'Dialyse',
    'Chimiotherapie',
    'Consultation specialiste',
    'Reeducation',
    'Autre',
  ];

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
    _preloadAdresse();
  }

  Future<void> _preloadAdresse() async {
    final patient = await ApiService.getCachedPatient();
    final adresse = (patient?['adresse'] as String?) ?? '';
    if (adresse.isNotEmpty && mounted) {
      _departController.text = adresse;
    } else if (mounted) {
      _departController.text = '';
    }
  }

  @override
  void dispose() {
    _departController.dispose();
    _destinationController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now    = DateTime.now();
    final picked = await showDatePicker(
      context:     context,
      initialDate: _selectedDate ?? now.add(const Duration(days: 1)),
      firstDate:   now,
      lastDate:    now.add(const Duration(days: 365)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary:   AppTheme.primaryContainer,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context:     context,
      initialTime: _selectedTime ?? const TimeOfDay(hour: 8, minute: 0),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary:   AppTheme.primaryContainer,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _selectedTime = picked);
  }

  String _formatDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  String _formatTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    final depart   = _departController.text.trim();
    final dest     = _destinationController.text.trim();

    if (depart.isEmpty) {
      setState(() => _errorMessage = 'Veuillez renseigner l\'adresse de depart.');
      return;
    }
    if (dest.isEmpty) {
      setState(() => _errorMessage = 'Veuillez renseigner la destination.');
      return;
    }
    if (_selectedDate == null) {
      setState(() => _errorMessage = 'Veuillez choisir une date.');
      return;
    }
    if (_selectedTime == null) {
      setState(() => _errorMessage = 'Veuillez choisir une heure.');
      return;
    }
    if (_selectedMotif == null) {
      setState(() => _errorMessage = 'Veuillez choisir un motif.');
      return;
    }

    final departDateTime = DateTime(
      _selectedDate!.year,
      _selectedDate!.month,
      _selectedDate!.day,
      _selectedTime!.hour,
      _selectedTime!.minute,
    );

    setState(() { _isLoading = true; _errorMessage = null; });

    try {
      await ApiService.createTransport({
        'heureDepart':   departDateTime.toIso8601String(),
        'adresseDepart': depart,
        'adresseArrivee': dest,
        'motif':          _selectedMotif,
        'allerRetour':    _allerRetour,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Demande de transport envoyee !'),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const TransportsScreen()),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading    = false;
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
    }
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
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFDBEAFE),
                border: Border.all(color: AppTheme.primaryContainer, width: 2),
              ),
              child: const Center(
                child: Icon(Icons.add_circle_outline, color: AppTheme.primary, size: 22),
              ),
            ),
            const SizedBox(width: 12),
            const Text(
              'BlancBleu',
              style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w900, fontSize: 19, letterSpacing: -0.5),
            ),
          ],
        ),
      ),
      actions: [
        IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.close, color: Colors.grey),
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
              final item   = _navItems[i];
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

  // ── Progress Bar ───────────────────────────────────────────────────────────
  Widget _buildProgress() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Nouveau transport',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.3, color: AppTheme.onSurface),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'Infos transport',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 7,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryContainer,
                    borderRadius: BorderRadius.circular(999),
                    boxShadow: [BoxShadow(color: AppTheme.primaryContainer.withOpacity(0.3), blurRadius: 4, offset: const Offset(0, 2))],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  height: 7,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryContainer.withOpacity(0.4),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  height: 7,
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceContainer,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text.toUpperCase(),
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
              color: AppTheme.secondary, letterSpacing: 1.2),
        ),
      );

  InputDecoration _fieldDeco({
    required IconData leadingIcon,
    Color iconColor = AppTheme.secondary,
    String? hint,
    Color fill = Colors.white,
    Widget? suffix,
  }) {
    return InputDecoration(
      hintText:   hint,
      hintStyle:  TextStyle(color: AppTheme.outlineVariant.withOpacity(0.9), fontSize: 15),
      prefixIcon: Icon(leadingIcon, color: iconColor, size: 20),
      suffixIcon: suffix,
      filled:     true,
      fillColor:  fill,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border:         OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.outlineVariant)),
      enabledBorder:  OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.outlineVariant)),
      focusedBorder:  OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.primary, width: 2)),
    );
  }

  Widget _tappableField({
    required IconData icon,
    required String   placeholder,
    required String?  value,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.outlineVariant),
        ),
        child: Row(
          children: [
            const SizedBox(width: 14),
            Icon(icon, size: 20, color: AppTheme.secondary),
            const SizedBox(width: 10),
            Text(
              value ?? placeholder,
              style: TextStyle(
                fontSize: 15,
                color: value != null ? AppTheme.onSurface : AppTheme.outlineVariant.withOpacity(0.9),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Form Card ──────────────────────────────────────────────────────────────
  Widget _buildFormCard() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _label('Adresse de depart'),
          TextField(
            controller: _departController,
            style: const TextStyle(fontSize: 15),
            decoration: _fieldDeco(leadingIcon: Icons.location_on, iconColor: AppTheme.primary, fill: const Color(0xFFF2F3FE)),
          ),

          const SizedBox(height: 24),

          _label('Destination'),
          TextField(
            controller: _destinationController,
            style: const TextStyle(fontSize: 15),
            decoration: _fieldDeco(
              leadingIcon: Icons.local_hospital,
              iconColor: const Color(0xFFBA1A1A),
              hint: 'Hopital Pasteur, Nice',
            ),
          ),

          const SizedBox(height: 24),

          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label('Date'),
                    _tappableField(
                      icon: Icons.calendar_today_outlined,
                      placeholder: 'JJ/MM/AAAA',
                      value: _selectedDate != null ? _formatDate(_selectedDate!) : null,
                      onTap: _pickDate,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label('Heure'),
                    _tappableField(
                      icon: Icons.schedule_outlined,
                      placeholder: 'HH:MM',
                      value: _selectedTime != null ? _formatTime(_selectedTime!) : null,
                      onTap: _pickTime,
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          _label('Motif du transport'),
          Container(
            height: 52,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.outlineVariant),
            ),
            child: Row(
              children: [
                const SizedBox(width: 14),
                const Icon(Icons.medical_information_outlined, size: 20, color: AppTheme.secondary),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _selectedMotif,
                      hint: Text(
                        'Selectionner un motif',
                        style: TextStyle(fontSize: 15, color: AppTheme.outlineVariant.withOpacity(0.9)),
                      ),
                      icon: const Icon(Icons.expand_more, color: AppTheme.secondary),
                      isExpanded: true,
                      style: const TextStyle(fontSize: 15, color: AppTheme.onSurface),
                      onChanged: (v) => setState(() => _selectedMotif = v),
                      items: _motifs.map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Aller-retour
          InkWell(
            onTap: () => setState(() => _allerRetour = !_allerRetour),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _allerRetour ? const Color(0xFFEFF6FF) : Colors.grey.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _allerRetour ? AppTheme.primaryContainer : AppTheme.outlineVariant,
                  width: _allerRetour ? 2 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.swap_horiz,
                    color: _allerRetour ? AppTheme.primaryContainer : AppTheme.secondary,
                    size: 22,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Aller-retour',
                      style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w500,
                        color: _allerRetour ? AppTheme.primaryContainer : AppTheme.onSurface,
                      ),
                    ),
                  ),
                  Checkbox(
                    value: _allerRetour,
                    onChanged: (v) => setState(() => _allerRetour = v ?? false),
                    activeColor: AppTheme.primaryContainer,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Info Card ──────────────────────────────────────────────────────────────
  Widget _buildInfoCard() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.primary.withOpacity(0.15)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_rounded, color: AppTheme.primaryContainer, size: 22),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Votre demande sera traitee par notre equipe. Vous recevrez une confirmation rapidement.',
              style: TextStyle(fontSize: 13, color: Color(0xFF00419E), height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: _buildAppBar(),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildProgress(),
            _buildFormCard(),
            const SizedBox(height: 20),
            _buildInfoCard(),
            const SizedBox(height: 16),

            // Error message
            if (_errorMessage != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: Color(0xFFEF4444), fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            const SizedBox(height: 12),

            // CTA
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryContainer,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: AppTheme.primaryContainer.withOpacity(0.6),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 4,
                    shadowColor: AppTheme.primaryContainer.withOpacity(0.4),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.send_rounded, size: 20),
                            SizedBox(width: 10),
                            Text('Envoyer la demande', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                          ],
                        ),
                ),
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }
}

class _NavItem {
  final IconData icon;
  final IconData filledIcon;
  final String   label;
  const _NavItem({required this.icon, required this.filledIcon, required this.label});
}
