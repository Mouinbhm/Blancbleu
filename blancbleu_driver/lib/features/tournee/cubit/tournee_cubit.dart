import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/sync_service.dart';
import '../../../core/storage/local_database.dart';

part 'tournee_state.dart';

class TourneeCubit extends Cubit<TourneeState> {
  TourneeCubit() : super(TourneeInitial());

  Future<void> load({DateTime? date, bool forceOnline = false}) async {
    emit(TourneeLoading());
    final dateStr = (date ?? DateTime.now()).toIso8601String().substring(0, 10);
    try {
      if (forceOnline) {
        await SyncService.instance.sync(date: dateStr);
      }
      final data = await ApiClient.instance.getTournee(dateStr);
      final transports = (data['transports'] as List? ?? []).cast<Map<String, dynamic>>();
      await LocalDatabase.instance.saveTransports(transports);
      emit(TourneeLoaded(transports: transports, date: dateStr));
    } catch (_) {
      // Fallback offline
      try {
        final cached = await LocalDatabase.instance.getTransportsForDate(date ?? DateTime.now());
        emit(TourneeLoaded(transports: cached, date: dateStr, isOffline: true));
      } catch (e) {
        emit(TourneeError(e.toString()));
      }
    }
  }

  void updateTransportStatus(String transportId, String newStatus) {
    if (state is! TourneeLoaded) return;
    final loaded = state as TourneeLoaded;
    final updated = loaded.transports.map((t) {
      if ((t['_id'] ?? t['id']) == transportId) {
        return {...t, 'statut': newStatus};
      }
      return t;
    }).toList();
    emit(loaded.copyWith(transports: updated));
  }

  /// Inserts a transport received via Socket.IO without reloading everything.
  void addTransport(Map<String, dynamic> transport) {
    final dateStr = DateTime.now().toIso8601String().substring(0, 10);
    if (state is! TourneeLoaded) {
      emit(TourneeLoaded(transports: [transport], date: dateStr));
      return;
    }
    final loaded = state as TourneeLoaded;
    final newId  = (transport['_id'] ?? transport['id'])?.toString();
    final exists = loaded.transports.any(
      (t) => (t['_id'] ?? t['id'])?.toString() == newId,
    );
    if (exists) return;
    emit(loaded.copyWith(transports: [...loaded.transports, transport]));
  }
}
