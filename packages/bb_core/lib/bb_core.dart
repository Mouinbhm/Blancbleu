/// BlancBleu shared mobile core.
///
/// Re-exports :
///   - models     (typed freezed)
///   - errors     (sealed BbException)
///   - events     (socket event constants — mirror of server/sockets/events.js)
///   - network    (DioClient, TokenManager, SocketManagerBase — étape 3)
///   - storage    (SecureStorageWrapper — étape 3)
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
