import 'package:flutter/material.dart';
import 'package:video_player_media_kit/video_player_media_kit.dart';

import 'workspace.dart';
import 'desktop_integration.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  VideoPlayerMediaKit.ensureInitialized(windows: true, linux: true);
  runApp(const ZorifiMobileApp());
  try {
    await DesktopIntegration.initializeWindow();
  } catch (error) {
    debugPrint('Desktop window configuration unavailable: $error');
  }
}

class ZorifiMobileApp extends StatelessWidget {
  const ZorifiMobileApp({super.key, this.home = const Workspace()});
  final Widget home;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Zorifi',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: const ColorScheme.dark(
          primary: Colors.deepPurpleAccent,
          secondary: Colors.cyanAccent,
        ),
        scaffoldBackgroundColor: const Color(0xff121212),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: Color(0xff1e1e1e),
          indicatorColor: Color(0xff174e51),
          iconTheme: WidgetStateProperty.resolveWith(
            (states) => IconThemeData(
              color: states.contains(WidgetState.selected)
                  ? Colors.cyanAccent
                  : Colors.grey,
            ),
          ),
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => TextStyle(
              fontSize: 12,
              color: states.contains(WidgetState.selected)
                  ? Colors.cyanAccent
                  : Colors.grey,
            ),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      home: home,
    );
  }
}
