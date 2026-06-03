import 'dart:convert';
import 'dart:io';

import 'package:bb_core/bb_core.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/network/socket_manager.dart';
import '../main.dart' show BlancBleuApp;
import '../screens/login_screen.dart';

/// Sprint M3 — la plomberie HTTP (bearer + refresh single-flight + mapping des
/// erreurs en exceptions typées) vit désormais dans bb_core/DioClient. Ce
/// service ne garde que le wiring patient (base URL, clés, refresh path, socket
/// reauth, logout) et les méthodes de domaine.
///
/// Contrat public INCHANGÉ : les méthodes retournent les mêmes shapes et lèvent
/// toujours `Exception('<message serveur>')` pour les erreurs métier (les écrans
/// qui affichent `e.toString()` restent valides). SEULE l'expiration de session
/// passe d'un `Exception('SESSION_EXPIRED')` (string) à une `AuthException`
/// typée de bb_core.
class ApiService {
  // API_BASE_URL must be set in .env (see .env.example).
  // Fallback: Android emulator → 10.0.2.2, physical device → LAN IP, prod → https://
  static String get _base =>
      dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:5000/api/patient';

  static const _timeout    = Duration(seconds: 15);
  static const String _tokenKey   = 'bb_token';
  static const String _refreshKey = 'bb_refresh';
  static const String _patientKey = 'bb_patient';

  static final SecureStorageWrapper _secure = SecureStorageWrapper();

  static final TokenManager _tokens = TokenManager(
    storage:    _secure,
    accessKey:  _tokenKey,
    refreshKey: _refreshKey,
  );

  // Lazy (static final) : le DioClient n'est construit qu'au premier appel
  // réseau, donc dotenv est déjà chargé (main()) et les tests qui n'atteignent
  // pas le réseau ne le déclenchent pas.
  static final DioClient _client = DioClient(
    baseUrl:          _base,
    tokens:           _tokens,
    refreshPath:      '/refresh', // → POST $_base/refresh (inchangé)
    connectTimeout:   _timeout,
    receiveTimeout:   _timeout,
    onRefreshSuccess: () async => SocketManager.instance.reauthenticate(),
    onAuthFailed:     _onAuthFailed,
    forbiddenTriggersLogout: false, // patient : 403 = message, PAS de logout
    spkiSha256PinsBase64: const [],
  );

  static Dio get _dio => _client.dio;

  // ── Token / session ────────────────────────────────────────────────────────

  static Future<void> saveToken(String t) =>
      _tokens.saveTokens(access: t);

  static Future<String?> getToken() =>
      _tokens.getAccessToken();

  static Future<void> clearSession() async {
    await _tokens.clear(); // bb_token + bb_refresh
    await _secure.delete(_patientKey);
    // Sprint M5 — efface aussi le legacy SharedPreferences (cas d'utilisateur
    // qui upgrade depuis une version pre-M5 où le profil était stocké en clair).
    final p = await SharedPreferences.getInstance();
    p.remove(_patientKey);
  }

