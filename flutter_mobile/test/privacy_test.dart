import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zorifi/privacy.dart';
import 'package:zorifi/project.dart';
import 'package:zorifi/project_store.dart';
import 'package:zorifi/vanessa_api.dart';

void main() {
  test('privacy choices default off and withdrawal stops requests before transport', () async {
    final preferences = PrivacyPreferences();
    expect(preferences.ai, isFalse);
    expect(preferences.projectDetails, isFalse);
    preferences.choose(allowAi: true, shareProject: true);
    expect(
      PrivacyPreferences.fromJson(preferences.toJson()).projectDetails,
      isTrue,
    );
    preferences.choose(allowAi: false, shareProject: true);
    expect(preferences.projectDetails, isFalse);
    var calls = 0;
    final api = VanessaApi(
      endpoint: 'http://127.0.0.1:4173',
      client: MockClient((_) async {
        calls++;
        return http.Response('{"reply":"answer"}', 200);
      }),
    );
    await expectLater(api.chat('Hello'), throwsA(isA<VanessaException>()));
    expect(calls, 0);
    api.aiConsent = true;
    await api.chat('Hello');
    api.aiConsent = false;
    await expectLater(api.chat('Hello'), throwsA(isA<VanessaException>()));
    expect(calls, 1);
    api.close();
  });
  test(
    'exports metadata and erases app copies while preserving source files',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'zorifi-privacy-',
      );
      try {
        final source = File('${directory.path}/original.png');
        await source.writeAsBytes([1, 2, 3]);
        final store = ProjectStore(directory);
        final asset = await store.importFile(source, 'original.png');
        final project = MobileProject(
          id: newId('project'),
          name: 'Private edit',
          media: [asset],
        );
        await store.save(project);
        final preferences = PrivacyPreferences()
          ..choose(allowAi: true, shareProject: false);
        await store.savePrivacy(preferences);
        final exported =
            jsonDecode(utf8.decode(await store.personalData())) as Map;
        expect((exported['projects'] as List).single['name'], 'Private edit');
        expect((await store.loadPrivacy()).ai, isTrue);
        await store.eraseEditorData();
        expect(await store.loadProjects(), isEmpty);
        expect((await store.loadPrivacy()).ai, isFalse);
        expect(await store.mediaFile(asset).exists(), isFalse);
        expect(await source.exists(), isTrue);
      } finally {
        await directory.delete(recursive: true);
      }
    },
  );
}
