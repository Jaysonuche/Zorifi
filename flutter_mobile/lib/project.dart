import 'dart:math';

String newId(String prefix) =>
    '$prefix-${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(0xffffffff).toRadixString(16)}';

enum MediaKind { video, audio, image }

class MediaAsset {
  MediaAsset({
    required this.id,
    required this.name,
    required this.path,
    required this.kind,
    required this.durationMs,
  });
  final String id, name, path;
  final MediaKind kind;
  int durationMs;
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'path': path,
    'kind': kind.name,
    'durationMs': durationMs,
  };
  factory MediaAsset.fromJson(Map<String, dynamic> json) {
    final path = json['path'] as String;
    if (!RegExp(r'^media/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$').hasMatch(path)) {
      throw const FormatException('Unsafe media path');
    }
    final duration = (json['durationMs'] as num).toInt();
    if (duration < 0 || duration > 86400000) {
      throw const FormatException('Invalid media duration');
    }
    return MediaAsset(
      id: json['id'] as String,
      name: json['name'] as String,
      path: path,
      kind: MediaKind.values.byName(json['kind'] as String),
      durationMs: duration,
    );
  }
}

class TimelineClip {
  TimelineClip({
    required this.id,
    required this.mediaId,
    required this.endMs,
    this.startMs = 0,
    this.volume = 1,
  });
  final String id, mediaId;
  int startMs, endMs;
  double volume;
  int get durationMs => endMs - startMs;
  void trim(int start, int end, int sourceDuration) {
    if (sourceDuration <= 0 ||
        start < 0 ||
        end > sourceDuration ||
        end - start < min(100, sourceDuration)) {
      throw const FormatException(
        'Select a valid range within the source media',
      );
    }
    startMs = start;
    endMs = end;
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'mediaId': mediaId,
    'startMs': startMs,
    'endMs': endMs,
    'volume': volume,
  };
  factory TimelineClip.fromJson(Map<String, dynamic> json, MediaAsset asset) {
    final clip = TimelineClip(
      id: json['id'] as String,
      mediaId: asset.id,
      endMs: (json['endMs'] as num).toInt(),
    );
    clip.trim((json['startMs'] as num).toInt(), clip.endMs, asset.durationMs);
    clip.volume = (json['volume'] as num? ?? 1).toDouble();
    if (!clip.volume.isFinite || clip.volume < 0 || clip.volume > 1) {
      throw const FormatException('Invalid volume');
    }
    return clip;
  }
}

class MobileProject {
  MobileProject({
    required this.id,
    required this.name,
    List<MediaAsset>? media,
    List<TimelineClip>? clips,
    DateTime? updatedAt,
  }) : media = media ?? [],
       clips = clips ?? [],
       updatedAt = updatedAt ?? DateTime.now();
  final String id;
  String name;
  DateTime updatedAt;
  final List<MediaAsset> media;
  final List<TimelineClip> clips;
  MediaAsset assetFor(TimelineClip clip) =>
      media.firstWhere((asset) => asset.id == clip.mediaId);
  int get visualDurationMs => clips
      .where((clip) => assetFor(clip).kind != MediaKind.audio)
      .fold(0, (sum, clip) => sum + clip.durationMs);
  int get audioDurationMs => clips
      .where((clip) => assetFor(clip).kind == MediaKind.audio)
      .fold(0, (sum, clip) => sum + clip.durationMs);
  int get durationMs => max(visualDurationMs, audioDurationMs);
  TimelineClip addClip(MediaAsset asset) {
    if (asset.durationMs <= 0) {
      throw const FormatException('Preview this file before adding it');
    }
    final clip = TimelineClip(
      id: newId('clip'),
      mediaId: asset.id,
      endMs: asset.kind == MediaKind.image
          ? min(5000, asset.durationMs)
          : asset.durationMs,
    );
    clips.add(clip);
    return clip;
  }

  void moveClip(int from, int to) {
    if (from < 0 || from >= clips.length || to < 0 || to >= clips.length) {
      return;
    }
    clips.insert(to, clips.removeAt(from));
  }

  Map<String, dynamic> toJson() => {
    'schema': 'zorifi-mobile/1',
    'id': id,
    'name': name,
    'updatedAt': updatedAt.toIso8601String(),
    'media': media.map((asset) => asset.toJson()).toList(),
    'clips': clips.map((clip) => clip.toJson()).toList(),
  };
  factory MobileProject.fromJson(Map<String, dynamic> json) {
    if (json['schema'] != 'zorifi-mobile/1' ||
        !RegExp(r'^project-[a-zA-Z0-9-]+$').hasMatch(json['id'] as String)) {
      throw const FormatException('Unsupported project');
    }
    final media = (json['media'] as List)
        .map(
          (value) =>
              MediaAsset.fromJson(Map<String, dynamic>.from(value as Map)),
        )
        .toList();
    if (media.map((asset) => asset.id).toSet().length != media.length) {
      throw const FormatException('Duplicate media');
    }
    final clips = (json['clips'] as List).map((value) {
      final clip = Map<String, dynamic>.from(value as Map);
      return TimelineClip.fromJson(
        clip,
        media.firstWhere((asset) => asset.id == clip['mediaId']),
      );
    }).toList();
    if (clips.map((clip) => clip.id).toSet().length != clips.length) {
      throw const FormatException('Duplicate clips');
    }
    return MobileProject(
      id: json['id'] as String,
      name: json['name'] as String,
      media: media,
      clips: clips,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

String timeLabel(int ms) {
  final seconds = max(0, ms ~/ 1000);
  return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
}
