/// BlancBleu shared mobile core.
///
/// Re-exports :
///   - models     (typed freezed)
///   - errors     (sealed BbException)
///   - events     (socket event constants — mirror of server/sockets/events.js)
///   - network    (DioClient, TokenManager, SocketManagerBase, errorMapper)
///   - storage    (SecureStorageWrapper)
///   - push       (PushService — Firebase Cloud Messaging, M4)
///
/// Consumed by `blancbleu_driver/` and `blancbleu_patient/` as path dependency.
library bb_core;

// errors
export 'src/errors/exceptions.dart';

// events
export 'src/events/socket_events.dart';

// enums
export 'src/models/transport_status.dart';
export 'src/models/vehicle_type.dart';
export 'src/models/mobilite.dart';

// sub-models / shared
export 'src/models/populated_ref.dart';
export 'src/models/coordonnees.dart';
export 'src/models/adresse.dart';
export 'src/models/patient_info.dart';
export 'src/models/equipements.dart';
export 'src/models/ai_dispatch.dart';

// core models
export 'src/models/transport.dart';
export 'src/models/vehicle.dart';
export 'src/models/personnel.dart';
export 'src/models/patient_account.dart';
export 'src/models/shift.dart';
export 'src/models/facture.dart';
export 'src/models/prescription.dart';
export 'src/models/app_notification.dart';
export 'src/models/tracking_point.dart';

// utils
export 'src/utils/logger.dart';

// observability (M5)
export 'src/observability/sentry_init.dart';
export 'src/observability/sentry_dio_interceptor.dart';

// security (M5) — détection root/jailbreak non bloquante
export 'src/security/device_integrity.dart';

// storage + network
export 'src/storage/secure_storage_wrapper.dart';
export 'src/network/token_manager.dart';
export 'src/network/error_mapper.dart';
export 'src/network/dio_client.dart';
export 'src/network/socket_manager_base.dart';
export 'src/network/ssl_pinning.dart';

// push (M4)
export 'src/push/push_service.dart';
// Réexport pour que les apps n'aient pas à dépendre de firebase_messaging
// directement. Le handler background top-level DOIT être déclaré dans l'app
// elle-même (contrainte FCM) — d'où l'export de FirebaseMessaging pour que
// l'app puisse appeler onBackgroundMessage sans import direct.
export 'package:firebase_messaging/firebase_messaging.dart'
    show RemoteMessage, FirebaseMessaging;
