import 'dart:io';

import 'package:ffmpeg_kit_flutter_new/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_new/return_code.dart';
import 'package:permission_handler/permission_handler.dart';

typedef FfmpegRunner = Future<bool> Function(List<String> arguments);

Future<bool> _runFfmpeg(List<String> arguments) async {
  final session = await FFmpegKit.executeWithArguments(arguments);
  return ReturnCode.isSuccess(await session.getReturnCode());
}

class ZorifiEngine {
  /// Request only permissions needed by the current action. System-picked
  /// files and app-owned copies require no blanket library/microphone request.
  /// Callers must select permissions supported by the target Android version.
  static Future<bool> requestPermissions({
    List<Permission> permissions = const [],
    bool allowLimitedPhotos = true,
  }) async {
    if (!Platform.isAndroid && !Platform.isIOS) return false;
    if (permissions.isEmpty) return true;
    final statuses = await permissions.toSet().toList().request();
    return statuses.entries.every(
      (entry) =>
          entry.value.isGranted ||
          (allowLimitedPhotos &&
              entry.key == Permission.photos &&
              entry.value.isLimited),
    );
  }

  /// Fast stream-copy trim. Video boundaries can follow keyframes rather than
  /// the exact requested frame. The destination container must support codecs.
  static Future<String?> trimVideo({
    required String inputPath,
    required String outputPath,
    required double startSeconds,
    required double durationSeconds,
  }) => const ZorifiMediaProcessor().trimVideo(
    inputPath: inputPath,
    outputPath: outputPath,
    startSeconds: startSeconds,
    durationSeconds: durationSeconds,
  );

  /// Copies the first audio stream; this does not convert its codec.
  static Future<String?> extractAudio({
    required String videoPath,
    required String outputAudioPath,
  }) => const ZorifiMediaProcessor().extractAudio(
    videoPath: videoPath,
    outputAudioPath: outputAudioPath,
  );
}

/// Injectable transport lets file safety and failure handling be checked
/// without pretending a host unit test ran native Android/iOS FFmpeg.
class ZorifiMediaProcessor {
  const ZorifiMediaProcessor({this.run = _runFfmpeg});
  final FfmpegRunner run;

  Future<String?> trimVideo({
    required String inputPath,
    required String outputPath,
    required double startSeconds,
    required double durationSeconds,
  }) async {
    if (!startSeconds.isFinite ||
        startSeconds < 0 ||
        !durationSeconds.isFinite ||
        durationSeconds <= 0) {
      throw ArgumentError(
        'Start must be non-negative and duration positive, with finite values.',
      );
    }
    return _process(
      inputPath,
      outputPath,
      (input, output) => [
        '-nostdin',
        '-n',
        '-ss',
        startSeconds.toString(),
        '-i',
        input,
        '-t',
        durationSeconds.toString(),
        '-c',
        'copy',
        output,
      ],
    );
  }

  Future<String?> extractAudio({
    required String videoPath,
    required String outputAudioPath,
  }) => _process(
    videoPath,
    outputAudioPath,
    (input, output) => [
      '-nostdin',
      '-n',
      '-i',
      input,
      '-map',
      '0:a:0',
      '-vn',
      '-c:a',
      'copy',
      output,
    ],
  );

  Future<String?> _process(
    String inputPath,
    String outputPath,
    List<String> Function(String, String) arguments,
  ) async {
    if (inputPath.trim().isEmpty ||
        outputPath.trim().isEmpty ||
        inputPath.contains('\u0000') ||
        outputPath.contains('\u0000')) {
      throw ArgumentError('Input and output must be valid local file paths.');
    }
    final input = File(inputPath), output = File(outputPath).absolute;
    if (!await input.exists()) {
      throw const FileSystemException('Input file does not exist.');
    }
    // Also rejects an existing source file, symlink or directory as output.
    if (await FileSystemEntity.type(output.path, followLinks: false) !=
        FileSystemEntityType.notFound) {
      throw const FileSystemException(
        'Output already exists. Choose a new filename.',
      );
    }
    if (!await output.parent.exists()) {
      throw const FileSystemException('Output directory does not exist.');
    }
    final resolvedInput = await input.resolveSymbolicLinks();
    // Render in a uniquely owned sibling directory. Failed runs can remove
    // their partial file without touching the user's destination or originals.
    final temporary = await output.parent.createTemp('.zorifi-processing-');
    final temporaryOutput = File(
      '${temporary.path}/${output.uri.pathSegments.last}',
    );
    try {
      final success = await run(arguments(resolvedInput, temporaryOutput.path));
      if (!success ||
          !await temporaryOutput.exists() ||
          await temporaryOutput.length() == 0) {
        return null;
      }
      // Exclusive destination creation refuses another file created meanwhile.
      await output.create(exclusive: true);
      try {
        await temporaryOutput.copy(output.path);
      } catch (_) {
        await output.delete();
        rethrow;
      }
      return output.path;
    } finally {
      await temporary.delete(recursive: true);
    }
  }
}
