/// BlancBleu shared mobile core.
///
/// Re-exports :
///   - models     (typed freezed)
///   - errors     (sealed BbException)
///   - events     (socket event constants — mirror of server/sockets/events.js)
///   - network    (DioClient, TokenManager, SocketManagerBase)
///   - storage    (SecureStorageWrapper)
///
/// Consumed by `blancbleu_driver/` and `blancbleu_patient/` as path dependency.
library bb_core;

// errors
export 'src/errors/exceptions.dart';

// events
export 'src/events/socket_events.dart';
