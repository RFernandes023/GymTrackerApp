import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { calculateBmi, calculateBmr, calculateTdee, toDateKey, type ActivityLevel, type Goal as GoalKind, type MacroTargets } from '@gym/shared';
import { AppText, Button, Card, Screen, ScreenHeader } from '../../components/ui';
import { Chip, ChipRow, Stepper } from '../../components/form';
import { useAuth } from '../../store/authStore';
import { estimateFromProfile, getGoal, getProfile, saveProfile, setGoal } from '../../features/nutrition/nutritionRepo';
import type { Profile } from '../../features/nutrition/types';
import { colors, spacing } from '../../theme/tokens';

const ACTIVITY: [ActivityLevel, string][] = [['sedentary', 'Sedentário'], ['light', 'Leve (1–3×/sem)'], ['moderate', 'Moderado (3–5×/sem)'], ['high', 'Intenso (6–7×/sem)'], ['athlete', 'Atleta (2×/dia)']];
const GOALS: [GoalKind, string][] = [['fat_loss', 'Perda de gordura'], ['maintenance', 'Manutenção'], ['muscle_gain', 'Ganho de massa muscular'], ['recomposition', 'Recomposição corporal']];
const DEFAULT: Profile = { sex: 'male', age: 30, heightCm: 175, weightKg: 75, activity: 'moderate', goal: 'maintenance' };

export default function Goals() {
  const user = useAuth((s) => s.user)!;
  const [profile, setProfile] = useState<Profile>(DEFAULT);
  const [est, setEst] = useState<(MacroTargets & { bmr: number; tdee: number; bmi: number }) | null>(null);
  const [target, setTarget] = useState<MacroTargets | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    const p = await getProfile(user.id); if (p) setProfile(p);
    const g = await getGoal(user.id, toDateKey(Date.now()));
    if (g) { setTarget({ calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat }); setSaved(g.startDate); }
  })(); }, [user.id]);

  const calculate = async () => {
    const t = estimateFromProfile(profile);
    const bmr = calculateBmr(profile);
    setEst({ ...t, bmr, tdee: calculateTdee(bmr, profile.activity), bmi: calculateBmi(profile.weightKg, profile.heightCm) });
    setTarget(t); await saveProfile(user.id, profile);
  };
  const upd = <K extends keyof Profile>(k: K, v: Profile[K]) => { setProfile({ ...profile, [k]: v }); setEst(null); };
  const macroKcal = target ? Math.round(target.protein * 4 + target.carbs * 4 + target.fat * 9) : 0;

  const save = async () => {
    if (!target) return;
    try { setError(null); await setGoal(user.id, target); setSaved(toDateKey(Date.now())); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Objetivos" />
        <Card style={{ gap: spacing.md }}>
          <AppText variant="h2">O teu perfil</AppText>
          <AppText variant="small" muted>O sexo é usado apenas na fórmula Mifflin-St Jeor.</AppText>
          <ChipRow><Chip label="Homem" selected={profile.sex === 'male'} onPress={() => upd('sex', 'male')} /><Chip label="Mulher" selected={profile.sex === 'female'} onPress={() => upd('sex', 'female')} /></ChipRow>
          <Stepper label="Idade (anos)" value={profile.age} step={1} min={14} max={100} format={(n) => String(Math.round(n))} onChange={(v) => upd('age', Math.round(v))} />
          <Stepper label="Altura (cm)" value={profile.heightCm} step={1} min={100} max={250} onChange={(v) => upd('heightCm', v)} />
          <Stepper label="Peso (kg)" value={profile.weightKg} step={0.5} min={30} max={300} onChange={(v) => upd('weightKg', v)} />
          <AppText variant="small" muted>Nível de atividade</AppText>
          <ChipRow>{ACTIVITY.map(([k, l]) => <Chip key={k} label={l} selected={profile.activity === k} onPress={() => upd('activity', k)} />)}</ChipRow>
          <AppText variant="small" muted>Objetivo físico</AppText>
          <ChipRow>{GOALS.map(([k, l]) => <Chip key={k} label={l} selected={profile.goal === k} onPress={() => upd('goal', k)} />)}</ChipRow>
          <Button label="Calcular estimativa" onPress={() => void calculate()} />
        </Card>

        {est && (
          <Card style={{ gap: spacing.xs, borderColor: colors.accent }}>
            <AppText variant="small" style={{ color: colors.accent }}>ESTIMATIVA — não é aconselhamento médico</AppText>
            <AppText>Metabolismo basal: ~{est.bmr} kcal · Gasto diário: ~{est.tdee} kcal · IMC: {est.bmi}</AppText>
            <AppText variant="small" muted>Estimativas por fórmulas gerais (Mifflin-St Jeor). Ajusta conforme a tua resposta real ao longo das semanas.</AppText>
          </Card>
        )}

        {target && (
          <Card style={{ gap: spacing.md }}>
            <AppText variant="h2">Objetivos diários</AppText>
            <Stepper label="Calorias (kcal)" value={target.calories} step={50} min={800} max={10000} format={(n) => String(Math.round(n))} onChange={(v) => setTarget({ ...target, calories: Math.round(v) })} />
            <Stepper label="Proteínas (g)" value={target.protein} step={5} min={0} max={1000} format={(n) => String(Math.round(n))} onChange={(v) => setTarget({ ...target, protein: Math.round(v) })} />
            <Stepper label="Hidratos de carbono (g)" value={target.carbs} step={5} min={0} max={1000} format={(n) => String(Math.round(n))} onChange={(v) => setTarget({ ...target, carbs: Math.round(v) })} />
            <Stepper label="Gorduras (g)" value={target.fat} step={2} min={0} max={1000} format={(n) => String(Math.round(n))} onChange={(v) => setTarget({ ...target, fat: Math.round(v) })} />
            <AppText variant="small" muted>Os macros somam {macroKcal} kcal{Math.abs(macroKcal - target.calories) > 50 ? ` (difere das ${target.calories} kcal definidas)` : ''}.</AppText>
            {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
            <Button label="Guardar objetivos" onPress={() => void save()} />
            {saved ? <AppText variant="small" muted>Objetivos em vigor desde {saved}. Os objetivos nunca mudam sem a tua confirmação.</AppText> : null}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
