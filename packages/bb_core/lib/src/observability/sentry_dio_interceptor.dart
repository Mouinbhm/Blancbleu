/// Sprint M5 — Intercepteur Dio qui pousse un breadcrumb Sentry à chaque
/// requête HTTP : méthode + path + status. **Pas** de body, **pas** d'headers
/// (l'auth est filtré au cas où, mais on n'ajoute rien d'autre).
///
/// Branché automatiquement dans DioClient quand Sentry est actif.
library;

import 'package:dio/dio.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

class SentryDioInterceptor extends Interceptor {
  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    _addBreadcrumb(
      method: response.requestOptions.method,
      path:   response.requestOptions.path,
      status: response.statusCode,
      level:  SentryLevel.info,
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _addBreadcrumb(
      method: err.requestOptions.method,
      path:   err.requestOptions.path,
      status: err.response?.statusCode,
      level:  (err.response?.statusCode != null && err.response!.statusCode! < 500)
          ? SentryLevel.warning
          : SentryLevel.error,
    );
    handler.next(err);
  }

  void _addBreadcrumb({
    required String method,
    required String path,
    int? status,
    required SentryLevel level,
  }) {
    Sentry.addBreadcrumb(Breadcrumb(
      category: 'http',
      type: 'http',
      level: level,
      data: {
        'method': method,
        'url':    path, // SEULEMENT le path (pas la baseUrl). Pas de query string sensible.
        if (status != null) 'status_code': status,
      },
    ));
  }
}
