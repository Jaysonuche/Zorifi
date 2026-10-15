import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zorifi/media_exporter.dart';
import 'package:zorifi/zorifi_engine.dart';

void main() {
  late Directory root;
  late File source;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('zorifi-export-test-');
    source = await File('${root.path}/source.mp4').writeAsString('original');
  });
  tearDown(() => root.delete(recursive: true));

  test(
    'exports processed bytes, preserves original and removes temporary output',
    () async {
      final exporter = MediaExporter(
        temporaryDirectory: () async => root,
        processor: ZorifiMediaProcessor(
          run: (args) async {
            await File(args.last).writeAsString('processed audio');
            return true;
          },
        ),
        save: (file, name) async {
          expect(name, 'source-audio.mka');
          await file.copy('${root.path}/saved.mka');
          return true;
        },
      );
      expect(
        await exporter.export(
          source: source,
          sourceName: 'source.mp4',
          extractAudio: true,
          startSeconds: 0,
          durationSeconds: 1,
        ),
        isTrue,
      );
      expect(
        await File('${root.path}/saved.mka').readAsString(),
        'processed audio',
      );
      expect(await source.readAsString(), 'original');
      expect(await root.list().length, 2);
    },
  );

  test(
    'save cancellation is distinct from success and removes temporary output',
    () async {
      final exporter = MediaExporter(
        temporaryDirectory: () async => root,
        processor: ZorifiMediaProcessor(
          run: (args) async {
            await File(args.last).writeAsString('processed');
            return true;
          },
        ),
        save: (_, name) async {
          expect(name, 'source-trimmed.mp4');
          return false;
        },
      );
      expect(
        await exporter.export(
          source: source,
          sourceName: 'source.mp4',
          extractAudio: false,
          startSeconds: 0,
          durationSeconds: 1,
        ),
        isFalse,
      );
      expect(await root.list().length, 1);
    },
  );

  test(
    'processing failure never opens save dialog and removes temporary output',
    () async {
      var saves = 0;
      final exporter = MediaExporter(
        temporaryDirectory: () async => root,
        processor: ZorifiMediaProcessor(run: (_) async => false),
        save: (_, name) async {
          saves++;
          return true;
        },
      );
      await expectLater(
        exporter.export(
          source: source,
          sourceName: 'source.mp4',
          extractAudio: false,
          startSeconds: 0,
          durationSeconds: 1,
        ),
        throwsA(isA<MediaExportException>()),
      );
      expect(saves, 0);
      expect(await root.list().length, 1);
    },
  );
}
