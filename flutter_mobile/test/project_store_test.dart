import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zorifi/project.dart';
import 'package:zorifi/project_store.dart';

void main() {
  late Directory directory;
  late ProjectStore store;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('zorifi-test-');
    store = ProjectStore(directory);
  });
  tearDown(() async => directory.delete(recursive: true));
  test(
    'imports a private copy, saves edits, and restores media from a backup',
    () async {
      final source = File('${directory.path}/source.png');
      final content = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1EAAAAASUVORK5CYII=',
      );
      await source.writeAsBytes(content);
      final asset = await store.importFile(source, 'cover.png');
      await source.delete();
      final project = MobileProject(
        id: newId('project'),
        name: 'My first edit',
        media: [asset],
      );
      final clip = project.addClip(asset)..trim(500, 2500, asset.durationMs);
      clip.volume = .4;
      await store.save(project);
      final loaded = (await store.loadProjects()).single;
      expect(loaded.clips.single.durationMs, 2000);
      expect(loaded.clips.single.volume, .4);
      expect(await store.mediaFile(loaded.media.single).readAsBytes(), content);
      final restored = await store.restore(await store.backup(loaded));
      expect(restored.id, isNot(project.id));
      expect(restored.media.single.id, isNot(asset.id));
      expect(restored.clips.single.mediaId, restored.media.single.id);
      expect(restored.clips.single.startMs, 500);
      expect(
        await store.mediaFile(restored.media.single).readAsBytes(),
        content,
      );
    },
  );
  test(
    'queued saves persist the latest snapshot and keep damaged files',
    () async {
      final project = MobileProject(id: newId('project'), name: 'Before');
      final first = store.save(project);
      project.name = 'After';
      final second = store.save(project);
      await Future.wait([first, second]);
      await File('${directory.path}/projects/damaged.json').writeAsString('{');
      expect((await store.loadProjects()).single.name, 'After');
      expect(store.warnings, isNotEmpty);
      expect(
        await File('${directory.path}/projects/damaged.json').exists(),
        isTrue,
      );
    },
  );
  test('rejects path traversal and invalid trim ranges', () {
    expect(
      () => MediaAsset.fromJson({
        'id': 'evil',
        'name': 'bad',
        'path': '../private.json',
        'kind': 'image',
        'durationMs': 5000,
      }),
      throwsFormatException,
    );
    final clip = TimelineClip(id: 'clip', mediaId: 'asset', endMs: 5000);
    expect(() => clip.trim(-100, 2000, 5000), throwsFormatException);
    expect(() => clip.trim(2000, 1000, 5000), throwsFormatException);
    expect(() => clip.trim(0, 6000, 5000), throwsFormatException);
    expect(
      () => store.save(MobileProject(id: '../escape', name: 'Unsafe')),
      throwsFormatException,
    );
  });
}
