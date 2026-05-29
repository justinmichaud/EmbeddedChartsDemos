import { View, Text, StyleSheet } from 'react-native';
import { C, MONO } from '../theme';
import { NEWS_HEADLINES, state } from '../simulation';

export function NewsView() {
  const n = NEWS_HEADLINES.length;
  const visible = [0, 1, 2].map((offset) => ({
    text: NEWS_HEADLINES[(state.newsIndex - offset + n) % n],
    age: offset,
  }));

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Text style={styles.label}>NEWSFEED</Text>
        <Text style={styles.live}>LIVE</Text>
      </View>
      {visible.map(({ text, age }, i) => (
        <View key={i} style={[styles.row, i > 0 && styles.divider]}>
          <Text style={[styles.marker, { color: age === 0 ? C.text : C.textMuted }]}>
            {age === 0 ? '▶' : ' '}
          </Text>
          <Text style={[styles.text, { color: age === 0 ? '#d1d5db' : C.textMuted }]}>
            {text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginHorizontal: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.panel },
  head: {
    paddingHorizontal: 8, paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  label: { fontFamily: MONO, color: C.blue, fontWeight: '700', fontSize: 9 },
  live: { fontFamily: MONO, color: C.textMuted, fontSize: 8 },
  row: { paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { borderTopWidth: 1, borderTopColor: C.border },
  marker: { fontFamily: MONO, fontSize: 8 },
  text: { fontFamily: MONO, fontSize: 9, flexShrink: 1 },
});
