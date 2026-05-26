/// Base commune pour les SocketManager des deux apps.
///
/// Refactor de M2 où chaque app dupliquait connect + reconnect + reauth +
/// streams. Ici, on factorise :
///   - connect() lit le token via TokenManager
///   - onConnect/onError loggés
///   - reauthenticate() force disconnect + connect avec nouveau auth
///   - les apps fournissent l'URL et abonnent leurs events spécifiques via
///     `registerEvent(name, handler)` après connexion.
///
/// Les apps continuent d'exposer leurs propres Streams typés au-dessus
/// (TransportAssigned, MessageDispatcher, etc.) — cette classe reste agnostique.
library;

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import 'token_manager.dart';

class SocketManagerBase {
  final String wsUrl;
  final TokenManager tokens;
  final String tag; // pour les logs (ex. 'driver', 'patient')

  sio.Socket? _socket;
  sio.Socket? get socket => _socket;
  bool get isConnected => _socket?.connected == true;

  SocketManagerBase({
    required this.wsUrl,
    required this.tokens,
    this.tag = 'mobile',
  });

  /// Ouvre la connexion socket avec le token courant. No-op si déjà initialisé.
  /// Les apps appellent `registerEvent(name, handler)` après pour brancher
  /// leurs streams typés.
  Future<void> connect() async {
    if (_socket != null) {
      debugPrint('[SocketManager-$tag] connect() ignoré (déjà initialisé)');
      return;
    }
    final token = await tokens.getAccessToken();
    if (token == null || token.isEmpty) {
      debugPrint('[SocketManager-$tag] connect() ignoré (token absent)');
      return;
    }

    _socket = sio.io(
      wsUrl,
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

    _socket!.onConnect((_) => debugPrint('[SocketManager-$tag] connecté'));
    _socket!.onDisconnect((reason) =>
        debugPrint('[SocketManager-$tag] disconnect: $reason'));
    _socket!.onConnectError((err) =>
        debugPrint('[SocketManager-$tag] connect_error: $err'));
    _socket!.onError((err) => debugPrint('[SocketManager-$tag] error: $err'));

    // Les apps doivent appeler `registerEvent(...)` AVANT `_socket.connect()`
    // pour ne pas rater des events au handshake. On expose donc cette méthode
    // séparément et on laisse l'app contrôler le timing du connect via
    // `start()` ci-dessous.
  }

  /// Démarre la connexion effective (après que l'app a fait ses registerEvent).
  void start() {
    _socket?.connect();
  }

  /// Enregistre un handler pour un event. Doit être appelé entre `connect()`
  /// et `start()`.
  void registerEvent(String event, void Function(dynamic data) handler) {
    _socket?.on(event, handler);
  }

  Future<void> disconnect() async {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  /// Sprint M1 — Re-auth après refresh token. Met à jour `socket.auth` et
  /// force une reconnexion.
  Future<void> reauthenticate() async {
    final token = await tokens.getAccessToken();
    if (token == null || token.isEmpty) {
      await disconnect();
      return;
    }
    if (_socket == null) {
      await connect();
      start();
      return;
    }
    _socket!.auth = {'token': token};
    if (_socket!.connected) {
      _socket!.disconnect();
    }
    _socket!.connect();
    debugPrint('[SocketManager-$tag] reauthenticate — reconnexion');
  }
}
