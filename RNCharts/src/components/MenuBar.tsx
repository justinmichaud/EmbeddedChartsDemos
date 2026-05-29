import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, MONO } from '../theme';
import { state } from '../simulation';
import { toggleLag } from '../store';

interface Props {
  onSettings: () => void;
  onRecover: () => void;
}

export function MenuBar({ onSettings, onRecover }: Props) {
  const [lagOn, setLagOn] = useState(false);
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());
  const [fps, setFps] = useState(0);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  // FPS via requestAnimationFrame (exists in RN).
  const frames = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      frames.current++;
      if (!last.current) last.current = t;
      if (t - last.current >= 1000) {
        setFps(frames.current);
        frames.current = 0;
        last.current = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <Text style={styles.logo}>MKTTERM</Text>
        <Text style={styles.dim}>{time}</Text>
        <Text style={styles.dim}>
          <Text style={{ color: C.greenBright }}>{fps}</Text> fps
        </Text>
        <Text style={styles.dim}>
          lag <Text style={{ color: C.amber }}>{state.lagMs.toFixed(1)}</Text> ms
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={styles.ccy}>{state.settings.currency}</Text>
        <TouchableOpacity style={styles.btn} onPress={onSettings}>
          <Text style={styles.btnText}>SETTINGS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, lagOn && { borderColor: C.orange }]}
          onPress={() => setLagOn(toggleLag())}
        >
          <Text style={[styles.btnText, lagOn && { color: C.orange }]}>
            {lagOn ? 'LAG ON' : 'LAG'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={onRecover}>
          <Text style={styles.btnText}>RECOVER</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.panel,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { fontFamily: MONO, color: C.blue, fontWeight: '700', fontSize: 12 },
  dim: { fontFamily: MONO, color: C.textMuted, fontSize: 10 },
  ccy: { fontFamily: MONO, color: C.textDim, fontSize: 10 },
  btn: { borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 2 },
  btnText: { fontFamily: MONO, color: C.textMuted, fontSize: 10 },
});
