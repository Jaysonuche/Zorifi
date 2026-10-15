import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hotkey_manager/hotkey_manager.dart';
import 'package:zorifi/desktop_integration.dart';

class FakeHotkeys extends HotKeyManagerPlatform {
  final events = StreamController<Map<Object?, Object?>>.broadcast();
  final registered = <HotKey>[];
  final removed = <String>[];
  Completer<void>? pending;
  @override
  Stream<Map<Object?, Object?>> get onKeyEventReceiver => events.stream;
  @override
  Future<void> register(HotKey hotKey) async {
    registered.add(hotKey);
    await pending?.future;
  }

  @override
  Future<void> unregister(HotKey hotKey) async =>
      removed.add(hotKey.identifier);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final platform = FakeHotkeys();
  final windowCalls = <String>[];
  setUpAll(() {
    HotKeyManagerPlatform.instance = platform;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('window_manager'), (
          call,
        ) async {
          windowCalls.add(call.method);
          return call.method == 'isMinimized' ? true : null;
        });
  });
  setUp(() {
    platform.registered.clear();
    platform.removed.clear();
    platform.pending = null;
    windowCalls.clear();
  });
  tearDownAll(() async {
    await platform.events.close();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('window_manager'), null);
  });

  test(
    'shortcut selects assistant, restores window and unregisters only itself',
    () async {
      var shown = 0;
      final integration = DesktopIntegration();
      await integration.register(() => shown++);
      final key = platform.registered.single;
      expect(key.physicalKey, PhysicalKeyboardKey.keyV);
      expect(key.modifiers, [HotKeyModifier.control, HotKeyModifier.shift]);
      platform.events.add({
        'type': 'onKeyDown',
        'data': {'identifier': key.identifier},
      });
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(shown, 1);
      expect(
        windowCalls,
        containsAllInOrder(['isMinimized', 'restore', 'show', 'focus']),
      );
      await integration.dispose();
      expect(platform.removed, [key.identifier]);
      platform.events.add({
        'type': 'onKeyDown',
        'data': {'identifier': key.identifier},
      });
      await Future<void>.delayed(Duration.zero);
      expect(shown, 1);
    },
  );

  test(
    'dispose during registration cleans up after native registration completes',
    () async {
      platform.pending = Completer<void>();
      final integration = DesktopIntegration();
      final registration = integration.register(
        () => fail('Disposed shortcut fired'),
      );
      await integration.dispose();
      platform.pending!.complete();
      await registration;
      expect(platform.removed, [platform.registered.single.identifier]);
    },
  );
}
