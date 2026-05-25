/// Sprint M2 — Foreground SocketManager pour l'app driver.
///
/// Architecture :
/// (voir corps de la classe ci-dessous)
library;

/// Sprint M2 — Foreground SocketManager pour l'app driver.
///
/// Architecture :
///   - Cette connexion vit dans le MAIN isolate. Elle est responsable de la
///     RÉCEPTION des events serveur→driver (transport:assigned, message:
///     dispatcher, shift:forced_end, etc.) qui étaient ignorés jusqu'à M1.
///   - Le `GpsService` (bg isolate) conserve sa connexion socket SÉPARÉE qui
///     n'ÉMET QUE `driver:location` et n'écoute aucun event serveur (pas de
///     duplication de réception).
///
/// Cycle de vie :
///   - connect() : appelé après AuthSuccess (main.dart), lit le token et
///     ouvre la connexion avec reconnect + backoff.
///   - disconnect() : appelé au logout, ferme proprement.
///   - reauthenticate() : appelé par ApiClient après un refresh token OK
///     (M1), met à jour le `auth.token` et force une reconnexion.
///
/// Reconnexion : socket.io_client gère reconnect + backoff exponentiel via
/// les options (`enableReconnection`, `setReconnectionDelayMax`).

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../utils/constants.dart';
import 'socket_events.dart';

class SocketManager {
  SocketManager._();
  static final SocketManager instance = SocketManager._();

  sio.Socket? _socket;
  final _storage = const FlutterSecureStorage();

  // ── Streams exposés au reste de l'app ───────────────────────────────────
  final _transportAssigned  = StreamController<Map<String, dynamic>>.broadcast();
  final _transportCancelled = StreamController<Map<String, dynamic>>.broadcast();
  final _transportStatus    = StreamController<Map<String, dynamic>>.broadcast();
  final _messageDispatcher  = StreamController<Map<String, dynamic>>.broadcast();
  final _shiftForcedEnd     = StreamController<Map<String, dynamic>>.broadcast();
  final _dispatcherStatus   = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get onTransportAssigned  => _transportAssigned.stream;
  Stream<Map<String, dynamic>> get onTransportCancelled => _transportCancelled.stream;
  Stream<Map<String, dynamic>> get onTransportStatus    => _transportStatus.stream;
  Stream<Map<String, dynamic>> get onMessageDispatcher  => _messageDispatcher.stream;
  Stream<Map<String, dynamic>> get onShiftForcedEnd     => _shiftForcedEnd.stream;
  Stream<Map<String, dynamic>> get onDispatcherStatus   => _dispatcherStatus.stream;

  bool get isConnected => _socket?.connected == true;

  // ── Connexion ───────────────────────────────────────────────────────────
  Future<void> connect() async {
    if (_socket != null) {
      debugPrint('[SocketManager] connect() ignoré (déjà initialisé)');
      return;
    }
    final token = await _storage.read(key: AppConstants.tokenKey);
    if (token == null || token.isEmpty) {
      debugPrint('[SocketManager] connect() ignoré (token absent)');
      return;
    }

    _socket = sio.io(
      AppConstants.wsUrl,
      sio.OptionBuilder()
        .setTransports(['websocket'])
        .setAuth({'token': token})
        .enableReconnection()
        .setReconnectionDelay(2000)
        .setReconnectionDelayMax(10000)
        .setReconnectionAttempts(999999) // infini — la qualité de réseau varie
        .disableAutoConnect()
        .build(),
    );

    _socket!.onConnect((_) {
      debugPrint('[SocketManager] connecté (foreground)');
    });
    _socket!.onDisconnect((reason) {
      debugPrint('[SocketManager] disconnect: $reason');
    });
    _socket!.onConnectError((err) {
      debugPrint('[SocketManager] connect_error: $err');
    });
    _socket!.onError((err) {
      debugPrint('[SocketManager] error: $err');
    });

    _socket!.on(SocketEvents.transportAssigned,  (d) => _push(_transportAssigned, d));
    _socket!.on(SocketEvents.transportCancelled, (d) => _push(_transportCancelled, d));
    _socket!.on(SocketEvents.transportStatus,    (d) => _push(_transportStatus, d));
    _socket!.on(SocketEvents.messageDispatcher,  (d) => _push(_messageDispatcher, d));
    _socket!.on(SocketEvents.shiftForcedEnd,     (d) => _push(_shiftForcedEnd, d));
    _socket!.on(SocketEvents.dispatcherStatus,   (d) => _push(_dispatcherStatus, d));

    _socket!.connect();
  }

  void _push(StreamController<Map<String, dynamic>> ctrl, dynamic raw) {
    if (raw is Map) {
      ctrl.add(Map<String, dynamic>.from(raw));
    } else {
      ctrl.add({'_raw': raw?.toString() ?? ''});
    }
  }

  // ── Disconnect ──────────────────────────────────────────────────────────
  Future<void> disconnect() async {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    debugPrint('[SocketManager] disconnect() — socket détruit');
  }

  // ── Re-auth après refresh token (M1) ────────────────────────────────────
  ///
  /// L'API client appelle cette méthode quand le refresh token a renouvelé
  /// l'access. On met à jour la valeur d'auth et on force une reconnexion
  /// pour que le serveur valide le nouveau token au handshake.
  Future<void> reauthenticate() async {
    final token = await _storage.read(key: AppConstants.tokenKey);
    if (token == null || token.isEmpty) {
      await disconnect();
      return;
    }
    if (_socket == null) {
      await connect();
      return;
    }
    _socket!.auth = {'token': token};
    if (_socket!.connected) {
      _socket!.disconnect();
    }
    _socket!.connect();
    debugPrint('[SocketManager] reauthenticate — reconnexion avec nouveau token');
  }
}
