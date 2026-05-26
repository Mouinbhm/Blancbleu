/// Hiérarchie d'exceptions typées partagée entre les deux apps mobile.
///
/// Plutôt que des `Exception('message')` génériques, on lève des sous-types
/// précis pour que les Cubits/repositories puissent réagir différemment :
///   - `NetworkException`   → connexion / timeout → file offline + retry
///   - `AuthException`      → 401, refresh KO → logout
///   - `ForbiddenException` → 403 → permission, pas réessayable
///   - `DomainException`    → 400/409 métier → afficher message, pas de file
///   - `ServerException`    → 5xx → snackbar "indisponible", retry plus tard
library;

sealed class BbException implements Exception {
  final String message;
  final int? statusCode;
  const BbException(this.message, {this.statusCode});

  @override
  String toString() => '$runtimeType($message${statusCode != null ? ', code=$statusCode' : ''})';
}

/// Erreur réseau : socket fermé, DNS KO, timeout TCP, perte de connexion.
class NetworkException extends BbException {
  const NetworkException(super.message, {super.statusCode});
}

/// 401 : token absent, invalide, expiré et refresh KO.
class AuthException extends BbException {
  const AuthException(super.message, {super.statusCode = 401});
}

/// 403 : autorisé mais pas le droit (rôle, ownership, etc.). Non réessayable.
class ForbiddenException extends BbException {
  const ForbiddenException(super.message, {super.statusCode = 403});
}

/// 400/409/422 : règle métier rejetée par le serveur. Le retry ne sert à rien,
/// il faut afficher le message à l'utilisateur.
class DomainException extends BbException {
  const DomainException(super.message, {super.statusCode});
}

/// 5xx : erreur serveur. Retry plus tard envisageable, mais pas urgent.
class ServerException extends BbException {
  const ServerException(super.message, {super.statusCode});
}
