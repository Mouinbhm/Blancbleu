import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../core/network/socket_manager.dart';

class ApiService {
  // API_BASE_URL must be set in .env (see .env.example).
  // Fallback: Android emulator → 10.0.2.2, physical device → LAN IP, prod → https://
  static String get _base =>
      dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:5000/api/patient';

  static const _timeout    = Duration(seconds: 15);
  static const String _tokenKey   = 'bb_token';
  static const String _refreshKey = 'bb_refresh';
  static const String _patientKey = 'bb_patient';

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  // Single-flight refresh : si N requêtes échouent en 401 en parallèle, un
  // SEUL appel /refresh est lancé, les autres attendent ce Completer.
  static Completer<bool>? _refreshCompleter;

  // ── Token / session ────────────────────────────────────────────────────────

  static Future<void> saveToken(String t) =>
      _secure.write(key: _tokenKey, value: t);

  static Future<String?> getToken() =>
      _secure.read(key: _tokenKey);

  static Future<void> _saveRefresh(String t) =>
      _secure.write(key: _refreshKey, value: t);

  static Future<String?> _getRefresh() =>
      _secure.read(key: _refreshKey);

  static Future<void> clearSession() async {
    await _secure.delete(key: _tokenKey);
    await _secure.delete(key: _refreshKey);
    final p = await SharedPreferences.getInstance();
    p.remove(_patientKey);
  }

  /// Sprint M1 — Valide la session au démarrage.
  /// Avant : retournait simplement `(token != null)` → l'écran d'accueil
  /// s'affichait avec un token expiré, puis 401 sur le premier appel.
  /// Maintenant : tente un appel léger authentifié (GET /me) qui passe par
  /// `_request` et déclenche le refresh transparent si nécessaire. Si le
  /// refresh échoue → clearSession + false.
  static Future<bool> isLoggedIn() async {
    final token = await getToken();
    if (token == null) return false;
    try {
      await getMesDonnees(); // 401 → _request tente refresh → si KO throw
      return true;
    } catch (e) {
      final msg = e.toString();
      if (msg.contains('SESSION_EXPIRED')) {
        // Refresh KO (déjà clearSession dans _request) → repli login.
        return false;
      }
      // Erreur réseau : on garde la session optimiste, l'utilisateur retentera.
      return true;
    }
  }

  static Future<void> savePatient(Map<String, dynamic> patient) async =>
      (await SharedPreferences.getInstance())
          .setString(_patientKey, jsonEncode(patient));

  static Future<Map<String, dynamic>?> getCachedPatient() async {
    final s = (await SharedPreferences.getInstance()).getString(_patientKey);
    return s != null ? jsonDecode(s) as Map<String, dynamic> : null;
  }

  // ── Headers ────────────────────────────────────────────────────────────────

  static Future<Map<String, String>> _headers() async {
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Map<String, dynamic> _parse(http.Response res) {
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode == 401) throw Exception('SESSION_EXPIRED');
    if (res.statusCode >= 400) throw Exception(data['message'] ?? 'Erreur serveur');
    return data;
  }

