/// Mappe les `DioException` vers les `BbException` typées.
///
/// Utilisé par le `DioClient` (intercepteur global) — les repositories n'ont
/// plus à reconnaître les codes HTTP : ils catchent par TYPE.
library;

import 'package:dio/dio.dart';

import '../errors/exceptions.dart';

BbException mapDioError(DioException e) {
  // Erreurs réseau pures (DNS, TCP, timeout) — pas de réponse HTTP du tout.
  switch (e.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.connectionError:
      return NetworkException(
        e.message ?? 'Connexion perdue. Vérifiez votre réseau.',
      );
    case DioExceptionType.cancel:
      return NetworkException('Requête annulée.');
    case DioExceptionType.badCertificate:
      return NetworkException('Certificat SSL invalide.');
    case DioExceptionType.unknown:
      // Continue : peut-être qu'on a quand même une réponse, sinon network.
      break;
    case DioExceptionType.badResponse:
      // Continue plus bas pour mapper par code.
      break;
  }

  final res = e.response;
  if (res == null) {
    return NetworkException(e.message ?? 'Erreur réseau inconnue.');
  }

  final code = res.statusCode ?? 0;
  final msg = _extractMessage(res.data) ?? 'Erreur HTTP $code';

  if (code == 401) return AuthException(msg);
  if (code == 403) return ForbiddenException(msg);
  if (code >= 400 && code < 500) {
    return DomainException(msg, statusCode: code);
  }
  if (code >= 500) {
    return ServerException(msg, statusCode: code);
  }
  return NetworkException(msg, statusCode: code);
}

String? _extractMessage(dynamic body) {
  if (body == null) return null;
  if (body is Map) {
    final m = body['message'] ?? body['error'] ?? body['detail'];
    return m?.toString();
  }
  if (body is String && body.isNotEmpty) return body;
  return null;
}
