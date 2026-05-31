import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import 'package:shimmer/shimmer.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../cubit/tournee_cubit.dart';
import '../widgets/transport_card.dart';
import '../../shift/cubit/shift_cubit.dart';
import '../../shift/screens/shift_screen.dart';
import '../../chat/screens/chat_screen.dart';
import '../../profile/screens/profile_screen.dart';
import '../../../core/network/api_client.dart';
import '../../../core/utils/constants.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../../shared/widgets/queued_actions_badge.dart';

class HomeScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  const HomeScreen({super.key, required this.user});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  DateTime _selectedDate = DateTime.now();
  int _navIndex    = 0;
  int _notifUnread = 0;
  int _msgUnread   = 0;          // badge rouge sur l'onglet Messages

  // Socket.IO for real-time events (main isolate)
  sio.Socket? _socket;

  // Bannière in-app pour les messages (overlay slide-in depuis le haut)
  OverlayEntry? _msgBanner;

  // Pulsing animation for the "available" indicator
  late final AnimationController _pulseCtrl;
  late final Animation<double>   _pulseAnim;

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();

    context.read<TourneeCubit>().load(date: _selectedDate);
    context.read<ShiftCubit>().checkActive();
    _fetchUnreadNotifications();
    _connectSocket();

    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
    _pulseAnim = CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _msgBanner?.remove();
    _socket?.disconnect();
    _socket?.dispose();
    super.dispose();
  }

  // ── Socket ──────────────────────────────────────────────────────────────────

  Future<void> _connectSocket() async {
    const storage = FlutterSecureStorage();
    final token = await storage.read(key: AppConstants.tokenKey);

    _socket = sio.io(
      AppConstants.wsUrl,
      sio.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token ?? ''})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(3000)
          .build(),
    );

    _socket!.on('transport:assigned', (raw) {
      if (!mounted) return;
      final data = Map<String, dynamic>.from(raw as Map? ?? {});

      // Only handle if assigned to the current driver
      final targetId = data['driverId']?.toString()
          ?? data['chauffeurId']?.toString()
          ?? (data['chauffeur'] is Map ? data['chauffeur']['_id']?.toString() : data['chauffeur']?.toString());
      final myId = widget.user['_id']?.toString() ?? widget.user['id']?.toString();
      if (targetId != null && targetId != myId) return;

      // Inject transport into cubit
      context.read<TourneeCubit>().addTransport(data);

      // In-app notification SnackBar
      final patient    = data['patient'] as Map? ?? {};
      final patientNom = [patient['prenom'], patient['nom']]
          .where((s) => s != null && s.toString().isNotEmpty)
          .join(' ');
      final heureRaw = data['heureRDV']?.toString() ?? '';
      final heure    = heureRaw.length >= 5 ? heureRaw.substring(0, 5) : heureRaw;
      final label    = [
        if (patientNom.isNotEmpty) patientNom,
        if (heure.isNotEmpty) 'à $heure',
      ].join(' ');

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Row(children: [
          const Icon(Icons.local_shipping, color: Colors.white, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Nouvelle mission assignée${label.isNotEmpty ? ' — $label' : ''}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ]),
        backgroundColor: AppTheme.success,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      ));
    });

    _socket!.on('message:dispatcher', (raw) {
      if (!mounted) return;
      final data    = Map<String, dynamic>.from(raw as Map? ?? {});
      final text    = data['text'] as String? ?? '';
      final fromNom = data['fromNom'] as String? ?? 'Dispatcher';
      if (_navIndex != 1) {
        setState(() => _msgUnread++);
        _showMessageBanner(fromNom, text);
      }
    });

    _socket!.connect();
  }

  void _showMessageBanner(String nom, String text) {
    _msgBanner?.remove();
    _msgBanner = null;

    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _MessageBanner(
        nom: nom,
        text: text,
        onTap: () {
          entry.remove();
          _msgBanner = null;
          if (mounted) setState(() { _navIndex = 1; _msgUnread = 0; });
        },
        onDismiss: () {
          if (_msgBanner == entry) {
            entry.remove();
            _msgBanner = null;
          }
        },
      ),
    );
    _msgBanner = entry;
    Overlay.of(context).insert(entry);
  }

  // ── Notifications ────────────────────────────────────────────────────────────

  Future<void> _fetchUnreadNotifications() async {
    try {
      final res = await ApiClient.instance.getNotificationsUnreadCount();
      if (mounted) setState(() => _notifUnread = res);
    } catch (_) {}
  }

  Future<void> _showNotificationsSheet() async {
    final notifs = await ApiClient.instance.getNotifications();
    if (!mounted) return;
    if (notifs.isNotEmpty) setState(() => _notifUnread = 0);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        minChildSize: 0.3,
        builder: (ctx, ctrl) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(children: [
            const SizedBox(height: 8),
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 12),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Notifications', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              ),
            ),
            const Divider(height: 20),
            Expanded(
              child: notifs.isEmpty
                  ? const Center(child: Text('Aucune notification', style: TextStyle(color: Colors.grey)))
                  : ListView.separated(
                      controller: ctrl,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: notifs.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final n      = notifs[i];
                        final isRead = n['read'] as bool? ?? true;
                        return GestureDetector(
                          onTap: () {
                            if (!isRead) {
                              ApiClient.instance.markNotificationRead(n['_id'] as String? ?? '');
                            }
                          },
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isRead ? const Color(0xFFF9FAFB) : const Color(0xFFEFF6FF),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isRead
                                    ? const Color(0xFFF0F0F0)
                                    : AppTheme.primary.withOpacity(0.3),
                              ),
                            ),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Container(
                                width: 36, height: 36,
                                decoration: BoxDecoration(
                                  color: AppTheme.primary.withOpacity(0.1),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.notifications_outlined, size: 18, color: AppTheme.primary),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(
                                    n['title'] as String? ?? '',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: isRead ? FontWeight.w500 : FontWeight.w700,
                                    ),
                                  ),
                                  if ((n['message'] as String?)?.isNotEmpty ?? false) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      n['message'] as String,
                                      style: const TextStyle(fontSize: 11, color: Colors.grey),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ]),
                              ),
                              if (!isRead)
                                Container(
                                  width: 8, height: 8,
                                  margin: const EdgeInsets.only(top: 4),
                                  decoration: const BoxDecoration(color: AppTheme.primary, shape: BoxShape.circle),
                                ),
                            ]),
                          ),
                        );
                      },
                    ),
            ),
          ]),
        ),
      ),
    );
  }

  // ── Date navigation ──────────────────────────────────────────────────────────

  void _changeDate(int delta) {
    final next = _selectedDate.add(Duration(days: delta));
    final now  = DateTime.now();
    final max  = now.add(const Duration(days: 7));
    final min  = now.subtract(const Duration(days: 30));
    if (next.isBefore(min) || next.isAfter(max)) return;
    setState(() => _selectedDate = next);
    context.read<TourneeCubit>().load(date: next);
  }

  void _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now().add(const Duration(days: 7)),
    );
    if (picked != null && mounted) {
      setState(() => _selectedDate = picked);
      context.read<TourneeCubit>().load(date: picked);
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: IndexedStack(
        index: _navIndex,
        children: [
          _buildTournee(),
          const ChatScreen(),
          ShiftScreen(user: widget.user),
          ProfileScreen(user: widget.user),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected: (i) {
          setState(() {
            _navIndex = i;
            if (i == 1) {
              _msgUnread = 0;
              _msgBanner?.remove();
              _msgBanner = null;
            }
          });
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.route_outlined), selectedIcon: Icon(Icons.route), label: 'Tournée'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: _msgUnread > 0,
              label: Text(_msgUnread > 9 ? '9+' : '$_msgUnread'),
              child: const Icon(Icons.chat_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: _msgUnread > 0,
              label: Text(_msgUnread > 9 ? '9+' : '$_msgUnread'),
              child: const Icon(Icons.chat),
            ),
            label: 'Messages',
          ),
          const NavigationDestination(icon: Icon(Icons.badge_outlined),  selectedIcon: Icon(Icons.badge),  label: 'Shift'),
          const NavigationDestination(icon: Icon(Icons.person_outlined), selectedIcon: Icon(Icons.person), label: 'Profil'),
        ],
      ),
    );
  }

  Widget _buildTournee() {
    return BlocListener<ShiftCubit, ShiftState>(
      listener: (context, state) {
        if (state is ShiftActive || state is ShiftEnded) {
          context.read<TourneeCubit>().load(date: _selectedDate);
        }
      },
      child: SafeArea(
        child: Column(children: [
          _buildHeader(),
          const OfflineBanner(),
          // Sprint M6 — badge actions en attente (queue offline). Auto-caché
          // si pendingCount == 0 ; affiche un chip orange/rouge sinon.
          const Align(
            alignment: Alignment.centerRight,
            child: Padding(
              padding: EdgeInsets.only(top: 4, right: 8),
              child: QueuedActionsBadge(),
            ),
          ),
          Expanded(
            child: BlocBuilder<TourneeCubit, TourneeState>(
              builder: (context, tourneeState) {
                return BlocBuilder<ShiftCubit, ShiftState>(
                  builder: (context, shiftState) {
                    if (tourneeState is TourneeLoading) return _buildShimmer();
                    if (tourneeState is TourneeError)   return _buildError(tourneeState.message);
                    if (tourneeState is TourneeLoaded)  return _buildList(tourneeState, shiftState);
                    return const SizedBox();
                  },
                );
              },
            ),
          ),
        ]),
      ),
    );
  }

  // ── Header ───────────────────────────────────────────────────────────────────

  Widget _buildHeader() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: AppTheme.primary, borderRadius: BorderRadius.circular(10)),
          child: const Icon(Icons.local_shipping, color: Colors.white, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              '${widget.user['prenom'] ?? ''} ${widget.user['nom'] ?? ''}'.trim(),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
            ),
            BlocBuilder<ShiftCubit, ShiftState>(
              builder: (context, state) {
                if (state is ShiftActive) {
                  final v     = state.shift['vehicleId'];
                  final plate = v is Map ? v['immatriculation']?.toString() ?? '' : '';
                  return Text(
                    plate.isNotEmpty ? 'Shift actif — $plate' : 'Shift actif',
                    style: const TextStyle(fontSize: 11, color: AppTheme.primary),
                  );
                }
                return const Text(
                  'Aucun shift actif',
                  style: TextStyle(fontSize: 11, color: AppTheme.secondary),
                );
              },
            ),
          ]),
        ),

        // Cloche notifications
        Stack(children: [
          IconButton(
            onPressed: _showNotificationsSheet,
            icon: const Icon(Icons.notifications_outlined, size: 22),
            color: AppTheme.secondary,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
          if (_notifUnread > 0)
            Positioned(
              top: 4, right: 4,
              child: Container(
                width: 16, height: 16,
                decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                alignment: Alignment.center,
                child: Text(
                  '$_notifUnread',
                  style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800),
                ),
              ),
            ),
        ]),
        const SizedBox(width: 4),

        // Sélecteur de date
        Row(children: [
          IconButton(
            onPressed: () => _changeDate(-1),
            icon: const Icon(Icons.chevron_left, size: 20),
            color: AppTheme.secondary,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
          ),
          GestureDetector(
            onTap: _pickDate,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: AppTheme.background,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                DateFormat('dd MMM', 'fr_FR').format(_selectedDate),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.onSurface),
              ),
            ),
          ),
          IconButton(
            onPressed: () => _changeDate(1),
            icon: const Icon(Icons.chevron_right, size: 20),
            color: AppTheme.secondary,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
          ),
        ]),
      ]),
    );
  }

  // ── Loading shimmer ──────────────────────────────────────────────────────────

  Widget _buildShimmer() {
    return Shimmer.fromColors(
      baseColor: Colors.grey.shade200,
      highlightColor: Colors.grey.shade50,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        itemCount: 4,
        itemBuilder: (_, __) => Container(
          margin: const EdgeInsets.only(bottom: 12),
          height: 110,
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
        ),
      ),
    );
  }

  // ── List / empty states ──────────────────────────────────────────────────────

  Widget _buildList(TourneeLoaded state, ShiftState shiftState) {
    if (state.transports.isEmpty) {
      final now     = DateTime.now();
      final isToday = _selectedDate.year  == now.year &&
                      _selectedDate.month == now.month &&
                      _selectedDate.day   == now.day;

      // No shift started yet — prompt to go to Shift tab
      if (isToday && shiftState is ShiftIdle) {
        return _buildNoShiftState();
      }

      // Shift active but no missions assigned yet — pulsing available card
      if (isToday && shiftState is ShiftActive) {
        return _buildAvailableState();
      }

      // Other day with no transports
      return _buildEmptyDayState();
    }

    return RefreshIndicator(
      color: AppTheme.primary,
      onRefresh: () => context.read<TourneeCubit>().load(date: _selectedDate, forceOnline: true),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
        itemCount: state.transports.length,
        itemBuilder: (_, i) => TransportCard(transport: state.transports[i]),
      ),
    );
  }

  /// Shown when shift is idle and no transports today.
  Widget _buildNoShiftState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 64, height: 64,
            decoration: BoxDecoration(color: const Color(0xFFFFF7ED), borderRadius: BorderRadius.circular(16)),
            child: const Icon(Icons.schedule, size: 32, color: Color(0xFFF97316)),
          ),
          const SizedBox(height: 16),
          const Text(
            'Démarrez votre shift',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
          ),
          const SizedBox(height: 8),
          const Text(
            'Vous devez démarrer votre shift pour voir vos transports assignés.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: AppTheme.secondary),
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () => setState(() => _navIndex = 2),
            icon: const Icon(Icons.badge_outlined),
            label: const Text('Aller au Shift'),
            style: ElevatedButton.styleFrom(minimumSize: const Size(180, 48)),
          ),
          const SizedBox(height: 80),
        ]),
      ),
    );
  }

  /// Shown when shift is active but no missions yet — pulsing GPS available card.
  Widget _buildAvailableState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          // Pulsing GPS indicator
          AnimatedBuilder(
            animation: _pulseAnim,
            builder: (_, child) {
              final scale = 1.0 + 0.25 * _pulseAnim.value;
              return Stack(alignment: Alignment.center, children: [
                // Outer glow ring
                Transform.scale(
                  scale: scale,
                  child: Container(
                    width: 80, height: 80,
                    decoration: BoxDecoration(
                      color: AppTheme.success.withOpacity(0.12 * (1 - _pulseAnim.value * 0.5)),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                // Middle ring
                Transform.scale(
                  scale: 0.85 + 0.12 * _pulseAnim.value,
                  child: Container(
                    width: 80, height: 80,
                    decoration: BoxDecoration(
                      color: AppTheme.success.withOpacity(0.18),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                // Core dot
                Container(
                  width: 52, height: 52,
                  decoration: const BoxDecoration(
                    color: Color(0xFFDCFCE7),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.location_on, color: AppTheme.success, size: 26),
                ),
              ]);
            },
          ),

          const SizedBox(height: 24),

          // "Vous êtes disponible" card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFFF0FDF4),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFBBF7D0)),
            ),
            child: Column(children: [
              const Text(
                'Vous êtes disponible',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF166534)),
              ),
              const SizedBox(height: 6),
              const Text(
                'En attente d\'une mission du dispatcher',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF15803D)),
              ),
              const SizedBox(height: 14),
              // GPS pulse label
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                AnimatedBuilder(
                  animation: _pulseAnim,
                  builder: (_, __) => Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                      color: AppTheme.success.withOpacity(0.5 + 0.5 * _pulseAnim.value),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                const Text(
                  'GPS actif — position transmise',
                  style: TextStyle(fontSize: 11, color: Color(0xFF16A34A), fontWeight: FontWeight.w600),
                ),
              ]),
            ]),
          ),

          const SizedBox(height: 80),
        ]),
      ),
    );
  }

  /// Shown for any non-today date with no transports.
  Widget _buildEmptyDayState() {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 64, height: 64,
          decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(16)),
          child: const Icon(Icons.route, size: 32, color: AppTheme.primary),
        ),
        const SizedBox(height: 16),
        const Text(
          'Aucun transport pour cette journée',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.onSurface),
        ),
        const SizedBox(height: 80),
      ]),
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────

  Widget _buildError(String msg) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.wifi_off, size: 48, color: AppTheme.secondary),
          const SizedBox(height: 16),
          Text(msg, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.secondary)),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => context.read<TourneeCubit>().load(date: _selectedDate),
            style: ElevatedButton.styleFrom(minimumSize: const Size(160, 48)),
            child: const Text('Réessayer'),
          ),
        ]),
      ),
    );
  }
}

