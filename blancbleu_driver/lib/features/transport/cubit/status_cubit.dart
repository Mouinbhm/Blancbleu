import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/local_database.dart';
import '../../../services/gps_service.dart';

// Statuts pendant lesquels le transport est "actif" du point de vue du
// chauffeur : son GPS doit être routé vers la room transport:{id} pour que
// le patient le voie bouger en temps réel.
const _kActiveStatuses = {
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PATIENT_ON_BOARD',
  'ARRIVED_AT_DESTINATION',
  'WAITING_AT_DESTINATION',
  'RETURN_TO_BASE',
};

// Statuts terminaux : le transport n'est plus l'actif courant.
const _kTerminalStatuses = {
  'COMPLETED', 'CANCELLED', 'NO_SHOW', 'FAILED', 'BILLED', 'PAID',
};

// ── States ─────────────────────────────────────────────────────────────────

abstract class StatusState extends Equatable {
  const StatusState();
  @override
  List<Object?> get props => [];
}

class StatusIdle extends StatusState {}

class StatusUpdating extends StatusState {
  final String targetStatus;
  const StatusUpdating(this.targetStatus);
  @override
  List<Object?> get props => [targetStatus];
}

class StatusUpdated extends StatusState {
  final String status;
  const StatusUpdated(this.status);
  @override
  List<Object?> get props => [status];
}

class StatusOfflineQueued extends StatusState {
  final String status;
  const StatusOfflineQueued(this.status);
  @override
  List<Object?> get props => [status];
}

class StatusError extends StatusState {
  final String message;
  const StatusError(this.message);
  @override
  List<Object?> get props => [message];
}

// ── Cubit ─────────────────────────────────────────────────────────────────

class StatusCubit extends Cubit<StatusState> {
  final String transportId;
  String currentStatus;

  StatusCubit({required this.transportId, required this.currentStatus})
      : super(StatusIdle());

  Future<void> update(String newStatus, {String note = ''}) async {
    emit(StatusUpdating(newStatus));
    // Optimistic update
    currentStatus = newStatus;

    // Sprint M1 — bascule le transport actif côté GpsService pour que chaque
    // emit driver:location porte le bon transportId (le serveur route ensuite
    // vers la room transport:{id} pour le suivi patient).
    if (_kActiveStatuses.contains(newStatus)) {
      GpsService.instance.setActiveTransport(transportId);
    } else if (_kTerminalStatuses.contains(newStatus)) {
      GpsService.instance.setActiveTransport(null);
    }

    try {
      await ApiClient.instance.updateTransportStatus(transportId, newStatus, note: note);
      emit(StatusUpdated(newStatus));
    } catch (_) {
      // Offline — queue locally
      await LocalDatabase.instance.queueStatusUpdate(transportId, newStatus, note);
      emit(StatusOfflineQueued(newStatus));
    }
  }
}
