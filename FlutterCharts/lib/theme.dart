// Palette ported verbatim from JSChartsFast's Tailwind hex classes, plus a
// monospace family matching the original's `font-mono` look.

import 'package:flutter/material.dart';

class C {
  static const bg = Color(0xFF0F1419);
  static const panel = Color(0xFF1A1F29);
  static const border = Color(0xFF2D3748);
  static const borderHover = Color(0xFF4B5563);
  static const text = Color(0xFFE6E8EB);
  static const textDim = Color(0xFF9CA3AF);
  static const textMuted = Color(0xFF6B7280);
  static const blue = Color(0xFF3B82F6);
  static const blueDim = Color(0xFF1E3A5F);
  static const green = Color(0xFF10B981);
  static const greenBright = Color(0xFF4ADE80);
  static const red = Color(0xFFEF4444);
  static const amber = Color(0xFFFACC15);
  static const orange = Color(0xFFF97316);
  static const grid = Color(0xFF2D3748);
  static const sweep = Color(0x8C63B3ED); // rgba(99,179,237,0.55)
  static const sweepTint = Color(0x123B82F6); // rgba(59,130,246,0.07)
  static const newsActive = Color(0xFFD1D5DB);
}

// A cross-platform monospace fallback chain. macOS resolves "Menlo"; Linux
// falls through to whatever the system maps "monospace" to (DejaVu/Liberation).
const List<String> kMonoFallback = [
  'Menlo',
  'DejaVu Sans Mono',
  'Liberation Mono',
  'Consolas',
  'monospace',
];

TextStyle mono({
  double size = 10,
  Color color = C.text,
  FontWeight weight = FontWeight.w400,
  double? height,
}) {
  return TextStyle(
    fontFamilyFallback: kMonoFallback,
    fontSize: size,
    color: color,
    fontWeight: weight,
    height: height,
  );
}
