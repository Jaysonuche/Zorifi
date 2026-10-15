import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class VanessaException implements Exception {
  VanessaException(this.message);
  final String message;
  @override
  String toString() => message;
}

class VanessaApi {
  VanessaApi({
    http.Client? client,
    String? endpoint,
    this.firebaseKey = const String.fromEnvironment('FIREBASE_WEB_API_KEY'),
  }) : client = client ?? http.Client(),
       endpoint = validateEndpoint(
         endpoint ??
             const String.fromEnvironment(
               'ZORIFI_API_URL',
               defaultValue: 'https://zorifi.netlify.app',
             ),
       );
  final http.Client client;
  final String firebaseKey;
  bool aiConsent = false;
  Uri endpoint;
  String? _idToken, _refreshToken;
  DateTime? _expires;
  bool get signedIn => _idToken != null;
  static Uri validateEndpoint(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        uri.path != '' && uri.path != '/' ||
        uri.scheme != 'https' &&
            !(uri.scheme == 'http' &&
                ['127.0.0.1', 'localhost'].contains(uri.host))) {
      throw VanessaException(
        'Use an HTTPS backend address, or localhost for USB development.',
      );
    }
    return uri.replace(path: '', query: null, fragment: null);
  }

  void setEndpoint(String value) {
    final next = validateEndpoint(value);
    if (next != endpoint) signOut();
    endpoint = next;
  }

  Future<Map<String, dynamic>> _post(
    Uri uri,
    Map<String, dynamic> input, {
    Map<String, String>? headers,
    bool form = false,
  }) async {
    http.Response response;
    try {
      response = await client
          .post(
            uri,
            headers: {
              'content-type': form
                  ? 'application/x-www-form-urlencoded'
                  : 'application/json',
              ...?headers,
            },
            body: form
                ? input.map((key, value) => MapEntry(key, '$value'))
                : jsonEncode(input),
          )
          .timeout(const Duration(seconds: 125));
    } on TimeoutException {
      throw VanessaException('Vanessa took too long to respond. Try again.');
    } on http.ClientException {
      throw VanessaException(
        'Could not reach the backend. Check the connection and address.',
      );
    }
    Map<String, dynamic> data;
    try {
      data = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw VanessaException('The backend returned an unreadable response.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (data['code'] == 'NOT_CONFIGURED') {
        throw VanessaException(
          'Vanessa’s provider is not configured on this backend.',
        );
      }
      if (response.statusCode == 401 || response.statusCode == 403) {
        throw VanessaException(
          'Sign in with your Zorifi cloud account to use this backend.',
        );
      }
      if (response.statusCode == 429) {
        throw VanessaException(
          'The backend is busy or has reached its usage limit. Try later.',
        );
      }
      throw VanessaException(
        'The request could not be completed (${response.statusCode}).',
      );
    }
    return data;
  }

  Future<void> signIn(String email, String password) async {
    if (firebaseKey.isEmpty) {
      throw VanessaException(
        'The app needs the public Firebase web configuration to enable cloud sign-in.',
      );
    }
    final data = await _post(
      Uri.https(
        'identitytoolkit.googleapis.com',
        '/v1/accounts:signInWithPassword',
        {'key': firebaseKey},
      ),
      {'email': email.trim(), 'password': password, 'returnSecureToken': true},
    );
    if (data['idToken'] is! String || data['refreshToken'] is! String) {
      throw VanessaException('Cloud sign-in was not confirmed.');
    }
    _idToken = data['idToken'] as String;
    _refreshToken = data['refreshToken'] as String;
    _expires = DateTime.now().add(
      Duration(seconds: int.tryParse('${data['expiresIn']}') ?? 3600),
    );
  }

  Future<void> _refresh() async {
    if (_idToken == null ||
        _expires == null ||
        _expires!.isAfter(DateTime.now().add(const Duration(minutes: 1)))) {
      return;
    }
    final data = await _post(
      Uri.https('securetoken.googleapis.com', '/v1/token', {
        'key': firebaseKey,
      }),
      {'grant_type': 'refresh_token', 'refresh_token': _refreshToken},
      form: true,
    );
    if (data['id_token'] is! String || data['refresh_token'] is! String) {
      signOut();
      throw VanessaException('Your session expired. Sign in again.');
    }
    _idToken = data['id_token'] as String;
    _refreshToken = data['refresh_token'] as String;
    _expires = DateTime.now().add(
      Duration(seconds: int.tryParse('${data['expires_in']}') ?? 3600),
    );
  }

  Future<String> chat(
    String message, {
    List<Map<String, String>> history = const [],
    Map<String, dynamic> context = const {},
  }) async {
    if (!aiConsent) {
      throw VanessaException(
        'Enable optional AI processing in Privacy & data before messaging Vanessa.',
      );
    }
    final hosted = !['localhost', '127.0.0.1'].contains(endpoint.host);
    if (hosted && !signedIn) {
      throw VanessaException(
        'Sign in with your Zorifi cloud account before messaging Vanessa.',
      );
    }
    if (hosted) await _refresh();
    final data = await _post(
      endpoint.resolve('/.netlify/functions/vanessa-global'),
      {
        'message': message,
        'action': 'conversation',
        'history': history
            .skip(history.length > 24 ? history.length - 24 : 0)
            .toList(),
        'context': context,
      },
      headers: hosted ? {'authorization': 'Bearer $_idToken'} : null,
    );
    final reply = data['reply'] ?? data['text'];
    if (reply is! String || reply.trim().isEmpty) {
      throw VanessaException('Vanessa returned no answer.');
    }
    return reply;
  }

  void signOut() {
    _idToken = null;
    _refreshToken = null;
    _expires = null;
  }

  void close() => client.close();
}
