import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:shimmer/shimmer.dart';
import '../cubit/tournee_cubit.dart';
import '../widgets/transport_card.dart';
import '../../shift/cubit/shift_cubit.dart';
import '../../shift/screens/shift_screen.dart';
import '../../chat/screens/chat_screen.dart';
import '../../profile/screens/profile_screen.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/offline_banner.dart';

class HomeScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  const HomeScreen({super.key, required this.user});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  DateTime _selectedDate = DateTime.now();
  int _navIndex = 0;

  @override
  void initState() {
    super.initState();
    context.read<TourneeCubit>().load(date: _selectedDate);
    context.read<ShiftCubit>().checkActive();
  }

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
        onDestinationSelected: (i) => setState(() => _navIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.route_outlined),   selectedIcon: Icon(Icons.route),   label: 'Tournée'),
          NavigationDestination(icon: Icon(Icons.chat_outlined),    selectedIcon: Icon(Icons.chat),    label: 'Messages'),
          NavigationDestination(icon: Icon(Icons.badge_outlined),   selectedIcon: Icon(Icons.badge),   label: 'Shift'),
          NavigationDestination(icon: Icon(Icons.person_outlined),  selectedIcon: Icon(Icons.person),  label: 'Profil'),
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
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            '${widget.user['prenom'] ?? ''} ${widget.user['nom'] ?? ''}'.trim(),
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.onSurface),
          ),
          BlocBuilder<ShiftCubit, ShiftState>(
            builder: (context, state) {
              if (state is ShiftActive) {
                final v = state.shift['vehicleId'];
                final plate = v is Map ? v['immatriculation']?.toString() ?? '' : '';
                return Text(
                  plate.isNotEmpty ? 'Shift actif — $plate' : 'Shift actif',
                  style: const TextStyle(fontSize: 11, color: AppTheme.primary),
                );
              }
              return const Text('Aucun shift actif', style: TextStyle(fontSize: 11, color: AppTheme.secondary));
            },
          ),
        ])),
        // Date navigation arrows + label
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

  Widget _buildShimmer() {
    return Shimmer.fromColors(
      baseColor: Colors.grey.shade200,
      highlightColor: Colors.grey.shade50,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        itemCount: 4,
        itemBuilder: (_, __) => Container(
          margin: const EdgeInsets.only(bottom: 12),
          height: 100,
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
        ),
      ),
    );
  }

  Widget _buildList(TourneeLoaded state, ShiftState shiftState) {
    if (state.transports.isEmpty) {
      final now     = DateTime.now();
      final isToday = _selectedDate.year  == now.year &&
                      _selectedDate.month == now.month &&
                      _selectedDate.day   == now.day;

      if (isToday && shiftState is ShiftIdle) {
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
              const Text('Démarrez votre shift',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.onSurface)),
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
              ),
              const SizedBox(height: 80),
            ]),
          ),
        );
      }

      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 64, height: 64,
          decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(16)),
          child: const Icon(Icons.route, size: 32, color: AppTheme.primary),
        ),
        const SizedBox(height: 16),
        const Text('Aucun transport pour cette journée',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.onSurface)),
        const SizedBox(height: 80),
      ]));
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
            child: const Text('Réessayer'),
          ),
        ]),
      ),
    );
  }
}
