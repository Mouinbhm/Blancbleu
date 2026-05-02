import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String _base = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5000/api/patient',
  );
  static const String _tokenKey  = 'bb_token';
  static const String _patientKey = 'bb_patient';

  // ── Token / session ────────────────────────────────────────────────────────

  static Future<void> saveToken(String t) async =>
      (await SharedPreferences.getInstance()).setString(_tokenKey, t);

  static Future<String?> getToken() async =>
      (await SharedPreferences.getInstance()).getString(_tokenKey);

  static Future<void> clearSession() async {
    final p = await SharedPreferences.getInstance();
    p.remove(_tokenKey);
    p.remove(_patientKey);
  }

  static Future<bool> isLoggedIn() async => (await getToken()) != null;

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

  // ── Auth ───────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$_base/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    final data = _parse(res);
    await saveToken(data['accessToken'] as String);
    await savePatient(data['patient'] as Map<String, dynamic>);
    return data;
  }

  static Future<Map<String, dynamic>> register({
    required String prenom,
    required String nom,
    required String email,
    required String password,
    String telephone = '',
    String mobilite  = 'ASSIS',
    String adresse   = '',
    String medecin   = '',
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
        'contactUrgence': contactUrgence,
      }),
    );
    final data = _parse(res);
    await saveToken(data['accessToken'] as String);
    await savePatient(data['patient'] as Map<String, dynamic>);
    return data;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getDashboard() async {
    final res = await http.get(
      Uri.parse('$_base/dashboard'),
      headers: await _headers(),
    );
    return _parse(res);
  }

  // ── Transports ─────────────────────────────────────────────────────────────

  static Future<List<dynamic>> getTransports({String? statut}) async {
    var url = '$_base/transports';
    if (statut != null) url += '?statut=$statut';
    final res = await http.get(Uri.parse(url), headers: await _headers());
    return _parse(res)['transports'] as List<dynamic>;
  }

  static Future<Map<String, dynamic>> createTransport(Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('$_base/transports'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _parse(res);
  }

  // ── Profil ─────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> updateProfil(Map<String, dynamic> body) async {
    final res = await http.put(
      Uri.parse('$_base/profil'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _parse(res);
  }
}
