import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zorifi/main.dart';
import 'package:zorifi/privacy.dart';
import 'package:zorifi/project.dart';
import 'package:zorifi/project_store.dart';
import 'package:zorifi/vanessa_api.dart';
import 'package:zorifi/workspace.dart';

class MemoryStore extends ProjectStore {
  MemoryStore() : super(Directory.systemTemp);
  final projects = [
    MobileProject(
      id: newId('project'),
      name: 'Recovered project',
      media: [
        MediaAsset(
          id: 'video',
          name: 'Opening shot.mp4',
          path: 'media/video.mp4',
          kind: MediaKind.video,
          durationMs: 1000,
        ),
        MediaAsset(
          id: 'audio',
          name: 'Background music.mp3',
          path: 'media/audio.mp3',
          kind: MediaKind.audio,
          durationMs: 1000,
        ),
      ],
    ),
  ];
  PrivacyPreferences privacy = PrivacyPreferences();
  @override
  Future<List<MobileProject>> loadProjects() async => List.from(projects);
  @override
  Future<Map<String, dynamic>> loadSettings() async => {};
  @override
  Future<PrivacyPreferences> loadPrivacy() async =>
      PrivacyPreferences.fromJson(privacy.toJson());
  @override
  Future<void> save(MobileProject project) async {
    if (!projects.any((item) => item.id == project.id)) projects.add(project);
  }

  @override
  Future<void> savePrivacy(PrivacyPreferences value) async {
    privacy = PrivacyPreferences.fromJson(value.toJson());
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final sdk = Platform.environment['FLUTTER_ROOT'] ?? '../.flutter-tools/sdk';
    for (final entry in {
      'Roboto': 'roboto-regular.ttf',
      'MaterialIcons': 'materialicons-regular.otf',
    }.entries) {
      final file = File(
        '$sdk/bin/cache/artifacts/material_fonts/${entry.value}',
      );
      if (await file.exists()) {
        final loader = FontLoader(entry.key);
        loader.addFont(file.readAsBytes().then(ByteData.sublistView));
        await loader.load();
      }
    }
  });
  testWidgets(
    'phone editor, projects and privacy consent work without uploading project details',
    (tester) async {
      final store = MemoryStore(), boundaryKey = GlobalKey();
      var requests = 0;
      final api = VanessaApi(
        endpoint: 'http://127.0.0.1:4173',
        client: MockClient((request) async {
          requests++;
          expect((jsonDecode(request.body) as Map)['context'], isEmpty);
          return http.Response(
            '{"reply":"Start with a strong opening shot."}',
            200,
          );
        }),
      );
      addTearDown(api.close);
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundaryKey,
          child: ZorifiMobileApp(
            home: Workspace(
              store: store,
              api: api,
              enableDesktopIntegration: false,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Vaness AI'), findsOneWidget);
      await tester.tap(find.text('Video'));
      await tester.pumpAndSettle();
      expect(find.text('Recovered project'), findsOneWidget);
      expect(find.text('Opening shot.mp4'), findsOneWidget);
      expect(find.text('Background music.mp3'), findsNothing);
      await tester.tap(find.text('Music'));
      await tester.pumpAndSettle();
      expect(find.text('Music Editor'), findsOneWidget);
      expect(find.text('Background music.mp3'), findsOneWidget);
      expect(find.text('Opening shot.mp4'), findsNothing);
      await tester.tap(find.text('Video'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.runAsync(() async {
        final boundary =
            boundaryKey.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
        final image = await boundary.toImage(pixelRatio: 2);
        final png = await image.toByteData(format: ui.ImageByteFormat.png);
        await Directory('../artifacts').create(recursive: true);
        await File('../artifacts/flutter-mobile.png')
            .writeAsBytes(png!.buffer.asUint8List());
        image.dispose();
      });
      await tester.tap(find.byTooltip('Projects'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('New project'));
      await tester.pumpAndSettle();
      expect(find.text('Untitled project 2'), findsOneWidget);
      await tester.tap(find.byTooltip('Privacy & data'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Data controller: Jayson Uche'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Allow optional Vanessa AI'),
        400,
        scrollable: find
            .descendant(
              of: find.byType(Dialog),
              matching: find.byType(Scrollable),
            )
            .first,
        maxScrolls: 30,
      );
      await tester.tap(find.text('Allow optional Vanessa AI'));
      await tester.pumpAndSettle();
      expect(store.privacy.ai, isTrue);
      expect(store.privacy.projectDetails, isFalse);
      await tester.tap(find.byTooltip('Close privacy'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Vaness AI'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField),
        'Help with an opening shot',
      );
      await tester.tap(find.byTooltip('Send message'));
      await tester.pumpAndSettle();
      expect(requests, 1);
      expect(find.text('Start with a strong opening shot.'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Keep this draft');
      tester.view.physicalSize = const Size(1200, 800);
      await tester.pumpAndSettle();
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      await tester.tap(find.text('Music Editor').first);
      await tester.pumpAndSettle();
      expect(find.text('Untitled project 2'), findsOneWidget);
      await tester.tap(find.text('Vaness AI'));
      await tester.pumpAndSettle();
      expect(find.text('Keep this draft'), findsOneWidget);
      tester.view.physicalSize = const Size(390, 844);
      await tester.pumpAndSettle();
      expect(find.byType(NavigationRail), findsNothing);
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.text('Keep this draft'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
