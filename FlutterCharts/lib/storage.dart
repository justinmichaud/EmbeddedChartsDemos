// Settings persistence via a plain JSON file (zero native plugins). Replaces
// the web original's localStorage and the RN port's AsyncStorage. Using only
// dart:io keeps the app a single Flutter dependency-free binary that builds the
// same way on macOS and Linux — no CocoaPods / SwiftPM / platform channels.
//
// The file lives in the per-user config dir:
//   macOS:  ~/Library/Application Support/FlutterCharts/settings.json
//   Linux:  $XDG_CONFIG_HOME/FlutterCharts/settings.json  (or ~/.config/...)
// All operations are best-effort and never throw.

import 'dart:convert';
import 'dart:io';

import 'sim/simulation.dart';

class Storage {
  static File? _cached;

  static File? _file() {
    if (_cached != null) return _cached;
    final home = Platform.environment['HOME'];
    if (home == null || home.isEmpty) return null;
    String dir;
    if (Platform.isMacOS) {
      dir = '$home/Library/Application Support/FlutterCharts';
    } else {
      final xdg = Platform.environment['XDG_CONFIG_HOME'];
      final base = (xdg != null && xdg.isNotEmpty) ? xdg : '$home/.config';
      dir = '$base/FlutterCharts';
    }
    Directory(dir).createSync(recursive: true);
    return _cached = File('$dir/settings.json');
  }

  static Future<Settings> loadSettings() async {
    try {
      final f = _file();
      if (f == null || !await f.exists()) return defaultSettings();
      final map = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
      final s = defaultSettings();
      if (map['currency'] is String) s.currency = map['currency'] as String;
      if (map['numCharts'] is num) {
        s.numCharts = (map['numCharts'] as num).toInt();
      }
      return s;
    } catch (_) {
      return defaultSettings();
    }
  }

  static Future<void> saveSettings(Settings s) async {
    try {
      await _file()?.writeAsString(jsonEncode(s.toJson()));
    } catch (_) {
      // best-effort; non-fatal
    }
  }

  static Future<void> clear() async {
    try {
      final f = _file();
      if (f != null && await f.exists()) await f.delete();
    } catch (_) {
      // best-effort
    }
  }
}
