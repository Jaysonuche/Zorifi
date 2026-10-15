import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

import 'project.dart';
import 'privacy.dart';
import 'project_store.dart';
import 'vanessa_api.dart';
import 'desktop_integration.dart';
import 'media_exporter.dart';

class Workspace extends StatefulWidget {
  const Workspace({
    super.key,
    this.store,
    this.api,
    this.enableDesktopIntegration = true,
  });
  final bool enableDesktopIntegration;
  final ProjectStore? store;
  final VanessaApi? api;
  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> with WidgetsBindingObserver {
  late final VanessaApi _api;
  ProjectStore? _store;
  PrivacyPreferences _privacy = PrivacyPreferences();
  final _message = TextEditingController();
  final _messageFocus = FocusNode();
  final _desktop = DesktopIntegration();
  final _messages = <Map<String, String>>[];
  List<MobileProject> _projects = [];
  MobileProject? _project;
  MediaAsset? _asset;
  TimelineClip? _clip;
  VideoPlayerController? _video;
  AudioPlayer? _audio;
  final _subscriptions = <StreamSubscription<dynamic>>[];
  Timer? _imageTimer;
  String? _bootError, _previewError, _chatError;
  String _saveState = 'Saved on this device';
  int _tab = 0, _position = 0, _epoch = 0, _saveRevision = 0, _chatEpoch = 0;
  bool _loading = true,
      _processing = false,
      _importing = false,
      _previewLoading = false,
      _chatBusy = false,
      _ending = false,
      _imagePlaying = false;
  int get _start => _clip?.startMs ?? 0;
  int get _end => _clip?.endMs ?? _asset?.durationMs ?? 0;
  bool get _playing =>
      _video?.value.isPlaying ??
      (_audio?.state == PlayerState.playing || _imagePlaying);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _api = widget.api ?? VanessaApi();
    _boot();
    if (widget.enableDesktopIntegration) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _registerDesktopShortcut(),
      );
    }
  }

  Future<void> _registerDesktopShortcut() async {
    if (!mounted) return;
    try {
      await _desktop.register(() {
        if (!mounted || _processing) return;
        _pause();
        setState(() => _tab = 0);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _messageFocus.requestFocus();
        });
      });
    } catch (_) {
      _notice(
        'Ctrl+Shift+V is unavailable. Open Vaness AI from the navigation.',
      );
    }
  }

  Future<void> _boot() async {
    try {
      final directory =
          widget.store?.root ??
          Directory(
            '${(await getApplicationDocumentsDirectory()).path}/zorifi-mobile',
          );
      final store = widget.store ?? ProjectStore(directory);
      final projects = await store.loadProjects();
      final settings = await store.loadSettings();
      final privacy = await store.loadPrivacy();
      _privacy = privacy;
      _api.aiConsent = privacy.ai;
      if (settings['endpoint'] is String) {
        _api.setEndpoint(settings['endpoint'] as String);
      }
      if (!mounted) return;
      _store = store;
      if (projects.isEmpty) {
        final project = MobileProject(
          id: newId('project'),
          name: 'Untitled project',
        );
        await store.save(project);
        projects.add(project);
      }
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _project = projects.first;
        _loading = false;
        _bootError = null;
      });
      if (store.warnings.isNotEmpty) _notice(store.warnings.first);
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _bootError = 'Your project storage could not be opened. Your files have been kept.';
        });
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      _pause();
      if (_project != null) _persist();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _epoch++;
    _chatEpoch++;
    _disposePlayers();
    _message.dispose();
    _messageFocus.dispose();
    _desktop.dispose().catchError(
      (Object error) => debugPrint('Shortcut cleanup failed: $error'),
    );
    if (widget.api == null) _api.close();
    super.dispose();
  }

  void _notice(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _persist() async {
    final project = _project, store = _store;
    if (project == null || store == null) return;
    final revision = ++_saveRevision;
    if (mounted) setState(() => _saveState = 'Saving…');
    try {
      await store.save(project);
      if (mounted && revision == _saveRevision) {
        setState(() => _saveState = 'Saved on this device');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _saveState = 'Save failed · tap retry');
        _notice(
          'Could not save. Check available device storage and tap retry.',
        );
      }
    }
  }

  Future<void> _disposePlayers() async {
    _imageTimer?.cancel();
    _imageTimer = null;
    _imagePlaying = false;
    final video = _video, audio = _audio;
    _video = null;
    _audio = null;
    final subscriptions = List<StreamSubscription<dynamic>>.from(
      _subscriptions,
    );
    _subscriptions.clear();
    for (final subscription in subscriptions) {
      await subscription.cancel();
    }
    await video?.dispose();
    await audio?.dispose();
  }

  Future<void> _select(MediaAsset asset, {TimelineClip? clip}) async {
    final epoch = ++_epoch;
    await _disposePlayers();
    if (!mounted || epoch != _epoch) return;
    setState(() {
      _asset = asset;
      _clip = clip;
      _position = clip?.startMs ?? 0;
      _previewLoading = true;
      _previewError = null;
    });
    final file = _store!.mediaFile(asset);
    try {
      if (!await file.exists()) {
        throw const FormatException(
          'This media file is missing. Restore a backup or import it again.',
        );
      }
      if (asset.kind == MediaKind.video) {
        final controller = VideoPlayerController.file(file);
        try {
          await controller.initialize().timeout(const Duration(seconds: 20));
        } catch (_) {
          await controller.dispose();
          rethrow;
        }
        if (!mounted || epoch != _epoch) {
          await controller.dispose();
          return;
        }
        _video = controller;
        asset.durationMs = controller.value.duration.inMilliseconds;
        if (asset.durationMs <= 0) {
          throw const FormatException('This video has no playable duration.');
        }
        await controller.setVolume(clip?.volume ?? 1);
        await controller.seekTo(Duration(milliseconds: _start));
        controller.addListener(() {
          if (mounted && epoch == _epoch) {
            _onPosition(controller.value.position.inMilliseconds);
          }
        });
      } else if (asset.kind == MediaKind.audio) {
        final player = AudioPlayer();
        try {
          await player
              .setSource(DeviceFileSource(file.path))
              .timeout(const Duration(seconds: 20));
        } catch (_) {
          await player.dispose();
          rethrow;
        }
        if (!mounted || epoch != _epoch) {
          await player.dispose();
          return;
        }
        _audio = player;
        asset.durationMs = (await player.getDuration())?.inMilliseconds ?? 0;
        if (asset.durationMs <= 0) {
          throw const FormatException('This audio has no playable duration.');
        }
        await player.setVolume(clip?.volume ?? 1);
        await player.seek(Duration(milliseconds: _start));
        _subscriptions.add(
          player.onPositionChanged.listen((value) {
            if (mounted && epoch == _epoch) _onPosition(value.inMilliseconds);
          }),
        );
        _subscriptions.add(
          player.onPlayerStateChanged.listen((_) {
            if (mounted && epoch == _epoch) setState(() {});
          }),
        );
      }
      if (!mounted || epoch != _epoch) return;
      setState(() => _previewLoading = false);
      await _persist();
    } catch (error) {
      if (!mounted || epoch != _epoch) return;
      await _disposePlayers();
      if (mounted) {
        setState(() {
          _previewLoading = false;
          _previewError = error is FormatException ? error.message : 'This device could not play this file. Try another supported codec.';
        });
      }
    }
  }

  void _onPosition(int position) {
    if (!mounted) return;
    if (_playing && position >= _end && !_ending) {
      _ending = true;
      _pause().then((_) => _seek(_start)).whenComplete(() => _ending = false);
    }
    setState(() => _position = position.clamp(_start, _end));
  }

  Future<void> _pause() async {
    final video = _video, audio = _audio;
    _imageTimer?.cancel();
    _imageTimer = null;
    _imagePlaying = false;
    await video?.pause();
    await audio?.pause();
    if (mounted) setState(() {});
  }

  Future<void> _seek(int position) async {
    _position = position.clamp(0, _asset?.durationMs ?? 0);
    await _video?.seekTo(Duration(milliseconds: _position));
    await _audio?.seek(Duration(milliseconds: _position));
    if (mounted) setState(() {});
  }

  Future<void> _togglePlayback() async {
    if (_playing) {
      await _pause();
      return;
    }
    if (_position < _start || _position >= _end) await _seek(_start);
    if (_asset?.kind == MediaKind.image) {
      _imagePlaying = true;
      _imageTimer = Timer.periodic(
        const Duration(milliseconds: 100),
        (_) => _onPosition(_position + 100),
      );
    } else {
      await _video?.play();
      await _audio?.resume();
    }
    if (mounted) setState(() {});
  }

  Future<void> _import() async {
    try {
      final picked = await FilePicker.platform.pickFiles(
        allowMultiple: true,
        type: FileType.custom,
        allowedExtensions: [
          'mp4',
          'mov',
          'm4v',
          'webm',
          'mp3',
          'wav',
          'm4a',
          'aac',
          'ogg',
          'flac',
          'jpg',
          'jpeg',
          'png',
          'webp',
        ],
      );
      if (picked == null || !mounted) return;
      setState(() => _importing = true);
      MediaAsset? last;
      for (final selected in picked.files) {
        if (selected.path == null) {
          throw const FormatException(
            'The selected file is not available on this device.',
          );
        }
        final asset = await _store!.importFile(
          File(selected.path!),
          selected.name,
        );
        _project!.media.add(asset);
        last = asset;
        await _persist();
      }
      if (mounted) setState(() => _importing = false);
      if (last != null && mounted) {
        setState(() => _tab = last!.kind == MediaKind.audio ? 2 : 1);
        await _select(last);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _importing = false);
        _notice(
          error is FormatException
              ? error.message
              : 'Import failed. Check file access and available storage.',
        );
      }
    }
  }

  Future<void> _newProject() async {
    await _pause();
    await _persist();
    ++_epoch;
    await _disposePlayers();
    if (!mounted) return;
    final project = MobileProject(
      id: newId('project'),
      name: 'Untitled project ${_projects.length + 1}',
    );
    setState(() {
      _projects.insert(0, project);
      _project = project;
      _asset = null;
      _clip = null;
      _tab = 1;
      _position = 0;
      _previewError = null;
      _previewLoading = false;
    });
    await _persist();
  }

  Future<void> _openProject(MobileProject project) async {
    await _pause();
    await _persist();
    ++_epoch;
    await _disposePlayers();
    if (!mounted) return;
    setState(() {
      _project = project;
      _asset = null;
      _clip = null;
      _tab = 1;
      _previewError = null;
      _previewLoading = false;
    });
    if (project.clips.isNotEmpty) {
      setState(
        () =>
            _tab = project.assetFor(project.clips.first).kind == MediaKind.audio
            ? 2
            : 1,
      );
      await _select(
        project.assetFor(project.clips.first),
        clip: project.clips.first,
      );
    }
  }

  Future<void> _rename() async {
    final text = TextEditingController(text: _project!.name);
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Project name'),
        content: TextField(controller: text, autofocus: true, maxLength: 80),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, text.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    text.dispose();
    if (name == null || name.isEmpty || !mounted) return;
    setState(() => _project!.name = name);
    await _persist();
  }

  Future<void> _backup() async {
    try {
      await _persist();
      final bytes = await _store!.backup(_project!);
      final safeName = _project!.name.replaceAll(
        RegExp(r'[^a-zA-Z0-9_-]'),
        '-',
      );
      final path = await FilePicker.platform.saveFile(
        dialogTitle: 'Save project backup',
        fileName: '$safeName.zorifi-mobile.json',
        type: FileType.custom,
        allowedExtensions: ['json'],
        bytes: bytes,
      );
      if (path != null) {
        if (DesktopIntegration.supported) {
          await File(path).writeAsBytes(bytes, flush: true);
        }
        _notice('Project backup saved, including its media.');
      }
    } catch (error) {
      _notice(
        error is FormatException
            ? error.message
            : 'The backup could not be saved.',
      );
    }
  }

  Future<void> _exportSelected({required bool extractAudio}) async {
    final asset = _asset, store = _store;
    if (_processing ||
        asset == null ||
        store == null ||
        asset.kind == MediaKind.image) {
      return;
    }
    final start = _start / 1000, duration = (_end - _start) / 1000;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          extractAudio ? 'Extract source audio?' : 'Export trimmed source?',
        ),
        content: Text(
          extractAudio
              ? 'Copy the first audio track from the full source video to a Matroska audio (.mka) file. This preserves the original audio codec.'
              : 'Save the selected source range without re-encoding. Cuts may follow video keyframes. Volume changes, other timeline clips and effects are not included.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _processing = true);
    final navigator = Navigator.of(context);
    final route = DialogRoute<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const PopScope(
        canPop: false,
        child: AlertDialog(
          title: Text('Processing media'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              LinearProgressIndicator(),
              SizedBox(height: 16),
              Text(
                'Keep Zorifi open. You can choose where to save when processing finishes.',
              ),
            ],
          ),
        ),
      ),
    );
    unawaited(navigator.push(route));
    String result;
    try {
      await _pause();
      final saved = await const MediaExporter().export(
        source: store.mediaFile(asset),
        sourceName: asset.name,
        extractAudio: extractAudio,
        startSeconds: start,
        durationSeconds: duration,
      );
      result = saved
          ? 'Processed media saved.'
          : 'Save cancelled. Your source and project are unchanged.';
    } catch (error) {
      result = error is MediaExportException ? error.message : 'Could not process or save this file. Check available storage and try again.';
    } finally {
      if (route.isActive) navigator.removeRoute(route);
      if (mounted) setState(() => _processing = false);
    }
    _notice(result);
  }

  Future<void> _restore() async {
    try {
      final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
      );
      if (picked == null) return;
      final file = picked.files.single;
      if (file.path == null || file.size > 92 * 1024 * 1024) {
        throw const FormatException(
          'Choose a project backup smaller than 92 MB',
        );
      }
      final project = await _store!.restore(
        await File(file.path!).readAsBytes(),
      );
      if (!mounted) return;
      setState(() => _projects.insert(0, project));
      await _openProject(project);
    } catch (error) {
      _notice(
        error is FormatException
            ? error.message
            : 'This backup could not be restored.',
      );
    }
  }

  Future<void> _sendMessage() async {
    final message = _message.text.trim();
    if (message.isEmpty || _chatBusy) return;
    if (!_privacy.ai) {
      _privacyDialog();
      return;
    }
    final chatEpoch = _chatEpoch;
    final history = List<Map<String, String>>.from(_messages);
    setState(() {
      _messages.add({'role': 'user', 'content': message});
      _message.clear();
      _chatBusy = true;
      _chatError = null;
    });
    try {
      final reply = await _api.chat(
        message,
        history: history,
        context: _privacy.projectDetails
            ? {
                'projectName': _project?.name,
                'duration': (_project?.durationMs ?? 0) / 1000,
                'clips': _project?.clips
                    .map(
                      (clip) => {
                        'id': clip.id,
                        'name': _project!.assetFor(clip).name,
                        'kind': _project!.assetFor(clip).kind.name,
                        'duration': clip.durationMs / 1000,
                      },
                    )
                    .toList(),
              }
            : const {},
      );
      if (mounted && chatEpoch == _chatEpoch) {
        setState(() => _messages.add({'role': 'assistant', 'content': reply}));
      }
    } catch (error) {
      if (mounted && chatEpoch == _chatEpoch) {
        setState(
          () => _chatError = error is VanessaException
              ? error.message
              : 'Vanessa could not complete this request.',
        );
      }
    } finally {
      if (mounted && chatEpoch == _chatEpoch) setState(() => _chatBusy = false);
    }
  }

  Future<void> _settings() async {
    final endpoint = TextEditingController(text: _api.endpoint.toString()),
        email = TextEditingController(),
        password = TextEditingController();
    String? error;
    bool busy = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Connect Vanessa'),
          content: SizedBox(
            width: 360,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Your media stays on this device. Messages and project details are sent to the backend when you ask Vanessa.',
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: endpoint,
                    decoration: const InputDecoration(
                      labelText: 'Backend address',
                    ),
                    keyboardType: TextInputType.url,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _api.signedIn
                        ? 'Signed in for this session'
                        : 'Cloud account sign-in',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  if (_api.firebaseKey.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Text(
                        'Cloud sign-in needs this app’s Firebase configuration. Local editing works without an account.',
                      ),
                    ),
                  if (_api.firebaseKey.isNotEmpty && !_api.signedIn) ...[
                    TextField(
                      controller: email,
                      decoration: const InputDecoration(labelText: 'Email'),
                      keyboardType: TextInputType.emailAddress,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: password,
                      obscureText: true,
                      enableSuggestions: false,
                      autocorrect: false,
                      decoration: const InputDecoration(labelText: 'Password'),
                    ),
                  ],
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(dialogContext),
              child: const Text('Close'),
            ),
            if (_api.signedIn)
              TextButton(
                onPressed: busy
                    ? null
                    : () {
                        _api.signOut();
                        update(() {});
                        setState(() {});
                      },
                child: const Text('Sign out'),
              ),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      update(() {
                        busy = true;
                        error = null;
                      });
                      try {
                        _api.setEndpoint(endpoint.text);
                        await _store!.saveSettings(_api.endpoint.toString());
                        if (email.text.trim().isNotEmpty ||
                            password.text.isNotEmpty) {
                          await _api.signIn(email.text, password.text);
                        }
                        if (dialogContext.mounted) Navigator.pop(dialogContext);
                        if (mounted) setState(() {});
                      } catch (e) {
                        if (dialogContext.mounted) {
                          update(
                            () => error = e is VanessaException
                                ? e.message
                                : 'Could not save the connection.',
                          );
                        }
                      } finally {
                        if (dialogContext.mounted) update(() => busy = false);
                      }
                    },
              child: Text(busy ? 'Connecting…' : 'Save connection'),
            ),
          ],
        ),
      ),
    );
    endpoint.dispose();
    email.dispose();
    password.dispose();
  }

  Future<void> _privacyDialog() async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => Dialog.fullscreen(
          child: Scaffold(
            appBar: AppBar(
              title: const Text('Privacy & data'),
              leading: IconButton(
                tooltip: 'Close privacy',
                onPressed: () => Navigator.pop(dialogContext),
                icon: const Icon(Icons.close),
              ),
            ),
            body: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  'Your data, your choices',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 12),
                SelectableText(PrivacyPreferences.notice),
                const SizedBox(height: 24),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Allow optional Vanessa AI'),
                  subtitle: const Text(
                    'Send your chat requests to the configured backend and language provider.',
                  ),
                  value: _privacy.ai,
                  onChanged: (value) async {
                    _privacy.choose(
                      allowAi: value,
                      shareProject: _privacy.projectDetails,
                    );
                    if (!value) _api.aiConsent = false;
                    update(() {});
                    try {
                      await _store!.savePrivacy(_privacy);
                      _api.aiConsent = _privacy.ai;
                      if (mounted) setState(() {});
                    } catch (_) {
                      _api.aiConsent = false;
                      _privacy.choose(allowAi: false, shareProject: false);
                      if (dialogContext.mounted) update(() {});
                      _notice(
                        'Your choice could not be saved. AI is disabled for this session.',
                      );
                    }
                  },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Share project details with Vanessa'),
                  subtitle: const Text(
                    'Include the project name, media filenames and clip timings. Original files are not uploaded.',
                  ),
                  value: _privacy.projectDetails,
                  onChanged: !_privacy.ai
                      ? null
                      : (value) async {
                          _privacy.choose(
                            allowAi: _privacy.ai,
                            shareProject: value,
                          );
                          update(() {});
                          try {
                            await _store!.savePrivacy(_privacy);
                          } catch (_) {
                            _privacy.choose(
                              allowAi: _privacy.ai,
                              shareProject: false,
                            );
                            if (dialogContext.mounted) update(() {});
                            _notice(
                              'Project sharing could not be saved and is disabled.',
                            );
                          }
                        },
                ),
                const Divider(height: 32),
                OutlinedButton.icon(
                  onPressed: () async {
                    try {
                      await _persist();
                      final bytes = await _store!.personalData();
                      final saved = await FilePicker.platform.saveFile(
                        dialogTitle: 'Export personal data',
                        fileName: 'zorifi-personal-data.json',
                        type: FileType.custom,
                        allowedExtensions: ['json'],
                        bytes: bytes,
                      );
                      if (saved != null) {
                        if (DesktopIntegration.supported) {
                          await File(saved).writeAsBytes(bytes, flush: true);
                        }
                        _notice('Your local data export was saved.');
                      }
                    } catch (_) {
                      _notice('The data export could not be saved.');
                    }
                  },
                  icon: const Icon(Icons.download_outlined),
                  label: const Text('Export my local metadata'),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Project backups also include original imported media. Cloud/provider records are separate.',
                  style: TextStyle(color: Colors.white60),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () {
                    Clipboard.setData(
                      const ClipboardData(text: PrivacyPreferences.email),
                    );
                    _notice(
                      'Privacy contact copied. You can send an access, correction, erasure, restriction or objection request.',
                    );
                  },
                  icon: const Icon(Icons.content_copy),
                  label: const Text('Copy privacy contact'),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () async {
                    final erase = await showDialog<bool>(
                      context: context,
                      builder: (confirmContext) => AlertDialog(
                        title: const Text('Erase local editor data?'),
                        content: const Text(
                          'This deletes all projects, imported media copies, saved preferences and chat in this app. Back up your work first. Original files, external backups, cloud accounts and billing remain separate.',
                        ),
                        actions: [
                          TextButton(
                            onPressed: () =>
                                Navigator.pop(confirmContext, false),
                            child: const Text('Cancel'),
                          ),
                          FilledButton(
                            onPressed: () =>
                                Navigator.pop(confirmContext, true),
                            child: const Text('Erase local data'),
                          ),
                        ],
                      ),
                    );
                    if (erase != true || !mounted) return;
                    if (dialogContext.mounted) Navigator.pop(dialogContext);
                    ++_epoch;
                    ++_chatEpoch;
                    await _disposePlayers();
                    _api.signOut();
                    _api.aiConsent = false;
                    setState(() {
                      _loading = true;
                      _project = null;
                      _projects = [];
                      _asset = null;
                      _clip = null;
                      _messages.clear();
                      _message.clear();
                      _chatBusy = false;
                      _chatError = null;
                      _privacy = PrivacyPreferences();
                      _previewLoading = false;
                    });
                    try {
                      await _store!.eraseEditorData();
                      await _boot();
                      _notice(
                        'Local editor data was erased. Cloud/provider records and external backups were not changed.',
                      );
                    } catch (_) {
                      if (mounted) {
                        setState(
                          () => _bootError = 'Erasure could not finish. Some local data may have been removed; retry from Privacy & data after reopening storage.',
                        );
                      }
                      if (mounted) setState(() => _loading = false);
                    }
                  },
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Erase this app’s local editor data'),
                ),
                const SizedBox(height: 20),
                Text(
                  'Notice ${PrivacyPreferences.version} · ${PrivacyPreferences.controller}',
                  style: const TextStyle(color: Colors.white54, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 700;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                gradient: const LinearGradient(
                  colors: [Color(0xff8a5cff), Color(0xffdd4bac)],
                ),
              ),
              child: const Center(
                child: Text('Z', style: TextStyle(fontWeight: FontWeight.w900)),
              ),
            ),
            const SizedBox(width: 10),
            const Text('zorifi', style: TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Privacy & data',
            onPressed: _loading || _bootError != null ? null : _privacyDialog,
            icon: const Icon(Icons.privacy_tip_outlined),
          ),
          IconButton(
            tooltip: 'Projects',
            onPressed: _loading || _bootError != null ? null : _showProjects,
            icon: const Icon(Icons.folder_outlined),
          ),
          IconButton(
            tooltip: 'Connect Vanessa',
            onPressed: _loading || _bootError != null ? null : _settings,
            icon: const Icon(Icons.cloud_outlined),
          ),
          IconButton(
            tooltip: 'Save project backup',
            onPressed: _project == null ? null : _backup,
            icon: const Icon(Icons.ios_share),
          ),
        ],
      ),
      body: Row(
        children: [
          if (wide) ...[
            NavigationRail(
              selectedIndex: _tab,
              onDestinationSelected: (index) {
                _pause();
                setState(() => _tab = index);
              },
              backgroundColor: const Color(0xff181818),
              selectedIconTheme: const IconThemeData(color: Colors.cyanAccent),
              unselectedIconTheme: const IconThemeData(color: Colors.grey),
              labelType: NavigationRailLabelType.all,
              leading: const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Icon(
                  Icons.auto_awesome,
                  color: Colors.deepPurpleAccent,
                  size: 32,
                ),
              ),
              destinations: const [
                NavigationRailDestination(
                  icon: Icon(Icons.psychology),
                  label: Text('Vaness AI'),
                ),
                NavigationRailDestination(
                  icon: Icon(Icons.video_library),
                  label: Text('Video Editor'),
                ),
                NavigationRailDestination(
                  icon: Icon(Icons.graphic_eq),
                  label: Text('Music Editor'),
                ),
              ],
            ),
            const VerticalDivider(width: 1, thickness: 1),
          ],
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _bootError != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_bootError!),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: () {
                              setState(() => _loading = true);
                              _boot();
                            },
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  )
                : SafeArea(
                    top: false,
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 900),
                        child: switch (_tab) {
                          0 => _vanessaView(),
                          2 => _editorView(music: true),
                          _ => _editorView(),
                        },
                      ),
                    ),
                  ),
          ),
        ],
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _tab,
              onDestinationSelected: (index) {
                _pause();
                setState(() => _tab = index);
              },
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.psychology_outlined),
                  selectedIcon: Icon(Icons.psychology),
                  label: 'Vaness AI',
                ),
                NavigationDestination(
                  icon: Icon(Icons.video_library_outlined),
                  selectedIcon: Icon(Icons.video_library),
                  label: 'Video',
                ),
                NavigationDestination(
                  icon: Icon(Icons.graphic_eq_outlined),
                  selectedIcon: Icon(Icons.graphic_eq),
                  label: 'Music',
                ),
              ],
            ),
    );
  }

  Widget _editorView({bool music = false}) {
    final project = _project!;
    final media = project.media
        .where((asset) => (asset.kind == MediaKind.audio) == music)
        .toList();
    final clips = project.clips
        .where(
          (clip) => (project.assetFor(clip).kind == MediaKind.audio) == music,
        )
        .toList();
    final selected =
        _asset != null && (_asset!.kind == MediaKind.audio) == music;
    return ListView(
      key: PageStorageKey(music ? 'music-editor' : 'video-editor'),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                project.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            IconButton(
              tooltip: 'Rename project',
              onPressed: _rename,
              icon: const Icon(Icons.edit_outlined),
            ),
          ],
        ),
        InkWell(
          onTap: _persist,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              _saveState,
              style: TextStyle(
                color: _saveState.startsWith('Save failed')
                    ? Theme.of(context).colorScheme.error
                    : Colors.white60,
                fontSize: 12,
              ),
            ),
          ),
        ),
        Text(
          music ? 'Music Editor' : 'Video Editor',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: AspectRatio(
            aspectRatio: music ? 2.2 : 16 / 9,
            child: ColoredBox(
              color: music ? const Color(0xff1e1e1e) : Colors.black,
              child: selected
                  ? _preview()
                  : Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            music
                                ? Icons.graphic_eq
                                : Icons.movie_creation_outlined,
                            size: 48,
                            color: music ? Colors.cyanAccent : Colors.white38,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            music
                                ? 'Select audio to preview'
                                : 'Select video or a photo to preview',
                            style: const TextStyle(color: Colors.white54),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
        ),
        if (selected && !_previewLoading && _previewError == null) _transport(),
        if (selected &&
            !_previewLoading &&
            _previewError == null &&
            _asset!.kind != MediaKind.image)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _processing
                    ? null
                    : () => _exportSelected(extractAudio: false),
                icon: const Icon(Icons.file_download_outlined),
                label: const Text('Export trimmed source'),
              ),
              if (_asset!.kind == MediaKind.video)
                OutlinedButton.icon(
                  onPressed: _processing
                      ? null
                      : () => _exportSelected(extractAudio: true),
                  icon: const Icon(Icons.audio_file_outlined),
                  label: const Text('Extract source audio'),
                ),
            ],
          ),
        if (_clip != null &&
            selected &&
            !_previewLoading &&
            _previewError == null)
          _trimControls(),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Text(
                '${music ? 'Audio tracks' : 'Video timeline'} · ${timeLabel(clips.fold<int>(0, (total, clip) => total + clip.durationMs))}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            TextButton.icon(
              onPressed:
                  !selected ||
                      _asset!.durationMs <= 0 ||
                      _previewLoading ||
                      _previewError != null
                  ? null
                  : () {
                      final clip = project.addClip(_asset!);
                      setState(() => _clip = clip);
                      _seek(clip.startMs);
                      _persist();
                    },
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add clip'),
            ),
          ],
        ),
        if (clips.isEmpty)
          _EmptyCard(
            icon: music ? Icons.audiotrack : Icons.view_timeline_outlined,
            title: music
                ? 'Build your audio sequence'
                : 'Build your first sequence',
            text: music
                ? 'Import music, voiceover or sound effects, preview a file, then add it as a clip.'
                : 'Import a video or photo, preview it, then add it to the timeline.',
          ),
        for (final kind in [music ? MediaKind.audio : MediaKind.video])
          if (project.clips.any(
            (clip) =>
                (project.assetFor(clip).kind == MediaKind.audio) ==
                (kind == MediaKind.audio),
          ))
            _timelineLane(kind),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: Text(
                music ? 'Project audio' : 'Project videos & photos',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            FilledButton.tonalIcon(
              onPressed: _importing ? null : _import,
              icon: const Icon(Icons.upload_file, size: 18),
              label: Text(_importing ? 'Importing…' : 'Import'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (media.isEmpty)
          _EmptyCard(
            icon: music ? Icons.music_note : Icons.video_library_outlined,
            title: music ? 'Bring in your sound' : 'Your story starts here',
            text: music
                ? 'Imported audio appears here. Files are copied into this app so projects can reopen later.'
                : 'Imported videos and photos appear here. Files are copied into this app so projects can reopen later.',
          ),
        for (final asset in media)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              tileColor: _asset?.id == asset.id
                  ? const Color(0xff302449)
                  : const Color(0xff191924),
              leading: Icon(
                _mediaIcon(asset.kind),
                color: const Color(0xffb89bff),
              ),
              title: Text(
                asset.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                '${asset.kind.name} · ${asset.durationMs > 0 ? timeLabel(asset.durationMs) : 'Tap to preview'}',
              ),
              onTap: () => _select(asset),
            ),
          ),
        const Padding(
          padding: EdgeInsets.only(top: 16),
          child: Text(
            'Preview plays the selected clip. Export trimmed source saves only its range; full timeline rendering, volume effects in exports and mixed track playback are not yet available.',
            style: TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ),
      ],
    );
  }

  Widget _preview() {
    if (_previewLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_previewError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Text(_previewError!, textAlign: TextAlign.center),
        ),
      );
    }
    if (_video != null) {
      return Center(
        child: AspectRatio(
          aspectRatio: _video!.value.aspectRatio,
          child: VideoPlayer(_video!),
        ),
      );
    }
    if (_asset?.kind == MediaKind.image) {
      return Image.file(
        _store!.mediaFile(_asset!),
        fit: BoxFit.contain,
        errorBuilder: (_, error, stack) =>
            const Center(child: Text('This image could not be opened.')),
      );
    }
    if (_asset?.kind == MediaKind.audio) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.graphic_eq, size: 72, color: Color(0xffb89bff)),
            SizedBox(height: 12),
            Text('Music preview', style: TextStyle(color: Colors.white70)),
          ],
        ),
      );
    }
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.play_circle_outline, size: 48, color: Colors.white38),
          SizedBox(height: 12),
          Text(
            'Select media to preview',
            style: TextStyle(color: Colors.white54),
          ),
        ],
      ),
    );
  }

  Widget _transport() => Column(
    children: [
      Slider(
        value: _position.toDouble().clamp(0, _asset!.durationMs.toDouble()),
        max: _asset!.durationMs.toDouble(),
        onChanged: (value) => _seek(value.toInt()),
      ),
      Row(
        children: [
          Text(
            timeLabel(_position),
            style: const TextStyle(
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          Expanded(
            child: Center(
              child: IconButton.filled(
                tooltip: _playing ? 'Pause preview' : 'Play selected clip',
                onPressed: _togglePlayback,
                icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
              ),
            ),
          ),
          Text(timeLabel(_asset!.durationMs)),
        ],
      ),
    ],
  );
  Widget _trimControls() => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Trim · ${timeLabel(_clip!.durationMs)}',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              Text(
                '${timeLabel(_start)} → ${timeLabel(_end)}',
                style: const TextStyle(color: Colors.white60, fontSize: 12),
              ),
            ],
          ),
          RangeSlider(
            values: RangeValues(_start.toDouble(), _end.toDouble()),
            max: _asset!.durationMs.toDouble(),
            onChanged: (range) {
              try {
                _clip!.trim(
                  range.start.round(),
                  range.end.round(),
                  _asset!.durationMs,
                );
                setState(() {});
                if (_position < _start || _position >= _end) _seek(_start);
              } on FormatException {
                return;
              }
            },
            onChangeEnd: (_) => _persist(),
          ),
          if (_asset!.kind != MediaKind.image)
            Row(
              children: [
                const Icon(Icons.volume_up_outlined, size: 20),
                Expanded(
                  child: Slider(
                    value: _clip!.volume,
                    onChanged: (value) {
                      setState(() => _clip!.volume = value);
                      _video?.setVolume(value);
                      _audio?.setVolume(value);
                    },
                    onChangeEnd: (_) => _persist(),
                  ),
                ),
                Text('${(_clip!.volume * 100).round()}%'),
              ],
            ),
        ],
      ),
    ),
  );
  Widget _timelineLane(MediaKind kind) {
    final project = _project!,
        clips = project.clips
            .where(
              (clip) =>
                  (project.assetFor(clip).kind == MediaKind.audio) ==
                  (kind == MediaKind.audio),
            )
            .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(
            kind == MediaKind.audio ? 'A1 · Music' : 'V1 · Video & photos',
            style: const TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ),
        SizedBox(
          height: 116,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: clips.length,
            separatorBuilder: (_, index) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final clip = clips[index],
                  asset = project.assetFor(clip),
                  selected = clip.id == _clip?.id;
              return Container(
                width: 180,
                decoration: BoxDecoration(
                  color: kind == MediaKind.audio
                      ? const Color(0xff173c3b)
                      : const Color(0xff36265c),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected
                        ? const Color(0xffb89bff)
                        : Colors.transparent,
                    width: 2,
                  ),
                ),
                child: Column(
                  children: [
                    Expanded(
                      child: ListTile(
                        dense: true,
                        title: Text(
                          asset.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(timeLabel(clip.durationMs)),
                        onTap: () => _select(asset, clip: clip),
                      ),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        IconButton(
                          tooltip: 'Move clip earlier',
                          onPressed: index == 0
                              ? null
                              : () {
                                  project.moveClip(
                                    project.clips.indexOf(clip),
                                    project.clips.indexOf(clips[index - 1]),
                                  );
                                  setState(() {});
                                  _persist();
                                },
                          icon: const Icon(Icons.chevron_left, size: 18),
                        ),
                        IconButton(
                          tooltip: 'Remove clip from timeline',
                          onPressed: () {
                            project.clips.remove(clip);
                            if (_clip?.id == clip.id) {
                              _clip = null;
                              _pause();
                            }
                            setState(() {});
                            _persist();
                          },
                          icon: const Icon(Icons.close, size: 18),
                        ),
                        IconButton(
                          tooltip: 'Move clip later',
                          onPressed: index == clips.length - 1
                              ? null
                              : () {
                                  project.moveClip(
                                    project.clips.indexOf(clip),
                                    project.clips.indexOf(clips[index + 1]),
                                  );
                                  setState(() {});
                                  _persist();
                                },
                          icon: const Icon(Icons.chevron_right, size: 18),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _showProjects() async {
    await _pause();
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog.fullscreen(
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Projects'),
            leading: IconButton(
              tooltip: 'Close projects',
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.pop(dialogContext),
            ),
          ),
          body: _projectsView(onOpened: () => Navigator.pop(dialogContext)),
        ),
      ),
    );
  }

  Widget _projectsView({VoidCallback? onOpened}) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Text('Your projects', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 8),
      const Text(
        'Stored on this device, with media kept inside the app.',
        style: TextStyle(color: Colors.white60),
      ),
      const SizedBox(height: 20),
      Wrap(
        spacing: 12,
        runSpacing: 8,
        children: [
          FilledButton.icon(
            onPressed: () {
              onOpened?.call();
              _newProject();
            },
            icon: const Icon(Icons.add),
            label: const Text('New project'),
          ),
          OutlinedButton.icon(
            onPressed: () {
              onOpened?.call();
              _restore();
            },
            icon: const Icon(Icons.restore),
            label: const Text('Restore backup'),
          ),
        ],
      ),
      const SizedBox(height: 20),
      for (final project in _projects)
        Card(
          child: ListTile(
            contentPadding: const EdgeInsets.all(16),
            leading: const Icon(
              Icons.movie_creation_outlined,
              color: Color(0xffb89bff),
            ),
            title: Text(project.name),
            subtitle: Text(
              '${project.clips.length} clips · ${timeLabel(project.durationMs)}',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              onOpened?.call();
              _openProject(project);
            },
          ),
        ),
    ],
  );
  Widget _vanessaView() => Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.auto_awesome, color: Color(0xffb89bff)),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'Vanessa · Creative assistant',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            IconButton(
              tooltip: 'Connection settings',
              onPressed: _settings,
              icon: const Icon(Icons.tune),
            ),
          ],
        ),
      ),
      Expanded(
        child: _messages.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: _EmptyCard(
                    icon: Icons.auto_awesome_outlined,
                    title: 'Make your next idea happen',
                    text: 'Ask for scripts, music direction, or editing ideas. Chat gives advice; it does not change the timeline.',
                  ),
                ),
              )
            : ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final message = _messages[index],
                      user = message['role'] == 'user';
                  return Align(
                    alignment: user
                        ? Alignment.centerRight
                        : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(16),
                      constraints: const BoxConstraints(maxWidth: 600),
                      decoration: BoxDecoration(
                        color: user
                            ? const Color(0xff352459)
                            : const Color(0xff1d1d29),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: SelectableText(message['content']!),
                    ),
                  );
                },
              ),
      ),
      if (_chatBusy) const LinearProgressIndicator(),
      if (_chatError != null)
        Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            _chatError!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _message,
                focusNode: _messageFocus,
                minLines: 1,
                maxLines: 4,
                maxLength: 4000,
                decoration: const InputDecoration(
                  hintText: 'Ask Vanessa…',
                  counterText: '',
                ),
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: 'Send message',
              onPressed: _chatBusy ? null : _sendMessage,
              icon: const Icon(Icons.arrow_upward),
            ),
          ],
        ),
      ),
    ],
  );
  IconData _mediaIcon(MediaKind kind) => switch (kind) {
    MediaKind.video => Icons.videocam_outlined,
    MediaKind.audio => Icons.music_note_outlined,
    MediaKind.image => Icons.image_outlined,
  };
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({
    required this.icon,
    required this.title,
    required this.text,
  });
  final IconData icon;
  final String title, text;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: const Color(0xff191924),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 34, color: const Color(0xffb89bff)),
        const SizedBox(height: 12),
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white60),
        ),
      ],
    ),
  );
}
