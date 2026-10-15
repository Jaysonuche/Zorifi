import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hotkey_manager/hotkey_manager.dart';
import 'package:window_manager/window_manager.dart';

class DesktopIntegration {
  static bool get supported =>
      Platform.isWindows || Platform.isMacOS || Platform.isLinux;
  static Future<void> initializeWindow() async {
    if (!supported) return;
    await windowManager.ensureInitialized();
    await windowManager.waitUntilReadyToShow(
      const WindowOptions(
        size: Size(1200, 800),
        minimumSize: Size(500, 700),
        center: true,
        backgroundColor: Color(0xff121212),
        skipTaskbar: false,
        titleBarStyle: TitleBarStyle.normal,
        title: 'Zorifi - AI & Media Suite',
      ),
    );
    await windowManager.show();
    await windowManager.focus();
  }

  final HotKey _shortcut = HotKey(
    key: PhysicalKeyboardKey.keyV,
    modifiers: [HotKeyModifier.control, HotKeyModifier.shift],
    scope: HotKeyScope.system,
  );
  bool _disposed = false, _registered = false;
  Future<void> register(VoidCallback showAssistant) async {
    if (!supported || _disposed || _registered) return;
    await hotKeyManager.register(
      _shortcut,
      keyDownHandler: (_) async {
        if (_disposed) return;
        showAssistant();
        try {
          if (await windowManager.isMinimized()) await windowManager.restore();
          await windowManager.show();
          await windowManager.focus();
        } catch (error) {
          debugPrint('Could not foreground the Zorifi window: $error');
        }
      },
    );
    _registered = true;
    if (_disposed) await dispose();
  }

  Future<void> dispose() async {
    _disposed = true;
    if (_registered) {
      _registered = false;
      await hotKeyManager.unregister(_shortcut);
    }
  }
}
