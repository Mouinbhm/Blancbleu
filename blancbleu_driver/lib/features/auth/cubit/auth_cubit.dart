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
    if (token != null && userJson != null) {
      final user = jsonDecode(userJson) as Map<String, dynamic>;
      emit(AuthSuccess(user: user, token: token));
    } else {
      emit(AuthInitial());
    }
  }

  Future<void> login(String email, String password) async {
    emit(AuthLoading());
    try {
      final data = await ApiClient.instance.login(email, password);
      final token = data['token']     as String?;
      final user  = data['personnel'] as Map<String, dynamic>?;
      if (token == null || user == null) {
        emit(const AuthError('Réponse serveur invalide'));
        return;
      }
      await _storage.write(key: AppConstants.tokenKey, value: token);
      await _storage.write(key: AppConstants.userKey,  value: jsonEncode(user));
      emit(AuthSuccess(user: user, token: token));
    } on Exception catch (e) {
      emit(AuthError(e.toString().replaceFirst('Exception: ', '')));
    }
  }

  Future<void> logout() async {
    await _storage.delete(key: AppConstants.tokenKey);
    await _storage.delete(key: AppConstants.userKey);
    emit(AuthInitial());
  }
}
