import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'project.dart';
import 'privacy.dart';

class ProjectStore {
  ProjectStore(this.root);
  final Directory root;
  Future<void> _pending = Future.value();
  final List<String> warnings = [];
  Future<PrivacyPreferences> loadPrivacy() async {
    try {
      final file = File('${root.path}/privacy.json');
      if (!await file.exists()) return PrivacyPreferences();
      return PrivacyPreferences.fromJson(
        jsonDecode(await file.readAsString()) as Map<String, dynamic>,
      );
    } catch (_) {
      return PrivacyPreferences();
    }
  }

  Future<void> savePrivacy(PrivacyPreferences preferences) {
    final snapshot = jsonEncode(preferences.toJson());
    final operation = _pending.catchError((Object _) {}).then((_) async {
      final file = File('${root.path}/privacy.tmp');
      await file.writeAsString(snapshot, flush: true);
      await file.rename('${root.path}/privacy.json');
    });
    _pending = operation;
    return operation;
  }

  Future<Uint8List> personalData() async => Uint8List.fromList(
    utf8.encode(
      jsonEncode({
        'format': 'zorifi-personal-data',
        'exportedAt': DateTime.now().toUtc().toIso8601String(),
        'projects': (await loadProjects())
            .map((project) => project.toJson())
            .toList(),
        'settings': await loadSettings(),
        'privacy': (await loadPrivacy()).toJson(),
        'scope': 'Local project metadata and preferences. Media binaries and cloud/provider records are separate.',
      }),
    ),
  );
  Future<void> eraseEditorData() async {
    await _pending.catchError((Object _) {});
    for (final name in ['projects', 'media']) {
      final directory = Directory('${root.path}/$name');
      if (await directory.exists()) await directory.delete(recursive: true);
    }
    for (final name in ['settings.json', 'privacy.json', 'privacy.tmp']) {
      final file = File('${root.path}/$name');
      if (await file.exists()) await file.delete();
    }
    await initialize();
  }

  File mediaFile(MediaAsset asset) => File('${root.path}/${asset.path}');
  Future<void> initialize() async {
    await Directory('${root.path}/projects').create(recursive: true);
    await Directory('${root.path}/media').create(recursive: true);
  }

  Future<List<MobileProject>> loadProjects() async {
    await initialize();
    warnings.clear();
    final projects = <MobileProject>[];
    await for (final file in Directory('${root.path}/projects').list()) {
      if (file is! File || !file.path.endsWith('.json')) continue;
      try {
        projects.add(
          MobileProject.fromJson(
            jsonDecode(await file.readAsString()) as Map<String, dynamic>,
          ),
        );
      } catch (_) {
        warnings.add(
          'A damaged project could not be opened. Its file has been kept.',
        );
      }
    }
    projects.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return projects;
  }

  Future<void> save(MobileProject project) {
    if (!RegExp(r'^project-[a-zA-Z0-9-]+$').hasMatch(project.id)) {
      throw const FormatException('Invalid project ID');
    }
    project.updatedAt = DateTime.now();
    final snapshot = jsonEncode(project.toJson());
    final operation = _pending.catchError((Object _) {}).then((_) async {
      await initialize();
      final temporary = File('${root.path}/projects/${project.id}.tmp');
      await temporary.writeAsString(snapshot, flush: true);
      await temporary.rename('${root.path}/projects/${project.id}.json');
    });
    _pending = operation;
    return operation;
  }

  Future<MediaAsset> importFile(File source, String name) async {
    await initialize();
    if (await source.length() > 256 * 1024 * 1024) {
      throw const FormatException('Choose media smaller than 256 MB');
    }
    final extension = name.split('.').last.toLowerCase();
    final kind = switch (extension) {
      'mp4' || 'mov' || 'm4v' || 'webm' => MediaKind.video,
      'mp3' || 'wav' || 'm4a' || 'aac' || 'ogg' || 'flac' => MediaKind.audio,
      'jpg' || 'jpeg' || 'png' || 'webp' => MediaKind.image,
      _ => throw const FormatException('Unsupported media type'),
    };
    final id = newId('media'), relative = 'media/$id.$extension';
    final temporary = await source.copy('${root.path}/media/$id.part');
    await temporary.rename('${root.path}/$relative');
    return MediaAsset(
      id: id,
      name: name,
      path: relative,
      kind: kind,
      durationMs: kind == MediaKind.image ? 30000 : 0,
    );
  }

  Future<Uint8List> backup(MobileProject project) async {
    var size = 0;
    for (final asset in project.media) {
      size += await mediaFile(asset).length();
    }
    if (size > 64 * 1024 * 1024) {
      throw const FormatException(
        'Backups currently support up to 64 MB of media',
      );
    }
    final files = <String, String>{};
    for (final asset in project.media) {
      files[asset.id] = base64Encode(await mediaFile(asset).readAsBytes());
    }
    return Uint8List.fromList(
      utf8.encode(
        jsonEncode({
          'format': 'zorifi-mobile-backup',
          'version': 1,
          'project': project.toJson(),
          'files': files,
        }),
      ),
    );
  }

  Future<MobileProject> restore(Uint8List bytes) async {
    if (bytes.length > 92 * 1024 * 1024) {
      throw const FormatException('Backup is too large');
    }
    final data = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    if (data['format'] != 'zorifi-mobile-backup' || data['version'] != 1) {
      throw const FormatException('Choose a Zorifi mobile backup');
    }
    final original = MobileProject.fromJson(
      Map<String, dynamic>.from(data['project'] as Map),
    );
    final decoded = <MediaAsset, Uint8List>{};
    var total = 0;
    for (final asset in original.media) {
      final content = base64Decode((data['files'] as Map)[asset.id] as String);
      total += content.length;
      if (total > 64 * 1024 * 1024) {
        throw const FormatException('Backup media is too large');
      }
      decoded[asset] = content;
    }
    await initialize();
    final project = MobileProject(
      id: newId('project'),
      name: '${original.name} (restored)',
    );
    final mapping = <String, String>{};
    for (final entry in decoded.entries) {
      final id = newId('media'),
          relative = 'media/$id.${entry.key.path.split('.').last}';
      await File('${root.path}/$relative')
          .writeAsBytes(entry.value, flush: true);
      mapping[entry.key.id] = id;
      project.media.add(
        MediaAsset(
          id: id,
          name: entry.key.name,
          path: relative,
          kind: entry.key.kind,
          durationMs: entry.key.durationMs,
        ),
      );
    }
    project.clips.addAll(
      original.clips.map(
        (clip) => TimelineClip(
          id: newId('clip'),
          mediaId: mapping[clip.mediaId]!,
          endMs: clip.endMs,
          startMs: clip.startMs,
          volume: clip.volume,
        ),
      ),
    );
    await save(project);
    return project;
  }

  Future<Map<String, dynamic>> loadSettings() async {
    final file = File('${root.path}/settings.json');
    if (!await file.exists()) return {};
    try {
      return jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    } catch (_) {
      warnings.add(
        'Connection settings could not be read. The default backend is being used.',
      );
      return {};
    }
  }

  Future<void> saveSettings(String endpoint) =>
      File('${root.path}/settings.json')
          .writeAsString(jsonEncode({'endpoint': endpoint}))
          .then((_) {});
}