  /// Logout centralisé (DioClient.onAuthFailed) sur échec de refresh / 401 final.
  /// Purge la session puis navigue vers Login via le navigator global. Les
  /// écrans n'ont plus qu'à `catch (AuthException)` et s'arrêter.
  static Future<void> _onAuthFailed() async {
    await clearSession();
    final nav = BlancBleuApp.navigatorKey.currentState;
    nav?.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  /// Sprint M1 — Valide la session au démarrage.
  /// Tente un appel léger authentifié (GET /me) qui déclenche le refresh
  /// transparent si nécessaire. Si le refresh échoue → `AuthException` (la
  /// session est déjà purgée par onAuthFailed) → false. Erreur réseau → on
  /// garde la session optimiste (true), l'utilisateur retentera.
  static Future<bool> isLoggedIn() async {
    final token = await getToken();
    if (token == null) return false;
    try {
      await getMesDonnees(); // 401 → refresh transparent → si KO → AuthException
      return true;
    } on AuthException {
      return false;
    } catch (_) {
      return true;
    }
  }

  /// Sprint M5 — Profil patient = donnée de santé (mobilité, médecin,
  /// contact urgence). DOIT être chiffré au repos. Déplacé de
  /// SharedPreferences (clair) vers secure_storage (chiffré AES côté Android,
  /// Keychain côté iOS). Migration douce automatique au prochain getCachedPatient.
  static Future<void> savePatient(Map<String, dynamic> patient) async {
    await _secure.write(_patientKey, jsonEncode(patient));
  }

  static Future<Map<String, dynamic>?> getCachedPatient() async {
    // Sprint M5 — lecture secure storage en priorité.
    final s = await _secure.read(_patientKey);
    if (s != null) {
      try { return jsonDecode(s) as Map<String, dynamic>; }
      catch (_) { return null; }
    }

    // Migration douce : si un ancien profil est en SharedPreferences (clair),
    // on le déplace vers secure storage puis on efface l'ancien.
    final p = await SharedPreferences.getInstance();
    final legacy = p.getString(_patientKey);
    if (legacy != null) {
      try {
        final decoded = jsonDecode(legacy) as Map<String, dynamic>;
        await _secure.write(_patientKey, legacy);
        await p.remove(_patientKey);
        return decoded;
      } catch (_) {
        // Ancien JSON corrompu — on purge et on retourne null.
        await p.remove(_patientKey);
        return null;
      }
    }
    return null;
  }

  // ── Helper réseau ────────────────────────────────────────────────────────
  //
  // Exécute un appel Dio et reconvertit les erreurs vers le contrat historique :
  //   - AuthException (401 final / refresh KO) → rethrow tel quel (typé)
  //   - toute autre BbException (4xx/5xx/réseau/403) → Exception('<message>')
  // Ainsi les écrans qui affichent `e.toString().replaceFirst('Exception: ','')`
  // continuent d'afficher le message serveur exact, et seuls les écrans auth
  // catchent `AuthException`.
  static Future<Response<dynamic>> _send(
    Future<Response<dynamic>> Function() call,
  ) async {
    try {
      return await call();
    } on DioException catch (e) {
      final err = e.error;
      if (err is AuthException) throw err;
      if (err is BbException) throw Exception(err.message);
      throw Exception(e.message ?? 'Serveur inaccessible.');
    }
  }

  static Map<String, dynamic> _asMap(Response<dynamic> res) =>
      (res.data as Map).cast<String, dynamic>();

  // ── Auth ───────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _send(() => _dio.post(
      '$_base/login',
      data: {'email': email, 'password': password},
    ));
    final data = _asMap(res);
    await _tokens.saveTokens(
      access:  data['accessToken'] as String,
      refresh: data['refreshToken'] as String?,
    );
    await savePatient(data['patient'] as Map<String, dynamic>);
    return data;
  }

  static Future<Map<String, dynamic>> register({
    required String prenom,
    required String nom,
    required String email,
    required String password,
    String telephone       = '',
    String mobilite        = 'ASSIS',
    String adresse         = '',
    String medecin         = '',
    String? dateNaissance,
    Map<String, dynamic> contactUrgence = const {},
  }) async {
    final res = await _send(() => _dio.post(
      '$_base/register',
      data: {
        'prenom':         prenom,
        'nom':            nom.toUpperCase(),
        'email':          email.toLowerCase().trim(),
        'password':       password,
        'telephone':      telephone,
        'mobilite':       mobilite,
        'adresse':        adresse,
        'medecin':        medecin,
        if (dateNaissance != null) 'dateNaissance': dateNaissance,
        'contactUrgence': contactUrgence,
      },
    ));
    final data = _asMap(res);
    await _tokens.saveTokens(
      access:  data['accessToken'] as String,
      refresh: data['refreshToken'] as String?,
    );
    await savePatient(data['patient'] as Map<String, dynamic>);
    return data;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getDashboard() async {
    final res = await _send(() => _dio.get('$_base/dashboard'));
    return _asMap(res);
  }

  // ── Transports ─────────────────────────────────────────────────────────────

  static Future<List<dynamic>> getTransports({String? statut}) async {
    final res = await _send(() => _dio.get(
      '$_base/transports',
      queryParameters: {if (statut != null) 'statut': statut},
    ));
    return _asMap(res)['transports'] as List<dynamic>;
  }

  static Future<Map<String, dynamic>> createTransport(Map<String, dynamic> body) async {
    final res = await _send(() => _dio.post('$_base/transports', data: body));
    return _asMap(res);
  }

  // ── Profil ─────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> updateProfil(Map<String, dynamic> body) async {
    final res = await _send(() => _dio.put('$_base/profil', data: body));
    return _asMap(res);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  static Future<void> logout() async {
    try {
      await _dio.post('$_base/logout');
    } catch (_) {}
    await clearSession();
  }

  // ── Transport par id ───────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getTransportById(String id) async {
    final res = await _send(() => _dio.get('$_base/transports/$id'));
    return _asMap(res)['transport'] as Map<String, dynamic>;
  }

  // ── Tracking ───────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getTracking(String id) async {
    final res = await _send(() => _dio.get('$_base/transports/$id/tracking'));
    return _asMap(res);
  }

  // ── Factures ───────────────────────────────────────────────────────────────

  static Future<List<dynamic>> getFactures() async {
    final res = await _send(() => _dio.get('$_base/factures'));
    return _asMap(res)['factures'] as List<dynamic>;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getStats() async {
    final res = await _send(() => _dio.get('$_base/stats'));
    return _asMap(res);
  }

  // ── Prescriptions ──────────────────────────────────────────────────────────

  static Future<List<dynamic>> getPrescriptions() async {
    final res = await _send(() => _dio.get('$_base/prescriptions'));
    return _asMap(res)['prescriptions'] as List<dynamic>;
  }

  // ── Paiement Stripe ────────────────────────────────────────────────────────

  /// Crée un PaymentIntent via la route patient existante (rétrocompatible).
  static Future<Map<String, dynamic>> createPaymentIntent(String factureId) async {
    final res = await _send(() => _dio.post('$_base/factures/$factureId/paiement-intent'));
    return _asMap(res);
  }

  /// Confirme le paiement (fallback si le webhook n'a pas encore mis à jour la facture).
  /// Afficher "en attente de confirmation" jusqu'à retour backend.
  static Future<Map<String, dynamic>> confirmerPaiement(
    String factureId,
    String paymentIntentId,
  ) async {
    final res = await _send(() => _dio.post(
      '$_base/factures/$factureId/confirmer-paiement',
      data: {'paymentIntentId': paymentIntentId},
    ));
    return _asMap(res);
  }

  /// Télécharge le PDF d'une facture (retourne les bytes du fichier).
  static Future<List<int>> downloadFacturePdf(String factureId) async {
    // Appel direct vers l'API principale (pas la route patient)
    final baseApi = dotenv.env['API_BASE_URL_MAIN'] ??
        (dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:5000/api/patient')
            .replaceAll('/api/patient', '/api');
    return _downloadBytes(
      '$baseApi/factures/$factureId/pdf',
      errorMessage: 'Téléchargement impossible',
    );
  }

  /// Télécharge le PDF du reçu de paiement (disponible seulement si payée).
  static Future<List<int>> downloadReceiptPdf(String factureId) async {
    final baseApi = dotenv.env['API_BASE_URL_MAIN'] ??
        (dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:5000/api/patient')
            .replaceAll('/api/patient', '/api');
    return _downloadBytes(
      '$baseApi/factures/$factureId/receipt',
      errorMessage: 'Reçu disponible uniquement après paiement',
    );
  }

  /// Téléchargement binaire 30s. `validateStatus: true` ⇒ aucune réponse n'est
  /// une "erreur" Dio, donc l'intercepteur de refresh ne se déclenche pas (le
  /// comportement historique : ces appels ne rafraîchissaient pas le token), et
  /// on reproduit les messages exacts via le check de status manuel.
  static Future<List<int>> _downloadBytes(
    String url, {
    required String errorMessage,
  }) async {
    try {
      final res = await _dio.get<List<int>>(
        url,
        options: Options(
          responseType:   ResponseType.bytes,
          receiveTimeout: const Duration(seconds: 30),
          validateStatus: (_) => true,
        ),
      );
      if ((res.statusCode ?? 0) >= 400) throw Exception(errorMessage);
      return res.data ?? <int>[];
    } on DioException {
      throw Exception('Téléchargement timeout.');
    }
  }

  // ── Prescriptions (upload) ─────────────────────────────────────────────────

  static Future<Map<String, dynamic>> createPrescription(
    Map<String, dynamic> body, {
    File? fichier,
  }) async {
    final formMap = <String, dynamic>{
      'motif':                    body['motif']?.toString() ?? '',
      'dateEmission':             body['dateEmission']?.toString() ?? '',
      'etablissementDestination': body['etablissementDestination']?.toString() ?? '',
      'notes':                    body['notes']?.toString() ?? '',
      'medecin':                  jsonEncode(body['medecin'] ?? {}),
    };
    if (fichier != null) {
      formMap['fichier'] = await MultipartFile.fromFile(
        fichier.path,
        filename: fichier.path.split('/').last.split('\\').last,
      );
    }
    final formData = FormData.fromMap(formMap);
    // multipart = stream à usage unique → on désactive le retry après 401 pour
    // éviter de rejouer un corps déjà finalisé (cf. DioClient.skipRefreshExtra).
    final res = await _send(() => _dio.post(
      '$_base/prescriptions',
      data: formData,
      options: Options(extra: {DioClient.skipRefreshExtra: true}),
    ));
    return _asMap(res);
  }

  // ── Notifications persistées ───────────────────────────────────────────────

  static String get _notifBase =>
      _base.replaceFirst('/api/patient', '/api/notifications');

  /// Récupère la liste de notifications (filtres optionnels : page, limit, read).
  static Future<Map<String, dynamic>> getNotifications({
    int page = 1,
    int limit = 20,
    bool? read,
  }) async {
    final res = await _send(() => _dio.get(
      _notifBase,
      queryParameters: {
        'page':  page,
        'limit': limit,
        if (read != null) 'read': read,
      },
    ));
    return _asMap(res);
  }

  /// Nombre de notifications non lues.
  static Future<int> getUnreadNotificationCount() async {
    final res = await _send(() => _dio.get('$_notifBase/unread-count'));
    return (_asMap(res)['count'] as num?)?.toInt() ?? 0;
  }

  /// Marquer une notification comme lue.
  static Future<void> markNotificationAsRead(String notifId) async {
    await _send(() => _dio.patch('$_notifBase/$notifId/read'));
  }

  /// Marquer toutes les notifications comme lues.
  static Future<void> markAllNotificationsAsRead() async {
    await _send(() => _dio.patch('$_notifBase/read-all'));
  }

  // ── FCM Push notifications ─────────────────────────────────────────────────

  static Future<void> registerFcmToken(String token) async {
    try {
      await _dio.post('$_base/fcm-token', data: {'token': token});
    } catch (_) {
      // Non-bloquant — push notifs optionnelles
    }
  }

  /// Sprint M4 — Supprime le token FCM cote serveur (logout).
  /// Best-effort : ne crashe pas si endpoint KO.
  static Future<void> deleteFcmToken() async {
    try {
      await _dio.delete('$_base/fcm-token');
    } catch (_) { /* non-bloquant */ }
  }

  // ── Mot de passe oublié / réinitialisation ────────────────────────────────

  static String get _authBase =>
      _base.replaceFirst('/api/patient', '/api/auth');

  static Future<void> forgotPassword(String email) async {
    await _send(() => _dio.post(
      '$_authBase/forgot-password',
      data: {'email': email},
    ));
  }

  static Future<void> resetPassword(String token, String newPassword) async {
    await _send(() => _dio.post(
      '$_authBase/reset-password',
      data: {'token': token, 'password': newPassword},
    ));
  }

  // ── RGPD ───────────────────────────────────────────────────────────────────

  // GET /api/gdpr/export — droit à la portabilité (Art. 20)
  static Future<Map<String, dynamic>> exportGdprData() async {
    final base = _base.replaceFirst('/api/patient', '/api');
    final res = await _send(() => _dio.get('$base/gdpr/export'));
    return _asMap(res);
  }

  // DELETE /api/gdpr/me — droit à l'effacement (Art. 17)
  static Future<void> deleteAccount(String password) async {
    final base = _base.replaceFirst('/api/patient', '/api');
    await _send(() => _dio.delete('$base/gdpr/me', data: {'password': password}));
    await clearSession();
  }

  // ── Mes consentements ──────────────────────────────────────────────────────

  // GET /api/patient/me — récupère le profil avec les champs RGPD
  static Future<Map<String, dynamic>> getMesDonnees() async {
    final res = await _send(() => _dio.get('$_base/me'));
    return _asMap(res);
  }

  // POST /api/patient/consent — mettre à jour un consentement
  static Future<Map<String, dynamic>> updateMonConsentement({
    required String consentType,
    required bool accepted,
    String version = '1.0',
    String source  = 'mobile',
  }) async {
    final res = await _send(() => _dio.post(
      '$_base/consent',
      data: {
        'consentType': consentType,
        'accepted':    accepted,
        'version':     version,
        'source':      source,
      },
    ));
    return _asMap(res);
  }

  // GET /api/patient/consent-history — historique des consentements
  static Future<List<dynamic>> getHistoriqueConsentements() async {
    final res = await _send(() => _dio.get('$_base/consent-history'));
    return (_asMap(res)['consentHistory'] as List<dynamic>?) ?? [];
  }

  // POST /api/patient/request-deletion — demander la suppression (Art. 17)
  static Future<void> demanderSuppression(String raison) async {
    await _send(() => _dio.post('$_base/request-deletion', data: {'reason': raison}));
  }
}
