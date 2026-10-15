import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';

import 'zorifi_engine.dart';

typedef SaveProcessedMedia = Future<bool> Function(File file, String name);

Future<bool> _saveProcessedMedia(File file, String name) async {
  final mobile = Platform.isAndroid || Platform.isIOS;
  final path = await FilePicker.platform.saveFile(
    dialogTitle: 'Save processed media',
    fileName: name,
    type: FileType.custom,
    allowedExtensions: [name.split('.').last],
    bytes: mobile ? await file.readAsBytes() : null,
  );
  if (path == null) return false;
  if (!mobile) await file.copy(path);
  return true;
}

class MediaExportException implements Exception {
  const MediaExportException(this.message);
  final String message;
}

/// Exports one selected source, keeping the project and original file intact.
class MediaExporter {
  const MediaExporter({
    this.processor = const ZorifiMediaProcessor(),
    this.save = _saveProcessedMedia,
    this.temporaryDirectory = getTemporaryDirectory,
  });
  final ZorifiMediaProcessor processor;
  final SaveProcessedMedia save;
  final Future<Directory> Function() temporaryDirectory;

  Future<bool> export({
    required File source,
    required String sourceName,
    required bool extractAudio,
    required double startSeconds,
    required double durationSeconds,
  }) async {
    // Matroska audio preserves source codecs without pretending to transcode.
    final extension = extractAudio
        ? 'mka'
        : source.path.split('.').last.toLowerCase();
    if (!RegExp(r'^[a-z0-9]+$').hasMatch(extension)) {
      throw const MediaExportException(
        'This file has no supported output extension.',
      );
    }
    final stem = sourceName
        .replaceFirst(RegExp(r'\.[^.]*$'), '')
        .replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '-');
    final name =
        '${stem.isEmpty ? 'zorifi' : stem}-${extractAudio ? 'audio' : 'trimmed'}.$extension';
    final directory = await (await temporaryDirectory()).createTemp(
      'zorifi-export-',
    );
    try {
      final output = '${directory.path}/$name';
      final result = extractAudio
          ? await processor.extractAudio(
              videoPath: source.path,
              outputAudioPath: output,
            )
          : await processor.trimVideo(
              inputPath: source.path,
              outputPath: output,
              startSeconds: startSeconds,
              durationSeconds: durationSeconds,
            );
      if (result == null) {
        throw const MediaExportException(
          'Processing failed. The source may be unsupported, damaged or missing an audio track.',
        );
      }
      return await save(File(result), name);
    } finally {
      await directory.delete(recursive: true);
    }
  }
}