// ── Bannière in-app message (slide depuis le haut) ───────────────────────────

class _MessageBanner extends StatefulWidget {
  final String nom;
  final String text;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  const _MessageBanner({
    required this.nom,
    required this.text,
    required this.onTap,
    required this.onDismiss,
  });

  @override
  State<_MessageBanner> createState() => _MessageBannerState();
}

class _MessageBannerState extends State<_MessageBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 350));
    _slide = Tween<Offset>(begin: const Offset(0, -1.5), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _ctrl.forward();
    Future.delayed(const Duration(seconds: 4), _dismiss);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _dismiss() {
    if (!mounted) return;
    _ctrl.reverse().then((_) => widget.onDismiss());
  }

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    return Positioned(
      top: topPad + 8,
      left: 12,
      right: 12,
      child: SlideTransition(
        position: _slide,
        child: Material(
          color: Colors.transparent,
          child: GestureDetector(
            onTap: widget.onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: const Border(
                  left: BorderSide(color: Color(0xFF1A56DB), width: 4),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.15),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(children: [
                Container(
                  width: 38, height: 38,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEFF6FF),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.support_agent, color: Color(0xFF1A56DB), size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.nom,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.text,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: _dismiss,
                  child: const Padding(
                    padding: EdgeInsets.only(left: 8),
                    child: Icon(Icons.close, size: 16, color: Color(0xFF94A3B8)),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
