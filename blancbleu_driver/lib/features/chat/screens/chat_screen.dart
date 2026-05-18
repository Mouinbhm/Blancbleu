import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../../../core/notifications/notification_service.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/utils/constants.dart';
import '../../../shared/theme/app_theme.dart';

// ── Message model ─────────────────────────────────────────────────────────────
enum _MsgStatus { sending, received, read }

class _Msg {
  final String id;
  final String text;
  final bool   isDriver;
  final DateTime time;
  _MsgStatus status;

  _Msg({
    required this.id,
    required this.text,
    required this.isDriver,
    required this.time,
    this.status = _MsgStatus.received,
  });
}

// ── Quick replies ─────────────────────────────────────────────────────────────
const _quickReplies = [
  'Je suis en route',
  'Arrivé',
  'Retard ~10 min',
  'Patient absent',
  'Mission terminée',
  'OK',
];

// ── Screen ────────────────────────────────────────────────────────────────────
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final _ctrl   = TextEditingController();
  final _scroll = ScrollController();
  final _msgs   = <_Msg>[];

  sio.Socket? _socket;
  bool _dispatcherOnline = false;
  bool _showQuickReplies = true;
  bool _appInForeground  = true;

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadLocal();
    _connectSocket();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _socket?.disconnect();
    _socket?.dispose();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appInForeground = state == AppLifecycleState.resumed;
  }

  // ── Load local messages ─────────────────────────────────────────────────────

  Future<void> _loadLocal() async {
    final rows = await LocalDatabase.instance.getMessages();
    final loaded = rows.reversed.map((m) => _Msg(
      id:       m['id'] as String? ?? UniqueKey().toString(),
      text:     m['text'] as String? ?? '',
      isDriver: (m['from'] as String?) == 'driver',
      time:     DateTime.tryParse(m['timestamp'] as String? ?? '') ?? DateTime.now(),
      status:   _MsgStatus.received,
    )).toList();
    if (mounted) setState(() => _msgs.insertAll(0, loaded));
    await LocalDatabase.instance.markMessagesRead();
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

    // Incoming message from dispatcher
    _socket!.on('message:dispatcher', (raw) {
      if (!mounted) return;
      final data = Map<String, dynamic>.from(raw as Map? ?? {});
      final msg  = _Msg(
        id:       DateTime.now().millisecondsSinceEpoch.toString(),
        text:     data['text'] as String? ?? '',
        isDriver: false,
        time:     DateTime.now(),
      );
      setState(() {
        _msgs.insert(0, msg);
        _showQuickReplies = true;
      });
      LocalDatabase.instance.saveMessage({
        'id': msg.id, 'text': msg.text, 'from': 'dispatcher',
        'timestamp': msg.time.toIso8601String(),
      });
      if (!_appInForeground) {
        NotificationService.showMessage(msg.text);
      }
      _scrollToTop();
    });

    // Read receipt — dispatcher has read the message
    _socket!.on('message:read', (raw) {
      if (!mounted) return;
      final data  = Map<String, dynamic>.from(raw as Map? ?? {});
      final msgId = data['messageId']?.toString();
      if (msgId == null) return;
      setState(() {
        for (final m in _msgs) {
          if (m.id == msgId) m.status = _MsgStatus.read;
        }
      });
    });

    // Dispatcher online/offline
    _socket!.on('dispatcher:status', (raw) {
      if (!mounted) return;
      final data   = Map<String, dynamic>.from(raw as Map? ?? {});
      final online = data['online'] as bool? ?? false;
      setState(() => _dispatcherOnline = online);
    });

    _socket!.connect();
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  void _send(String text) {
    text = text.trim();
    if (text.isEmpty) return;

    final msg = _Msg(
      id:       DateTime.now().millisecondsSinceEpoch.toString(),
      text:     text,
      isDriver: true,
      time:     DateTime.now(),
      status:   _MsgStatus.sending,
    );
    setState(() {
      _msgs.insert(0, msg);
      _showQuickReplies = false;
    });
    _ctrl.clear();

    _socket?.emit('message:driver', {'text': text});
    LocalDatabase.instance.saveMessage({
      'id': msg.id, 'text': text, 'from': 'driver',
      'timestamp': msg.time.toIso8601String(),
    });

    // Optimistic delivery confirmation after short delay
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) setState(() => msg.status = _MsgStatus.received);
    });

    _scrollToTop();
  }

  void _scrollToTop() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(0, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: _buildAppBar(cs),
      body: Column(children: [
        Expanded(child: _buildMessageList(cs)),
        _buildInputArea(cs),
      ]),
    );
  }

  AppBar _buildAppBar(ColorScheme cs) {
    return AppBar(
      automaticallyImplyLeading: false,
      title: Row(children: [
        const Text('Messagerie'),
        const Spacer(),
        Container(
          width: 8, height: 8,
          decoration: BoxDecoration(
            color: _dispatcherOnline ? const Color(0xFF22C55E) : Colors.grey,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          _dispatcherOnline ? 'Dispatcher en ligne' : 'Hors ligne',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: cs.onSurface.withOpacity(0.55),
          ),
        ),
      ]),
    );
  }

  Widget _buildMessageList(ColorScheme cs) {
    if (_msgs.isEmpty) {
      return Center(
        child: Text('Aucun message',
          style: TextStyle(color: cs.onSurface.withOpacity(0.4), fontSize: 14)),
      );
    }
    return ListView.builder(
      controller: _scroll,
      reverse: true,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      itemCount: _msgs.length,
      itemBuilder: (_, i) => _buildBubble(_msgs[i], cs),
    );
  }

  Widget _buildBubble(_Msg msg, ColorScheme cs) {
    final isDriver = msg.isDriver;
    return Align(
      alignment: isDriver ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isDriver ? AppTheme.primary : cs.surface,
          borderRadius: BorderRadius.only(
            topLeft:     const Radius.circular(16),
            topRight:    const Radius.circular(16),
            bottomLeft:  Radius.circular(isDriver ? 16 : 4),
            bottomRight: Radius.circular(isDriver ? 4  : 16),
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4, offset: const Offset(0, 1)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                msg.text,
                style: TextStyle(
                  fontSize: 14,
                  color: isDriver ? Colors.white : cs.onSurface,
                  height: 1.4,
                ),
              ),
            ),
            if (isDriver) ...[
              const SizedBox(height: 3),
              _buildStatusIcon(msg.status),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatusIcon(_MsgStatus status) {
    switch (status) {
      case _MsgStatus.sending:
        return const SizedBox(
          width: 10, height: 10,
          child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 1.5),
        );
      case _MsgStatus.received:
        return const Icon(Icons.done_all, size: 13, color: Colors.white70);
      case _MsgStatus.read:
        return const Icon(Icons.done_all, size: 13, color: Color(0xFF5EEAD4));
    }
  }

  Widget _buildInputArea(ColorScheme cs) {
    return Container(
      decoration: BoxDecoration(
        color: cs.surface,
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 8, offset: const Offset(0, -2)),
        ],
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // ── Quick replies ────────────────────────────────────────────────────
        if (_showQuickReplies)
          SizedBox(
            height: 46,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              itemCount: _quickReplies.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) => GestureDetector(
                onTap: () => _send(_quickReplies[i]),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppTheme.primary.withOpacity(0.35)),
                  ),
                  child: Text(
                    _quickReplies[i],
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.primary,
                    ),
                  ),
                ),
              ),
            ),
          ),

        // ── Text input ───────────────────────────────────────────────────────
        Padding(
          padding: EdgeInsets.fromLTRB(12, 8, 8,
              MediaQuery.of(context).viewInsets.bottom > 0 ? 8 : 16),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _ctrl,
                textInputAction: TextInputAction.send,
                minLines: 1,
                maxLines: 4,
                decoration: const InputDecoration(
                  hintText: 'Message...',
                  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  isDense: true,
                ),
                onSubmitted: _send,
              ),
            ),
            IconButton(
              onPressed: () => _send(_ctrl.text),
              icon: const Icon(Icons.send_rounded),
              color: AppTheme.primary,
            ),
          ]),
        ),
      ]),
    );
  }
}
