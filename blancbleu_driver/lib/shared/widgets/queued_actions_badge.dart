/// Badge "X actions en attente" affiché quand l'ActionQueue offline a
/// du retard. À utiliser dans l'AppBar des écrans principaux (home, shift,
/// transport detail).
///
/// Comportement :
///   - 0 action → widget caché (SizedBox.shrink).
///   - 1+ actions → chip orange "N en attente" (+ icône wifi-off si offline).
library;

import 'package:flutter/material.dart';

import '../../core/offline/action_queue.dart';
import '../theme/app_theme.dart';

class QueuedActionsBadge extends StatelessWidget {
  const QueuedActionsBadge({super.key, this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ActionQueue.instance,
      builder: (ctx, _) {
        final count = ActionQueue.instance.pendingCount;
        if (count == 0) return const SizedBox.shrink();
        final offline = !ActionQueue.instance.isOnline;
        final color = offline ? Colors.red.shade700 : AppTheme.warning;

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: color, width: 1),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    offline ? Icons.wifi_off : Icons.cloud_upload,
                    size: 14,
                    color: color,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '$count en attente',
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
