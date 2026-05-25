import 'dart:convert';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/network/api_client.dart';
import '../../../core/utils/constants.dart';

part 'auth_state.dart';

class AuthCubit extends Cubit<AuthState> {
  final _storage = const FlutterSecureStorage();

  AuthCubit() : super(AuthInitial());

  Future<void> tryAutoLogin() async {
    final token = await _storage.read(key: AppConstants.tokenKey);
    final userJson = await _storage.read(key: AppConstants.userKey);
    if (token == null || userJson == null) {
      emit(AuthInitial());
      return;
    }
    final user = jsonDecode(userJson) as Map<String, dynamic>;

    // Sprint M1 — Valide la session via un appel léger authentifié plutôt
    // que de faire confiance au token stocké. Si le token est expiré,
    // l'interceptor du Dio tentera le refresh automatiquement (etape 2).
    // Si le refresh échoue, _forceLogout() vide le storage et déclenche
    // onUnauthorized → on tombera sur AuthInitial.
    try {
      // getActiveShift est légère et always-authenticated.
      await ApiClient.instance.getActiveShift();
      ApiClient.instance.resetSession();
      emit(AuthSuccess(user: user, token: token));
    } catch (_) {
      // Si le refresh a échoué l'interceptor a déjà clear le storage.
      // On vérifie : si le token a disparu → vraiment déconnecté.
      final stillThere = await _storage.read(key: AppConstants.tokenKey);
      if (stillThere == null) {
        emit(AuthInitial());
      } else {
        // Erreur réseau (pas 401) : on reste optimiste pour offline-first,
        // l'utilisateur retentera ses actions plus tard.
        emit(AuthSuccess(user: user, token: token));
      }
    }
  }

  Future<void> login(String email, String password) async {
    emit(AuthLoading());
    try {
      final data = await ApiClient.instance.login(email, password);
      final token        = data['token']        as String?;
      final refreshToken = data['refreshToken'] as String?;
      final user         = data['personnel']    as Map<String, dynamic>?;
      if (token == null || user == null) {
        emit(const AuthError('Réponse serveur invalide'));
        return;
      }
      await _storage.write(key: AppConstants.tokenKey, value: token);
      await _storage.write(key: AppConstants.userKey,  value: jsonEncode(user));
      if (refreshToken != null) {
        await _storage.write(key: AppConstants.refreshKey, value: refreshToken);
      }
      // Réarme l'interceptor (au cas où un logout silencieux aurait set le flag)
      ApiClient.instance.resetSession();
      emit(AuthSuccess(user: user, token: token));
    } on Exception catch (e) {
      emit(AuthError(e.toString().replaceFirst('Exception: ', '')));
    }
  }

  Future<void> logout() async {
    await _storage.delete(key: AppConstants.tokenKey);
    await _storage.delete(key: AppConstants.userKey);
    await _storage.delete(key: AppConstants.refreshKey);
    emit(AuthInitial());
  }
}
