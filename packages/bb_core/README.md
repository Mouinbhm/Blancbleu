# bb_core

Shared mobile core for BlancBleu apps — typed models, network, errors, socket events.

Consumed by `blancbleu_driver/` and `blancbleu_patient/` via path dependency :

```yaml
dependencies:
  bb_core:
    path: ../packages/bb_core
```

## Layout

```
lib/
├── bb_core.dart          # barrel export
└── src/
    ├── models/           # freezed typed models (Transport, Vehicle, ...)
    ├── network/          # DioClient, TokenManager, SocketManagerBase
    ├── storage/          # SecureStorageWrapper
    ├── errors/           # sealed BbException + sub-types
    └── events/           # socket event constants (mirror of server/sockets/events.js)
```

## Codegen

```bash
cd packages/bb_core
dart run build_runner build --delete-conflicting-outputs
```

## Tests

```bash
cd packages/bb_core
flutter test
```
