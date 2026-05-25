import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:dio/dio.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../core/storage/local_database.dart';
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
    // Android 8+ requires the notification channel to exist before the
    // foreground service posts its persistent notification to it.
    await FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(const AndroidNotificationChannel(
          'blancbleu_gps',
          'GPS Tracking',
          description: 'Suivi GPS actif en arrière-plan',
          importance: Importance.low,
          playSound: false,
          enableVibration: false,
        ));

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

  // ── Sprint M2 — Offline GPS flush ──────────────────────────────────────
  /// Vide la file `tracking_queue` (points GPS persistes pendant que le socket
  /// etait down) vers POST /api/v1/tracking/batch. Idempotent cote serveur.
  /// Appele a chaque (re)connexion du socket bg.
  static Future<void> _flushOfflineQueue({
    required String apiBase,
    required String token,
  }) async {
    try {
      final pending = await LocalDatabase.instance.getPendingTrackingPoints(limit: 200);
      if (pending.isEmpty) return;

      final batchPoints = pending.map((r) => {
        'lat':         r['lat'],
        'lng':         r['lng'],
        'speed':       r['speed'] ?? 0,
        'accuracy':    r['accuracy'],
        if (r['transport_id'] != null) 'transportId': r['transport_id'],
        'timestamp':   DateTime.fromMillisecondsSinceEpoch(
          (r['timestamp'] as int?) ?? DateTime.now().millisecondsSinceEpoch,
        ).toIso8601String(),
      }).toList();

      final dio = Dio(BaseOptions(
        baseUrl:        apiBase,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer $token',
        },
      ));
      final res = await dio.post(
        '/api/v1/tracking/batch',
        data: {'points': batchPoints},
        options: Options(validateStatus: (s) => s != null && s < 500),
      );

      if (res.statusCode == 200 || res.statusCode == 201) {
        final ids = pending.map((r) => r['id'] as int).toList();
        await LocalDatabase.instance.markTrackingPointsSynced(ids);
        // ignore: avoid_print
        print('[GpsService bg] offline flush OK : ${ids.length} points');
      } else {
        // ignore: avoid_print
        print('[GpsService bg] offline flush HTTP ${res.statusCode}');
      }
    } catch (e) {
      // ignore: avoid_print
      print('[GpsService bg] offline flush failed: $e');
    }
  }

  // ── Background isolate entry point ───────────────────────────────────────

  @pragma('vm:entry-point')
  static void _bgEntryPoint(ServiceInstance service) async {
    sio.Socket? socket;
    StreamSubscription<Position>? positionSub;
    DateTime? lastEmit;
    // Transport actif (Sprint M1) — inclus dans chaque emit driver:location
    // pour que le serveur route vers la room transport:{id} (suivi patient).
    String? activeTransportId;

    // setTransport : mise à jour du transport actif depuis le main isolate.
    service.on('setTransport').listen((data) {
      if (data == null) return;
      final id = data['transportId'] as String?;
      activeTransportId = (id != null && id.isNotEmpty) ? id : null;
    });

    service.on('track').listen((data) async {
      if (data == null) return;

      final wsUrl    = data['wsUrl']    as String? ?? AppConstants.wsUrl;
      final token    = data['token']    as String? ?? '';
      final apiBase  = data['apiBase']  as String? ?? AppConstants.baseUrl;
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

      // Sprint M2 — Offline GPS buffering : à la (re)connexion, flush la file
      // SQLite vers POST /tracking/batch (idempotent côté serveur).
      socket!.onConnect((_) {
        _flushOfflineQueue(apiBase: apiBase, token: token);
      });

      socket!.connect();

      // Start Geolocator position stream
      await positionSub?.cancel();
      positionSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 10, // metres — only fires if driver moved ≥10 m
        ),
      ).listen((pos) async {
        final now = DateTime.now();
        // Throttle: never emit more than once every 5 seconds
        if (lastEmit != null && now.difference(lastEmit!).inSeconds < 5) return;
        lastEmit = now;

        final payload = <String, dynamic>{
          'driverId':    driverId,
          'vehicleId':   vehicleId,
          'shiftId':     shiftId,
          'transportId': activeTransportId,
          'lat':         pos.latitude,
          'lng':         pos.longitude,
          'speed':       pos.speed,
          'timestamp':   now.toIso8601String(),
        };

        // Sprint M2 — Si le socket est UP, on emet directement. Sinon on
        // persiste le point dans SQLite (tracking_queue). Au prochain connect,
        // onConnect declenchera _flushOfflineQueue qui POST en batch.
        if (socket?.connected == true) {
          socket!.emit('driver:location', payload);
        } else {
          try {
            await LocalDatabase.instance.queueTrackingPoint(
              lat:         pos.latitude,
              lng:         pos.longitude,
              speed:       pos.speed,
              accuracy:    pos.accuracy,
              shiftId:     shiftId.isNotEmpty ? shiftId : null,
              transportId: activeTransportId,
            );
          } catch (e) {
            // ignore: avoid_print
            print('[GpsService bg] queue offline failed: $e');
          }
        }
      });
    });

    service.on('stop').listen((_) async {
      await positionSub?.cancel();
      socket?.disconnect();
      socket?.dispose();
      activeTransportId = null;
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
      'apiBase':   AppConstants.baseUrl, // Sprint M2 — pour le flush offline
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

  /// Sprint M1 — Met à jour le transport actif transmis dans chaque emit
  /// `driver:location` (clé `transportId`). Le serveur s'en sert pour router
  /// le GPS vers la room `transport:{id}` consommée par le suivi patient.
  ///
  /// Appeler [setActiveTransport(id)] quand le chauffeur entame un transport
  /// (passage en EN_ROUTE_TO_PICKUP), et [setActiveTransport(null)] à la fin
  /// (COMPLETED / CANCELLED / NO_SHOW).
  void setActiveTransport(String? transportId) {
    _bgService.invoke('setTransport', {'transportId': transportId});
    debugPrint('[GpsService] Active transport = $transportId');
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
