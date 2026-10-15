import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zorifi/zorifi_engine.dart';

void main() {
  late Directory directory;
  late File source;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('zorifi-engine-test-');
    source = await File('${directory.path}/source with spaces.mp4')
        .writeAsString('original');
  });
  tearDown(() => directory.delete(recursive: true));

  test(
    'trim passes separate arguments, writes output and preserves source',
    () async {
      final destination = '${directory.path}/trim result.mp4';
      final processor = ZorifiMediaProcessor(
        run: (arguments) async {
          expect(
            arguments[arguments.indexOf('-i') + 1],
            await source.resolveSymbolicLinks(),
          );
          expect(arguments[arguments.indexOf('-ss') + 1], '1.5');
          expect(arguments[arguments.indexOf('-t') + 1], '2.0');
          expect(arguments, contains('-n'));
          await File(arguments.last).writeAsString('processed fixture');
          return true;
        },
      );
      expect(
        await processor.trimVideo(
          inputPath: source.path,
          outputPath: destination,
          startSeconds: 1.5,
          durationSeconds: 2,
        ),
        File(destination).absolute.path,
      );
      expect(await File(destination).readAsString(), 'processed fixture');
      expect(await source.readAsString(), 'original');
      expect(await directory.list().length, 2);
    },
  );

  test(
    'rejects invalid ranges and existing destinations before processing',
    () async {
      var calls = 0;
      final processor = ZorifiMediaProcessor(
        run: (_) async {
          calls++;
          return true;
        },
      );
      await expectLater(
        processor.trimVideo(
          inputPath: source.path,
          outputPath: '${directory.path}/out.mp4',
          startSeconds: double.nan,
          durationSeconds: 1,
        ),
        throwsArgumentError,
      );
      await expectLater(
        processor.extractAudio(
          videoPath: source.path,
          outputAudioPath: source.path,
        ),
        throwsA(isA<FileSystemException>()),
      );
      expect(calls, 0);
      expect(await source.readAsString(), 'original');
    },
  );

  test(
    'failed or empty extraction removes temporary files and reports no output',
    () async {
      for (final success in [false, true]) {
        final processor = ZorifiMediaProcessor(
          run: (arguments) async {
            expect(arguments[arguments.indexOf('-map') + 1], '0:a:0');
            await File(arguments.last).writeAsString(success ? '' : 'partial');
            return success;
          },
        );
        final destination = '${directory.path}/audio.m4a';
        expect(
          await processor.extractAudio(
            videoPath: source.path,
            outputAudioPath: destination,
          ),
          isNull,
        );
        expect(await File(destination).exists(), isFalse);
        expect(await directory.list().length, 1);
      }
    },
  );
}
