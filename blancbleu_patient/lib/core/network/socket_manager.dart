/// Sprint M2 — SocketManager côté patient (foreground).
///
/// Avant : `tracking_screen.dart` instanciait directement `IO.io` à chaque
/// ouverture de l'écran (M1 ajoutait l'auth token au handshake). Pas de
/// reconnexion stable, pas de ré-auth après refresh token.
///
/// Maintenant : Singleton qui :
///   - Connecte/déconnecte explicitement sur appel de connect/disconnect.
///   - Reconnexion automatique avec backoff via socket.io_client.
///   - reauthenticate() : appelé par ApiService après un refresh token OK,
///     met à jour `socket.auth` et force socket.disconnect()+connect().
///   - joinTransport/leaveTransport : helpers pour les écrans qui suivent
///     un transport spécifique.
///   - Streams broadcasts pour transport:gps + transport:status.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../../services/api_service.dart';
// Sprint M3 — SocketEvents centralisé dans bb_core (anciennement miroir
// per-app dans ce dossier, supprimé).
import 'package:bb_core/bb_core.dart' show SocketEvents;

class SocketManager {
  SocketManager._();
  static final SocketManager instance = SocketManager._();

  sio.Socket? _socket;
  String? _joinedTransportId;

  // ── Streams ─────────────────────────────────────────────────────────────
  final _transportGps    = StreamController<Map<String, dynamic>>.broadcast();
  final _transportStatus = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get onTransportGps    => _transportGps.stream;
  Stream<Map<String, dynamic>> get onTransportStatus => _transportStatus.stream;

  bool get isConnected => _socket?.connected == true;

  String _serverUrl() {
    final base = dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:5000/api/patient';
    return base.replaceAll(RegExp(r'/api.*'), '');
  }

  // ── Connexion ───────────────────────────────────────────────────────────
  Future<void> connect() async {
    if (_socket != null) {
      debugPrint('[SocketManager-patient] connect() ignoré (déjà initialisé)');
      return;
    }
    final token = await ApiService.getToken();
    if (token == null || token.isEmpty) {
      debugPrint('[SocketManager-patient] connect() ignoré (token absent)');
      return;
    }

    _socket = sio.io(
      _serverUrl(),
      sio.OptionBuilder()
        .setTransports(['websocket', 'polling'])
        .setAuth({'token': token})
        .enableReconnection()
        .setReconnectionDelay(2000)
        .setReconnectionDelayMax(10000)
        .setReconnectionAttempts(999999)
        .disableAutoConnect()
        .build(),
    );

    _socket!.onConnect((_) {
      debugPrint('[SocketManager-patient] connecté');
      // Re-join la room du transport si on en suivait un avant la déconnexion
      if (_joinedTransportId != null) {
        _socket!.emit(SocketEvents.inJoinTransport, _joinedTransportId);
      }
    });
    _socket!.onConnectError((err) {
      debugPrint('[SocketManager-patient] connect_error: $err');
    });
    _socket!.onError((err) {
      debugPrint('[SocketManager-patient] error: $err');
    });

    _socket!.on(SocketEvents.transportGps,    (d) => _push(_transportGps, d));
    _socket!.on(SocketEvents.transportStatus, (d) => _push(_transportStatus, d));

    _socket!.connect();
  }

  void _push(StreamController<Map<String, dynamic>> ctrl, dynamic raw) {
    if (raw is Map) {
      ctrl.add(Map<String, dynamic>.from(raw));
    } else {
      ctrl.add({'_raw': raw?.toString() ?? ''});
    }
  }

  Future<void> disconnect() async {
    _joinedTransportId = null;
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  Future<void> reauthenticate() async {
    final token = await ApiService.getToken();
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
    debugPrint('[SocketManager-patient] reauthenticate — reconnexion');
  }

  // ── Helpers transport room ─────────────────────────────────────────────
  void joinTransport(String transportId) {
    _joinedTransportId = transportId;
    if (_socket?.connected == true) {
      _socket!.emit(SocketEvents.inJoinTransport, transportId);
    }
  }

  void leaveTransport(String transportId) {
    if (_socket?.connected == true) {
      _socket!.emit(SocketEvents.inLeaveTransport, transportId);
    }
    if (_joinedTransportId == transportId) _joinedTransportId = null;
  }
}
