import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../core/utils/constants.dart';

/// Real-time GPS tracking via Socket.IO.
///
/// Architecture:
///   • Foreground: ShiftCubit calls [startTracking]/[stopTracking].
///   • [isTracking] ValueNotifier drives the UI badge in ShiftScreen.
///   • A [FlutterBackgroundService] foreground service keeps the process alive
///     when the app is minimised; the background isolate owns the Socket.IO
///     connection and Geolocator stream so tracking survives minimisation.
class GpsService {
  GpsService._();
  static final GpsService instance = GpsService._();

  static final _bgService = FlutterBackgroundService();

  /// Observed by ShiftScreen for the GPS status badge.
  final ValueNotifier<bool> isTracking = ValueNotifier(false);

  // ── Initialisation (called once in main.dart) ────────────────────────────

  static Future<void> init() async {
    await _bgService.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: _bgEntryPoint,
        autoStart: false,
        isForegroundMode: true,
        notificationChannelId: 'blancbleu_gps',
        initialNotificationTitle: 'BlancBleu Driver',
        initialNotificationContent: 'Tracking GPS actif',
        foregroundServiceNotificationId: 888,
        foregroundServiceTypes: [AndroidForegroundType.location],
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: _bgEntryPoint,
        onBackground: _iosBgHandler,
      ),
    );
  }

  @pragma('vm:entry-point')
  static bool _iosBgHandler(ServiceInstance service) => true;

  // ── Background isolate entry point ───────────────────────────────────────

  @pragma('vm:entry-point')
  static void _bgEntryPoint(ServiceInstance service) async {
    sio.Socket? socket;
    StreamSubscription<Position>? positionSub;
    DateTime? lastEmit;

    service.on('track').listen((data) async {
      if (data == null) return;

      final wsUrl    = data['wsUrl']    as String? ?? AppConstants.wsUrl;
      final token    = data['token']    as String? ?? '';
      final shiftId  = data['shiftId']  as String? ?? '';
      final vehicleId = data['vehicleId'] as String? ?? '';
      final driverId = data['driverId'] as String?;

      // Connect Socket.IO
      socket?.disconnect();
      socket?.dispose();
      socket = sio.io(
        wsUrl,
        sio.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(2000)
          .build(),
      );
      socket!.connect();

      // Start Geolocator position stream
      await positionSub?.cancel();
      positionSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 10, // metres — only fires if driver moved ≥10 m
        ),
      ).listen((pos) {
        final now = DateTime.now();
        // Throttle: never emit more than once every 5 seconds
        if (lastEmit != null && now.difference(lastEmit!).inSeconds < 5) return;
        lastEmit = now;

        socket?.emit('driver:location', {
          'driverId':  driverId,
          'vehicleId': vehicleId,
          'shiftId':   shiftId,
          'lat':       pos.latitude,
          'lng':       pos.longitude,
          'speed':     pos.speed,
          'timestamp': now.toIso8601String(),
        });
      });
    });

    service.on('stop').listen((_) async {
      await positionSub?.cancel();
      socket?.disconnect();
      socket?.dispose();
      service.stopSelf();
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /// Requests location permission, then starts the foreground service and
  /// begins emitting [driver:location] events via Socket.IO.
  Future<void> startTracking(String shiftId, String vehicleId) async {
    final granted = await _requestPermission();
    if (!granted) {
      debugPrint('[GpsService] Location permission denied — tracking disabled');
      return;
    }

    // Read auth token and driver ID from secure storage in the MAIN isolate
    // and pass them to the background isolate (avoids Keystore access issues).
    const storage = FlutterSecureStorage();
    final token    = await storage.read(key: AppConstants.tokenKey);
    final userJson = await storage.read(key: AppConstants.userKey);

    String? driverId;
    if (userJson != null) {
      try {
        final user = jsonDecode(userJson) as Map<String, dynamic>;
        driverId = user['_id']?.toString() ?? user['id']?.toString();
      } catch (_) {}
    }

    await _bgService.startService();
    _bgService.invoke('track', {
      'shiftId':   shiftId,
      'vehicleId': vehicleId,
      'driverId':  driverId,
      'token':     token ?? '',
      'wsUrl':     AppConstants.wsUrl,
    });

    isTracking.value = true;
    debugPrint('[GpsService] Tracking started — shift=$shiftId vehicle=$vehicleId');
  }

  /// Stops GPS emission and the foreground service.
  Future<void> stopTracking() async {
    _bgService.invoke('stop');
    isTracking.value = false;
    debugPrint('[GpsService] Tracking stopped');
  }

  // ── Permission helper ────────────────────────────────────────────────────

  Future<bool> _requestPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;

    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm != LocationPermission.denied &&
           perm != LocationPermission.deniedForever;
  }
}
