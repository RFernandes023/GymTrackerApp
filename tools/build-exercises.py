#!/usr/bin/env python3
"""Gera mobile/assets/exercises.json a partir do Free Exercise DB (Unlicense / domínio público).
Uso: curl -o /tmp/ex.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
     python3 tools/build-exercises.py /tmp/ex.json"""
import json, sys, collections
src = json.load(open(sys.argv[1]))
MUSCLE = {'chest':'chest','lats':'back','middle back':'back','lower back':'back','traps':'back','shoulders':'shoulders',
 'biceps':'biceps','triceps':'triceps','forearms':'forearms','abdominals':'abs','quadriceps':'quads','hamstrings':'hamstrings',
 'glutes':'glutes','calves':'calves','adductors':'adductors','abductors':'abductors'}
EQUIP = {'barbell':'barbell','dumbbell':'dumbbell','machine':'machine','cable':'cable','body only':'bodyweight',
 'kettlebells':'kettlebell','bands':'bands','e-z curl bar':'barbell'}
PT = {
'Barbell_Bench_Press_-_Medium_Grip':'Supino plano com barra','Barbell_Incline_Bench_Press_-_Medium_Grip':'Supino inclinado com barra',
'Dumbbell_Bench_Press':'Supino plano com halteres','Incline_Dumbbell_Press':'Supino inclinado com halteres',
'Dumbbell_Flyes':'Aberturas com halteres','Incline_Dumbbell_Flyes':'Aberturas inclinadas com halteres','Butterfly':'Peck deck (borboleta)',
'Dips_-_Chest_Version':'Paralelas (peito)','Dips_-_Triceps_Version':'Paralelas (tríceps)','Bench_Dips':'Mergulhos no banco',
'Barbell_Squat':'Agachamento com barra','Barbell_Full_Squat':'Agachamento completo com barra','Front_Barbell_Squat':'Agachamento frontal com barra',
'Bodyweight_Squat':'Agachamento com peso corporal','Dumbbell_Squat':'Agachamento com halteres','Leg_Press':'Prensa de pernas',
'Leg_Extensions':'Extensão de pernas','Lying_Leg_Curls':'Flexão de pernas deitado','Seated_Leg_Curl':'Flexão de pernas sentado',
'Barbell_Deadlift':'Levantamento terra','Romanian_Deadlift':'Levantamento terra romeno','Stiff-Legged_Barbell_Deadlift':'Levantamento terra com pernas rígidas',
'Barbell_Hip_Thrust':'Elevação de anca com barra','Barbell_Lunge':'Passada com barra','Dumbbell_Lunges':'Passadas com halteres',
'Barbell_Walking_Lunge':'Passada andando com barra','Standing_Calf_Raises':'Elevação de gémeos em pé','Seated_Calf_Raise':'Elevação de gémeos sentado',
'Bent_Over_Barbell_Row':'Remada curvada com barra','Bent_Over_Two-Dumbbell_Row':'Remada curvada com halteres','Wide-Grip_Lat_Pulldown':'Puxada na polia (pega larga)',
'Close-Grip_Front_Lat_Pulldown':'Puxada na polia (pega fechada)','V-Bar_Pulldown':'Puxada com pega em V','Face_Pull':'Face pull',
'Pullups':'Elevações (pull-ups)','Chin-Up':'Elevações com pega supinada','Seated_Cable_Rows':'Remada sentado na polia',
'Barbell_Shrug':'Encolhimento com barra','Dumbbell_Shrug':'Encolhimento com halteres','Straight-Arm_Pulldown':'Pullover na polia com braços esticados',
'Barbell_Shoulder_Press':'Press de ombros com barra','Dumbbell_Shoulder_Press':'Press de ombros com halteres','Side_Lateral_Raise':'Elevação lateral com halteres',
'Cable_Seated_Lateral_Raise':'Elevação lateral na polia','Front_Incline_Dumbbell_Raise':'Elevação frontal inclinada com halteres','Reverse_Flyes':'Aberturas inversas',
'Barbell_Curl':'Rosca direta com barra','Alternate_Hammer_Curl':'Rosca martelo alternada','Concentration_Curls':'Rosca concentrada',
'Cable_Preacher_Curl':'Rosca Scott na polia','Triceps_Pushdown':'Extensão de tríceps na polia','Triceps_Pushdown_-_Rope_Attachment':'Extensão de tríceps na polia com corda',
'Cable_Rope_Overhead_Triceps_Extension':'Extensão de tríceps acima da cabeça com corda','Lying_Triceps_Press':'Extensão de tríceps deitado (skull crusher)',
'Close-Grip_Barbell_Bench_Press':'Supino pega fechada','Push-Up_Wide':'Flexões pega larga','Decline_Push-Up':'Flexões declinadas',
'Plank':'Prancha','Crunches':'Abdominais (crunch)','Cable_Crunch':'Crunch na polia','Hanging_Leg_Raise':'Elevação de pernas suspenso','Ab_Crunch_Machine':'Máquina de abdominais',
'Smith_Machine_Squat':'Agachamento no Smith','Smith_Machine_Calf_Raise':'Elevação de gémeos no Smith','Good_Morning':'Good morning',
'Hack_Squat':'Hack squat','Barbell_Hack_Squat':'Hack squat com barra','Wrist_Curl':'Flexão de punho','Hip_Adduction_Machine':'Máquina de adutores','Thigh_Abductor':'Máquina de abdutores',
}
out, used = [], 0
for e in src:
    if e['category'] not in ('strength','powerlifting'): continue
    prim = sorted({MUSCLE[m] for m in e['primaryMuscles'] if m in MUSCLE})
    if not prim: continue
    sec = sorted({MUSCLE[m] for m in e['secondaryMuscles'] if m in MUSCLE} - set(prim))
    pt = PT.get(e['id']); used += bool(pt)
    out.append({'id':e['id'],'en':e['name'],'pt':pt,'primary':prim,'secondary':sec,'equipment':EQUIP.get(e['equipment'],'other'),
      'type':e.get('mechanic'),'instructions':e['instructions'],'images':e['images']})
json.dump(out, open('mobile/assets/exercises.json','w'), ensure_ascii=False, separators=(',',':'))
print(len(out),'exercícios;',used,'com nome PT;','sem PT:',[k for k in PT if k not in {e['id'] for e in out}])
print(collections.Counter(m for e in out for m in e['primary']))