  // ── Refresh single-flight ─────────────────────────────────────────────────
  static Future<bool> _ensureRefreshed() async {
    if (_refreshCompleter != null) return _refreshCompleter!.future;
    final c = Completer<bool>();
    _refreshCompleter = c;
    try {
      final raw = await _getRefresh();
      if (raw == null || raw.isEmpty) {
        c.complete(false);
        return false;
      }
      final res = await http.post(
        Uri.parse('$_base/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': raw}),
      ).timeout(_timeout, onTimeout: () => http.Response('', 408));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final newAccess  = data['accessToken'] as String?;
        final newRefresh = data['refreshToken'] as String?;
        if (newAccess != null && newAccess.isNotEmpty) {
          await saveToken(newAccess);
          if (newRefresh != null && newRefresh.isNotEmpty) {
            await _saveRefresh(newRefresh);
          }
          // Sprint M2 — propage le nouveau token au socket pour eviter
          // une deconnexion silencieuse au prochain handshake serveur.
          SocketManager.instance.reauthenticate();
          c.complete(true);
          return true;
        }
      }
      c.complete(false);
      return false;
    } catch (_) {
      c.complete(false);
      return false;
    } finally {
      _refreshCompleter = null;
    }
  }

  /// Enveloppe un appel http qui peut retourner 401. Si 401, tente UN refresh
  /// (single-flight) puis rejoue la requête une fois. Si le refresh échoue ou
  /// si le retry est encore 401 → clearSession + throw SESSION_EXPIRED.
  ///
  /// Le closure `makeRequest` est rappelé tel quel pour le retry — il doit donc
  /// lire le token au moment de l'appel (via _headers()), pas en amont.
  static Future<http.Response> _request(
    Future<http.Response> Function() makeRequest,
  ) async {
    var res = await makeRequest();
    if (res.statusCode != 401) return res;

    final ok = await _ensureRefreshed();
    if (!ok) {
      await clearSession();
      throw Exception('SESSION_EXPIRED');
    }
    res = await makeRequest();
    if (res.statusCode == 401) {
      // Le refresh a abouti mais le serveur refuse toujours → session morte.
      await clearSession();
      throw Exception('SESSION_EXPIRED');
    }
    return res;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$_base/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible. Vérifiez votre connexion.'));
    final data = _parse(res);
    await saveToken(data['accessToken'] as String);
    final refresh = data['refreshToken'] as String?;
    if (refresh != null && refresh.isNotEmpty) {
      await _saveRefresh(refresh);
    }
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
    final res = await http.post(
      Uri.parse('$_base/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
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
      }),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible. Vérifiez votre connexion.'));
    final data = _parse(res);
    await saveToken(data['accessToken'] as String);
    final refresh = data['refreshToken'] as String?;
    if (refresh != null && refresh.isNotEmpty) {
      await _saveRefresh(refresh);
    }
    await savePatient(data['patient'] as Map<String, dynamic>);
    return data;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getDashboard() async {
    final res = await _request(() async => http.get(
      Uri.parse('$_base/dashboard'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.')));
    return _parse(res);
  }

  // ── Transports ─────────────────────────────────────────────────────────────

  static Future<List<dynamic>> getTransports({String? statut}) async {
    var url = '$_base/transports';
    if (statut != null) url += '?statut=$statut';
    final res = await _request(() async => http.get(Uri.parse(url), headers: await _headers())
        .timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.')));
    return _parse(res)['transports'] as List<dynamic>;
  }

  static Future<Map<String, dynamic>> createTransport(Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('$_base/transports'),
      headers: await _headers(),
      body: jsonEncode(body),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    return _parse(res);
  }

  // ── Profil ─────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> updateProfil(Map<String, dynamic> body) async {
    final res = await http.put(
      Uri.parse('$_base/profil'),
      headers: await _headers(),
      body: jsonEncode(body),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    return _parse(res);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  static Future<void> logout() async {
    try {
      await http.post(Uri.parse('$_base/logout'), headers: await _headers())
          .timeout(_timeout);
    } catch (_) {}
    await clearSession();
  }

  // ── Transport par id ───────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getTransportById(String id) async {
    final res = await _request(() async => http.get(
      Uri.parse('$_base/transports/$id'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.')));
    return _parse(res)['transport'] as Map<String, dynamic>;
  }

  // ── Tracking ───────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getTracking(String id) async {
    final res = await _request(() async => http.get(
      Uri.parse('$_base/transports/$id/tracking'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.')));
    return _parse(res);
  }

  // ── Factures ───────────────────────────────────────────────────────────────

  static Future<List<dynamic>> getFactures() async {
    final res = await _request(() async => http.get(
      Uri.parse('$_base/factures'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.')));
    return _parse(res)['factures'] as List<dynamic>;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getStats() async {
    final res = await http.get(
      Uri.parse('$_base/stats'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    return _parse(res);
  }

  // ── Prescriptions ──────────────────────────────────────────────────────────

  static Future<List<dynamic>> getPrescriptions() async {
    final res = await http.get(
      Uri.parse('$_base/prescriptions'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    return _parse(res)['prescriptions'] as List<dynamic>;
  }

  // ── Paiement Stripe ────────────────────────────────────────────────────────

  /// Crée un PaymentIntent via la route patient existante (rétrocompatible).
  static Future<Map<String, dynamic>> createPaymentIntent(String factureId) async {
    final res = await http.post(
      Uri.parse('$_base/factures/$factureId/paiement-intent'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    return _parse(res);
  }

  /// Confirme le paiement (fallback si le webhook n'a pas encore mis à jour la facture).
  /// Afficher "en attente de confirmation" jusqu'à retour backend.
  static Future<Map<String, dynamic>> confirmerPaiement(
    String factureId,
    String paymentIntentId,
  ) async {
    final res = await http.post(
      Uri.parse('$_base/factures/$factureId/confirmer-paiement'),
      headers: await _headers(),
      body: jsonEncode({'paymentIntentId': paymentIntentId}),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    return _parse(res);
  }

  /// Télécharge le PDF d'une facture (retourne les bytes du fichier).
  static Future<List<int>> downloadFacturePdf(String factureId) async {
    final token = await getToken();
    // Appel direct vers l'API principale (pas la route patient)
    final baseApi = dotenv.env['API_BASE_URL_MAIN'] ??
        (dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:5000/api/patient')
            .replaceAll('/api/patient', '/api');
    final res = await http.get(
      Uri.parse('$baseApi/factures/$factureId/pdf'),
      headers: {
        'Authorization': 'Bearer ${token ?? ''}',
      },
    ).timeout(const Duration(seconds: 30),
        onTimeout: () => throw Exception('Téléchargement timeout.'));
    if (res.statusCode >= 400) throw Exception('Téléchargement impossible');
    return res.bodyBytes;
  }

  /// Télécharge le PDF du reçu de paiement (disponible seulement si payée).
  static Future<List<int>> downloadReceiptPdf(String factureId) async {
    final token = await getToken();
    final baseApi = dotenv.env['API_BASE_URL_MAIN'] ??
        (dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:5000/api/patient')
            .replaceAll('/api/patient', '/api');
    final res = await http.get(
      Uri.parse('$baseApi/factures/$factureId/receipt'),
      headers: {
        'Authorization': 'Bearer ${token ?? ''}',
      },
    ).timeout(const Duration(seconds: 30),
        onTimeout: () => throw Exception('Téléchargement timeout.'));
    if (res.statusCode >= 400) throw Exception('Reçu disponible uniquement après paiement');
    return res.bodyBytes;
  }

  // ── Prescriptions (upload) ─────────────────────────────────────────────────

  static Future<Map<String, dynamic>> createPrescription(
    Map<String, dynamic> body, {
    File? fichier,
  }) async {
    final token = await getToken();
    final uri = Uri.parse('$_base/prescriptions');
    final request = http.MultipartRequest('POST', uri);

    if (token != null) request.headers['Authorization'] = 'Bearer $token';

    final fields = <String, String>{
      'motif':                    body['motif']?.toString() ?? '',
      'dateEmission':             body['dateEmission']?.toString() ?? '',
      'etablissementDestination': body['etablissementDestination']?.toString() ?? '',
      'notes':                    body['notes']?.toString() ?? '',
      'medecin':                  jsonEncode(body['medecin'] ?? {}),
    };
    request.fields.addAll(fields);

    if (fichier != null) {
      request.files.add(await http.MultipartFile.fromPath(
        'fichier',
        fichier.path,
        filename: fichier.path.split('/').last.split('\\').last,
      ));
    }

    final streamed = await request.send()
        .timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    final res = await http.Response.fromStream(streamed);
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode == 401) throw Exception('SESSION_EXPIRED');
    if (res.statusCode >= 400) throw Exception(data['message'] ?? 'Erreur serveur');
    return data;
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
    var url = '$_notifBase?page=$page&limit=$limit';
    if (read != null) url += '&read=$read';
    final res = await _request(() async => http.get(Uri.parse(url), headers: await _headers())
        .timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.')));
    return _parse(res);
  }

  /// Nombre de notifications non lues.
  static Future<int> getUnreadNotificationCount() async {
    final res = await http.get(
      Uri.parse('$_notifBase/unread-count'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    final data = _parse(res);
    return (data['count'] as num?)?.toInt() ?? 0;
  }

  /// Marquer une notification comme lue.
  static Future<void> markNotificationAsRead(String notifId) async {
    await http.patch(
      Uri.parse('$_notifBase/$notifId/read'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
  }

  /// Marquer toutes les notifications comme lues.
  static Future<void> markAllNotificationsAsRead() async {
    await http.patch(
      Uri.parse('$_notifBase/read-all'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
  }

  // ── FCM Push notifications ─────────────────────────────────────────────────

  static Future<void> registerFcmToken(String token) async {
    try {
      await http.post(
        Uri.parse('$_base/fcm-token'),
        headers: await _headers(),
        body: jsonEncode({'token': token}),
      ).timeout(_timeout);
    } catch (_) {
      // Non-bloquant — push notifs optionnelles
    }
  }

  // ── Mot de passe oublié / réinitialisation ────────────────────────────────

  static String get _authBase =>
      _base.replaceFirst('/api/patient', '/api/auth');

  static Future<void> forgotPassword(String email) async {
    final res = await http.post(
      Uri.parse('$_authBase/forgot-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email}),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(data['message'] ?? 'Erreur serveur');
    }
  }

  static Future<void> resetPassword(String token, String newPassword) async {
    final res = await http.post(
      Uri.parse('$_authBase/reset-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'token': token, 'password': newPassword}),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(data['message'] ?? 'Erreur serveur');
    }
  }

  // ── RGPD ───────────────────────────────────────────────────────────────────

  // GET /api/gdpr/export — droit à la portabilité (Art. 20)
  static Future<Map<String, dynamic>> exportGdprData() async {
    final base = _base.replaceFirst('/api/patient', '/api');
    final res = await http.get(
      Uri.parse('$base/gdpr/export'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    if (res.statusCode == 401) throw Exception('SESSION_EXPIRED');
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(data['message'] ?? 'Erreur serveur');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // DELETE /api/gdpr/me — droit à l'effacement (Art. 17)
  static Future<void> deleteAccount(String password) async {
    final base = _base.replaceFirst('/api/patient', '/api');
    final res = await http.delete(
      Uri.parse('$base/gdpr/me'),
      headers: await _headers(),
      body: jsonEncode({'password': password}),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    if (res.statusCode == 401) throw Exception('SESSION_EXPIRED');
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(data['message'] ?? 'Erreur serveur');
    }
    await clearSession();
  }

  // ── Mes consentements ──────────────────────────────────────────────────────

  // GET /api/patient/me — récupère le profil avec les champs RGPD
  static Future<Map<String, dynamic>> getMesDonnees() async {
    final res = await _request(() async => http.get(
      Uri.parse('$_base/me'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.')));
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(data['message'] ?? 'Erreur serveur');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // POST /api/patient/consent — mettre à jour un consentement
  static Future<Map<String, dynamic>> updateMonConsentement({
    required String consentType,
    required bool accepted,
    String version = '1.0',
    String source  = 'mobile',
  }) async {
    final res = await http.post(
      Uri.parse('$_base/consent'),
      headers: await _headers(),
      body: jsonEncode({
        'consentType': consentType,
        'accepted':    accepted,
        'version':     version,
        'source':      source,
      }),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    if (res.statusCode == 401) throw Exception('SESSION_EXPIRED');
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(data['message'] ?? 'Erreur lors de la mise à jour du consentement');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // GET /api/patient/consent-history — historique des consentements
  static Future<List<dynamic>> getHistoriqueConsentements() async {
    final res = await http.get(
      Uri.parse('$_base/consent-history'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    if (res.statusCode == 401) throw Exception('SESSION_EXPIRED');
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(data['message'] ?? 'Erreur serveur');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['consentHistory'] as List<dynamic>?) ?? [];
  }

  // POST /api/patient/request-deletion — demander la suppression (Art. 17)
  static Future<void> demanderSuppression(String raison) async {
    final res = await http.post(
      Uri.parse('$_base/request-deletion'),
      headers: await _headers(),
      body: jsonEncode({'reason': raison}),
    ).timeout(_timeout, onTimeout: () => throw Exception('Serveur inaccessible.'));
    if (res.statusCode == 401) throw Exception('SESSION_EXPIRED');
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      throw Exception(data['message'] ?? 'Erreur lors de la demande');
    }
  }
}
