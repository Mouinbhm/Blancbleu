import 'dart:convert';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';
import '../../../core/location/location_service.dart';
import '../../../services/gps_service.dart';

const _kShiftKey = 'active_shift_cache';

// ── States ─────────────────────────────────────────────────────────────────

abstract class ShiftState extends Equatable {
  const ShiftState();
  @override
  List<Object?> get props => [];
}

class ShiftIdle extends ShiftState {}
class ShiftLoading extends ShiftState {}

class ShiftActive extends ShiftState {
  final Map<String, dynamic> shift;
  const ShiftActive(this.shift);
  @override
  List<Object?> get props => [shift];
}

class ShiftEnded extends ShiftState {}

class ShiftError extends ShiftState {
  final String message;
  const ShiftError(this.message);
  @override
  List<Object?> get props => [message];
}

// ── Cubit ─────────────────────────────────────────────────────────────────

class ShiftCubit extends Cubit<ShiftState> {
  ShiftCubit() : super(ShiftIdle());

  Future<void> checkActive() async {
    // Restore from cache immediately so the UI shows the shift without waiting
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(_kShiftKey);
    if (cached != null) {
      try {
        final shift = Map<String, dynamic>.from(jsonDecode(cached) as Map);
        final shiftId   = (shift['_id'] ?? shift['id'] ?? '').toString();
        final vehicleId = _extractVehicleId(shift['vehicleId']);
        LocationService.instance.startTracking(shiftId);
        await GpsService.instance.startTracking(shiftId, vehicleId);
        emit(ShiftActive(shift));
      } catch (_) {}
    } else {
      emit(ShiftLoading());
    }

    // Verify with server — always do this even if cache restored
    try {
      final shift = await ApiClient.instance.getActiveShift();
      if (shift != null) {
        await prefs.setString(_kShiftKey, jsonEncode(shift));
        final shiftId   = (shift['_id'] ?? shift['id'] ?? '').toString();
        final vehicleId = _extractVehicleId(shift['vehicleId']);
        LocationService.instance.startTracking(shiftId);
        await GpsService.instance.startTracking(shiftId, vehicleId);
        emit(ShiftActive(shift));
      } else {
        // Server says no active shift → clear cache
        await prefs.remove(_kShiftKey);
        emit(ShiftIdle());
      }
    } catch (_) {
      // Network/auth error: keep whatever state we have (cached or loading)
      // Don't reset to Idle — the shift may still be active on the server
      if (state is! ShiftActive) emit(ShiftIdle());
    }
  }

  Future<void> start(String vehicleId, Map<String, bool> checklist) async {
    emit(ShiftLoading());
    try {
      final data  = await ApiClient.instance.startShift(vehicleId, checklist);
      final shift = data['shift'] as Map<String, dynamic>;
      final shiftId = (shift['_id'] ?? shift['id'] ?? '').toString();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kShiftKey, jsonEncode(shift));
      LocationService.instance.startTracking(shiftId);
      await GpsService.instance.startTracking(shiftId, vehicleId);
      emit(ShiftActive(shift));
    } catch (e) {
      final msg = _extractMsg(e) ?? e.toString().replaceFirst('Exception: ', '');
      emit(ShiftError(msg));
    }
  }

  Future<void> end({int totalKm = 0, String notes = ''}) async {
    emit(ShiftLoading());
    try {
      await ApiClient.instance.endShift(totalKm: totalKm, notes: notes);
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kShiftKey);
      LocationService.instance.stopTracking();
      await GpsService.instance.stopTracking();
      emit(ShiftEnded());
    } catch (e) {
      final msg = _extractMsg(e) ?? e.toString().replaceFirst('Exception: ', '');
      emit(ShiftError(msg));
    }
  }

  static String? _extractMsg(dynamic e) {
    try {
      final data = (e as dynamic).response?.data;
      if (data is Map) return data['message']?.toString();
    } catch (_) {}
    return null;
  }

  // Extract vehicle ID regardless of whether vehicleId is a String or populated Map.
  static String _extractVehicleId(dynamic raw) {
    if (raw == null) return '';
    if (raw is Map) return (raw['_id'] ?? raw['id'] ?? '').toString();
    return raw.toString();
  }

  Future<void> addIncident(String description) async {
    try {
      await ApiClient.instance.addIncident(description);
    } catch (_) {}
  }
}
