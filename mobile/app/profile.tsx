import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { LEVEL_LABELS, type TrainingLevel } from '@gym/shared';
import { AppText, Button, Card, Screen, ScreenHeader } from '../components/ui';
import { Chip, ChipRow, Stepper } from '../components/form';
import { useAuth } from '../store/authStore';
import { getBodyInfo, getLevel, saveBasics, setLevel } from '../features/profile/profileRepo';
import { colors, spacing } from '../theme/tokens';

export default function ProfileScreen() {
  const user = useAuth((s) => s.user)!;
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState(30);
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(75);
  const [level, setLvl] = useState<TrainingLevel>('novice');
  const [saved, setSaved] = useState(false);

  useEffect(() => { void (async () => {
    const b = await getBodyInfo(user.id);
    if (b) { setSex(b.sex); setAge(b.age); setHeight(b.heightCm); setWeight(b.weightKg); }
    setLvl(await getLevel(user.id));
  })(); }, [user.id]);

  const save = async () => { await saveBasics(user.id, { sex, age, heightCm: height, weightKg: weight }); await setLevel(user.id, level); setSaved(true); };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <ScreenHeader title="Perfil corporal" />
        <AppText variant="small" muted>Usado para sugerir cargas iniciais, calcular o IMC e as estimativas de gordura/músculo e as necessidades calóricas. Fica no teu dispositivo e na tua conta.</AppText>
        <Card style={{ gap: spacing.md }}>
          <AppText variant="small" muted>Sexo (usado nas fórmulas)</AppText>
          <ChipRow><Chip label="Homem" selected={sex === 'male'} onPress={() => { setSex('male'); setSaved(false); }} /><Chip label="Mulher" selected={sex === 'female'} onPress={() => { setSex('female'); setSaved(false); }} /></ChipRow>
          <Stepper label="Idade (anos)" value={age} step={1} min={14} max={100} format={(n) => String(Math.round(n))} onChange={(v) => { setAge(Math.round(v)); setSaved(false); }} />
          <Stepper label="Altura (cm)" value={height} step={1} min={100} max={250} onChange={(v) => { setHeight(v); setSaved(false); }} />
          <Stepper label="Peso (kg)" value={weight} step={0.5} min={30} max={300} onChange={(v) => { setWeight(v); setSaved(false); }} />
          <AppText variant="small" muted>Experiência de treino</AppText>
          <ChipRow>{(Object.keys(LEVEL_LABELS) as TrainingLevel[]).map((l) => <Chip key={l} label={LEVEL_LABELS[l]} selected={level === l} onPress={() => { setLvl(l); setSaved(false); }} />)}</ChipRow>
          <AppText variant="small" muted>O nível ajusta as cargas iniciais sugeridas (iniciante é o mais conservador).</AppText>
        </Card>
        <Button label="Guardar perfil" onPress={() => void save()} />
        {saved ? <AppText style={{ color: colors.primary }}>Perfil guardado.</AppText> : null}
      </ScrollView>
    </Screen>
  );
}
