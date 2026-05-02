import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../services/api_service.dart';
import 'home_screen.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  int _step = 1;

  // Étape 1
  final _prenomController    = TextEditingController();
  final _nomController       = TextEditingController();
  final _emailController     = TextEditingController();
  final _telephoneController = TextEditingController();
  final _passwordController  = TextEditingController();
  final _confirmController   = TextEditingController();

  // Étape 2
  String _mobilite = 'ASSIS';
  final _adresseController     = TextEditingController();
  final _medecinController     = TextEditingController();
  final _urgenceNomController  = TextEditingController();
  final _urgenceTelController  = TextEditingController();

  bool _isLoading   = false;
  bool _obscurePwd  = true;
  bool _obscureConf = true;
  String? _errorMessage;

  static const _mobiliteOptions = [
    {'value': 'ASSIS',            'label': 'Je marche seul',    'icon': Icons.directions_walk},
    {'value': 'FAUTEUIL_ROULANT', 'label': 'Fauteuil roulant',  'icon': Icons.accessible},
    {'value': 'ALLONGE',          'label': 'Allongé / Civière', 'icon': Icons.airline_seat_flat},
  ];

  @override
  void dispose() {
    _prenomController.dispose();
    _nomController.dispose();
    _emailController.dispose();
    _telephoneController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    _adresseController.dispose();
    _medecinController.dispose();
    _urgenceNomController.dispose();
    _urgenceTelController.dispose();
    super.dispose();
  }

  bool _validateStep1() {
    if (_prenomController.text.trim().isEmpty) {
      setState(() => _errorMessage = 'Prénom requis.');
      return false;
    }
    if (_nomController.text.trim().isEmpty) {
      setState(() => _errorMessage = 'Nom requis.');
      return false;
    }
    if (_emailController.text.trim().isEmpty || !_emailController.text.contains('@')) {
      setState(() => _errorMessage = 'Adresse email invalide.');
      return false;
    }
    if (_passwordController.text.length < 8) {
      setState(() => _errorMessage = 'Mot de passe : 8 caractères minimum.');
      return false;
    }
    if (_passwordController.text != _confirmController.text) {
      setState(() => _errorMessage = 'Les mots de passe ne correspondent pas.');
      return false;
    }
    return true;
  }

  void _nextStep() {
    if (_validateStep1()) {
      setState(() { _step = 2; _errorMessage = null; });
    }
  }

  Future<void> _createAccount() async {
    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      await ApiService.register(
        prenom:    _prenomController.text.trim(),
        nom:       _nomController.text.trim(),
        email:     _emailController.text.trim(),
        password:  _passwordController.text,
        telephone: _telephoneController.text.trim(),
        mobilite:  _mobilite,
        adresse:   _adresseController.text.trim(),
        medecin:   _medecinController.text.trim(),
        contactUrgence: {
          'nom':       _urgenceNomController.text.trim(),
          'telephone': _urgenceTelController.text.trim(),
        },
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading    = false;
        _errorMessage = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  // ── Hero ──────────────────────────────────────────────────────────────────
  Widget _buildHero() {
    return SizedBox(
      height: 180,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFBFD7FF), Color(0xFFE8F0FE)],
              ),
            ),
          ),
          const Opacity(
            opacity: 0.12,
            child: Center(
              child: Icon(Icons.local_hospital_rounded, size: 160, color: AppTheme.primary),
            ),
          ),
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: Container(
              height: 80,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    AppTheme.background.withOpacity(0.95),
                    AppTheme.background,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: 40, left: 12,
            child: SafeArea(
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.white.withOpacity(0.7),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: AppTheme.primary),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Brand ─────────────────────────────────────────────────────────────────
  Widget _buildBrand() {
    return const Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('🚑', style: TextStyle(fontSize: 36)),
            SizedBox(width: 12),
            Flexible(
              child: Text(
                'Ambulances Blanc Bleu',
                style: TextStyle(
                  fontSize: 22, fontWeight: FontWeight.w700,
                  color: AppTheme.primary, letterSpacing: -0.5,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 8),
        Text(
          'TRANSPORT SANITAIRE NON URGENT',
          style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w600,
            color: AppTheme.secondary, letterSpacing: 2,
          ),
        ),
      ],
    );
  }

  // ── Barre de progression ──────────────────────────────────────────────────
  Widget _buildProgressBar() {
    return Row(
      children: [
        Expanded(
          child: Container(
            height: 6,
            decoration: BoxDecoration(
              color: AppTheme.primaryContainer,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            height: 6,
            decoration: BoxDecoration(
              color: _step == 2 ? AppTheme.primaryContainer : AppTheme.surfaceContainer,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        ),
      ],
    );
  }

  // ── Champ réutilisable ────────────────────────────────────────────────────
  Widget _buildField({
    required String label,
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool isPassword = false,
    bool isConfirm  = false,
    TextInputType keyboard = TextInputType.text,
    TextCapitalization capitalize = TextCapitalization.none,
  }) {
    final obscure = isPassword ? _obscurePwd : (isConfirm ? _obscureConf : false);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.onSurface),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          obscureText: obscure,
          keyboardType: keyboard,
          textCapitalization: capitalize,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: AppTheme.outlineVariant.withOpacity(0.8), fontSize: 14),
            suffixIcon: isPassword
              ? IconButton(
                  icon: Icon(
                    _obscurePwd ? Icons.lock_outline : Icons.lock_open_outlined,
                    color: AppTheme.outlineVariant,
                  ),
                  onPressed: () => setState(() => _obscurePwd = !_obscurePwd),
                )
              : isConfirm
              ? IconButton(
                  icon: Icon(
                    _obscureConf ? Icons.lock_outline : Icons.lock_open_outlined,
                    color: AppTheme.outlineVariant,
                  ),
                  onPressed: () => setState(() => _obscureConf = !_obscureConf),
                )
              : Icon(icon, color: AppTheme.outlineVariant),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppTheme.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppTheme.outlineVariant),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppTheme.primary, width: 2),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          ),
        ),
      ],
    );
  }

  // ── Message erreur ────────────────────────────────────────────────────────
  Widget _buildError() {
    return Container(
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 16),
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
            child: Text(_errorMessage!,
              style: const TextStyle(color: Color(0xFFEF4444), fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  // ── ÉTAPE 1 ───────────────────────────────────────────────────────────────
  Widget _buildStep1() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.outlineVariant.withOpacity(0.3)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Vos informations',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
          ),
          const SizedBox(height: 2),
          const Text('Étape 1 sur 2',
            style: TextStyle(fontSize: 13, color: AppTheme.secondary),
          ),
          const SizedBox(height: 20),

          // Prénom + Nom côte à côte
          Row(
            children: [
              Expanded(child: _buildField(
                label: 'Prénom', controller: _prenomController,
                hint: 'Marcel', icon: Icons.person_outline,
                capitalize: TextCapitalization.words,
              )),
              const SizedBox(width: 12),
              Expanded(child: _buildField(
                label: 'Nom', controller: _nomController,
                hint: 'DUBOIS', icon: Icons.badge_outlined,
                capitalize: TextCapitalization.characters,
              )),
            ],
          ),
          const SizedBox(height: 16),

          _buildField(
            label: 'Email', controller: _emailController,
            hint: 'exemple@email.com', icon: Icons.email_outlined,
            keyboard: TextInputType.emailAddress,
          ),
          const SizedBox(height: 16),

          _buildField(
            label: 'Téléphone', controller: _telephoneController,
            hint: 'Ex: 06 12 34 56 78', icon: Icons.phone_outlined,
            keyboard: TextInputType.phone,
          ),
          const SizedBox(height: 16),

          _buildField(
            label: 'Mot de passe', controller: _passwordController,
            hint: '••••••••', icon: Icons.lock_outline,
            isPassword: true,
          ),
          const SizedBox(height: 16),

          _buildField(
            label: 'Confirmer le mot de passe', controller: _confirmController,
            hint: '••••••••', icon: Icons.lock_outline,
            isConfirm: true,
          ),
          const SizedBox(height: 20),

          if (_errorMessage != null) _buildError(),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: _nextStep,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryContainer,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 4,
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Continuer', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  SizedBox(width: 8),
                  Icon(Icons.arrow_forward, size: 20),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(
                'Déjà un compte ? Se connecter',
                style: TextStyle(color: AppTheme.primary, fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── ÉTAPE 2 ───────────────────────────────────────────────────────────────
  Widget _buildStep2() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.outlineVariant.withOpacity(0.3)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Informations médicales',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
          ),
          const SizedBox(height: 2),
          const Text("Étape 2 sur 2 · Ces infos aident l'ambulancier",
            style: TextStyle(fontSize: 13, color: AppTheme.secondary),
          ),
          const SizedBox(height: 24),

          // Mobilité
          const Text('VOTRE MOBILITÉ',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.secondary, letterSpacing: 1.2),
          ),
          const SizedBox(height: 12),

          ..._mobiliteOptions.map((opt) {
            final selected = _mobilite == opt['value'];
            return GestureDetector(
              onTap: () => setState(() => _mobilite = opt['value'] as String),
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: selected ? const Color(0xFFEFF6FF) : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected ? AppTheme.primaryContainer : AppTheme.outlineVariant,
                    width: selected ? 2 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      opt['icon'] as IconData,
                      color: selected ? AppTheme.primaryContainer : AppTheme.secondary,
                      size: 22,
                    ),
                    const SizedBox(width: 12),
                    Text(
                      opt['label'] as String,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: selected ? AppTheme.primaryContainer : AppTheme.onSurface,
                      ),
                    ),
                    const Spacer(),
                    if (selected)
                      const Icon(Icons.check_circle, color: AppTheme.primaryContainer, size: 20),
                  ],
                ),
              ),
            );
          }),

          const SizedBox(height: 20),

          _buildField(
            label: 'Adresse domicile (optionnel)', controller: _adresseController,
            hint: '12 Rue de France, Nice', icon: Icons.home_outlined,
          ),
          const SizedBox(height: 16),

          _buildField(
            label: 'Médecin traitant (optionnel)', controller: _medecinController,
            hint: 'Dr. MARTIN', icon: Icons.medical_services_outlined,
          ),
          const SizedBox(height: 20),

          // Contact urgence
          const Text("CONTACT D'URGENCE (optionnel)",
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.secondary, letterSpacing: 1.2),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _buildField(
                label: 'Nom', controller: _urgenceNomController,
                hint: 'Marie Dubois', icon: Icons.person_outline,
              )),
              const SizedBox(width: 12),
              Expanded(child: _buildField(
                label: 'Téléphone', controller: _urgenceTelController,
                hint: '06 XX XX XX', icon: Icons.phone_outlined,
                keyboard: TextInputType.phone,
              )),
            ],
          ),

          const SizedBox(height: 20),

          if (_errorMessage != null) _buildError(),

          // Boutons Retour + Créer
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: OutlinedButton(
                    onPressed: () => setState(() { _step = 1; _errorMessage = null; }),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppTheme.outlineVariant),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.arrow_back, size: 18, color: AppTheme.secondary),
                        SizedBox(width: 6),
                        Text('Retour', style: TextStyle(color: AppTheme.secondary, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _createAccount,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryContainer,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: AppTheme.primaryContainer.withOpacity(0.6),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 4,
                    ),
                    child: _isLoading
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('Créer mon compte', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                            SizedBox(width: 8),
                            Icon(Icons.check, size: 18),
                          ],
                        ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  Widget _buildFooter() {
    return Transform.translate(
      offset: const Offset(0, -40),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            const Text(
              'Nice · Alpes-Maritimes 06',
              style: TextStyle(fontSize: 12, color: AppTheme.secondary, fontWeight: FontWeight.w600, letterSpacing: 1),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _dot(0.3), const SizedBox(width: 8),
                _dot(0.6), const SizedBox(width: 8),
                _dot(0.3),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _dot(double opacity) => Container(
    width: 6, height: 6,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: AppTheme.primary.withOpacity(opacity),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SingleChildScrollView(
        child: Column(
          children: [
            _buildHero(),
            Transform.translate(
              offset: const Offset(0, -60),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [
                    _buildBrand(),
                    const SizedBox(height: 28),
                    _buildProgressBar(),
                    const SizedBox(height: 20),
                    _step == 1 ? _buildStep1() : _buildStep2(),
                  ],
                ),
              ),
            ),
            _buildFooter(),
          ],
        ),
      ),
    );
  }
}
