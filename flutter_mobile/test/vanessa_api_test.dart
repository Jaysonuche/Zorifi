import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zorifi/vanessa_api.dart';

void main() {
  test(
    'hosted requests require authentication before touching the network',
    () async {
      var calls = 0;
      final api = VanessaApi(
        client: MockClient((_) async {
          calls++;
          return http.Response('{}', 200);
        }),
      );
      api.aiConsent = true;
      await expectLater(api.chat('Hello'), throwsA(isA<VanessaException>()));
      expect(calls, 0);
    },
  );
  test(
    'sign-in attaches the ID token, and changing servers clears the session',
    () async {
      final api = VanessaApi(
        firebaseKey: 'public-project-key',
        client: MockClient((request) async {
          if (request.url.host == 'identitytoolkit.googleapis.com') {
            return http.Response(
              jsonEncode({
                'idToken': 'test-id-token',
                'refreshToken': 'test-refresh',
                'expiresIn': '3600',
              }),
              200,
            );
          }
          expect(request.url.path, '/.netlify/functions/vanessa-global');
          expect(request.headers['authorization'], 'Bearer test-id-token');
          final payload = jsonDecode(request.body) as Map<String, dynamic>;
          expect(payload['action'], 'conversation');
          expect(payload['history'], hasLength(24));
          return http.Response('{"reply":"Make a short opening shot."}', 200);
        }),
      );
      api.aiConsent = true;
      await api.signIn('creator@example.com', 'test-password');
      expect(
        await api.chat(
          'Help me edit',
          history: List.generate(30, (i) => {'role': 'user', 'content': '$i'}),
        ),
        'Make a short opening shot.',
      );
      api.setEndpoint('https://another.example');
      expect(api.signedIn, isFalse);
    },
  );
  test(
    'local service failures are surfaced without invented answers or secrets',
    () async {
      final api = VanessaApi(
        endpoint: 'http://127.0.0.1:4173',
        client: MockClient(
          (_) async => http.Response(
            '{"code":"NOT_CONFIGURED","error":"secret-key"}',
            503,
          ),
        ),
      );
      api.aiConsent = true;
      try {
        await api.chat('Hello');
        fail('Must reject unavailable provider');
      } on VanessaException catch (error) {
        expect(error.message, contains('not configured'));
        expect(error.message, isNot(contains('secret-key')));
      }
      expect(
        () => VanessaApi.validateEndpoint('http://remote.example'),
        throwsA(isA<VanessaException>()),
      );
      expect(
        () => VanessaApi.validateEndpoint('https://user:password@example.com'),
        throwsA(isA<VanessaException>()),
      );
    },
  );
}
