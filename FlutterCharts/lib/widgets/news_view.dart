import 'package:flutter/material.dart';

import '../sim/simulation.dart';
import '../theme.dart';

/// The three rotating headlines (newest marked with ▶), advancing every 10 s.
/// Read straight from sim.newsIndex on each rebuild.
class NewsView extends StatelessWidget {
  const NewsView({super.key});

  @override
  Widget build(BuildContext context) {
    final n = kNewsHeadlines.length;
    final visible = [0, 1, 2]
        .map((offset) => (
              text: kNewsHeadlines[(sim.newsIndex - offset + n) % n],
              age: offset,
            ))
        .toList();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: C.panel,
        border: Border.all(color: C.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: C.border)),
            ),
            child: Row(
              children: [
                Text('NEWSFEED',
                    style: mono(size: 9, color: C.blue, weight: FontWeight.w700)),
                const SizedBox(width: 8),
                Text('LIVE', style: mono(size: 8, color: C.textMuted)),
              ],
            ),
          ),
          for (var i = 0; i < visible.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                border: i > 0
                    ? const Border(top: BorderSide(color: C.border))
                    : null,
              ),
              child: Row(
                children: [
                  Text(
                    visible[i].age == 0 ? '▶' : ' ',
                    style: mono(
                        size: 8,
                        color:
                            visible[i].age == 0 ? C.text : C.textMuted),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      visible[i].text,
                      style: mono(
                          size: 9,
                          color: visible[i].age == 0
                              ? C.newsActive
                              : C.textMuted),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
