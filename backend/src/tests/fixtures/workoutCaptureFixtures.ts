export const CANONICAL_WORKOUT = `Warm-up

* 5-minute incline walk
* Band pull-aparts
* External rotations
* Incline Smith press
    * 2 ramp-up sets

Chest

1. Incline Smith Machine Press

* Worked up to 25 kg per side
* Then reduced to 20 kg per side
* Completed 8 reps on the reduced-weight set

2. Incline Dumbbell Press

* Started with 15 kg dumbbells
* Increased to 20 kg dumbbells for the working sets

3. Pec Deck

* 7 sets
* Around 10–12 reps per set
* Short-rest, FST-7 style

4. Cable Flyes

* Additional chest isolation work
* Used as part of the chest finishing work

Back

5. Seated Cable Row

* Multiple working sets
* One recorded set: 18 reps
* Around RPE 9

6. Wide-Grip Lat Pulldown

* First weight felt too light
* Increased to 59 kg
* 7 sets
* Around 12 reps per set
* Short rests

7. Straight-Arm Pulldown

* 7 sets
* 10–12 reps
* Short rests

8. Face Pulls

* 30 reps to finish the back work

Arms finisher

9. Tricep Pulldown

* 3 sets
* Tried 11.3 kg per side
* Felt too heavy
* Reduced to 9 kg per side
* Finished the working sets there

10. Cable Bicep Curl

* 3 sets
* Supersetted/alternated with the tricep pulldowns
* Increased the weight as you went`;

export const WORKOUT_CAPTURE_FIXTURES = {
  structured: `Bench press 80kg 3x8
Lat pulldown 55kg 3x12
Leg press 140kg 4x10`,
  shorthand: `bench 60 x 10
70 x 8
75 x 6

incline db
20s x 10
22.5s x 8`,
  spoken: `Did squats today.

Warm-up bar first, then 60 kilos for ten, 80 kilos for eight and 100 kilos for five.

After that I did leg extensions for four sets around twelve reps.

Finished with walking lunges, three sets.`,
  superset: `Superset:

Cable curl 15kg 3x12
Rope pushdown 20kg 3x12

60 sec rest between rounds`,
  dropSet: `Lateral raises
12kg x 10
10kg x 8
8kg x 10
6kg x 12

all one drop set`,
  bodyweight: `Pull-ups
3 sets
8, 7, 6 reps

Dips
bodyweight
12, 10, 9`,
  assisted: `Assisted pull-up
40kg assistance
3x10`,
  perSide: `Smith squat
20kg per side
4 sets of 8`,
  dumbbell: `DB shoulder press
22.5kg each hand
3x10`,
  conditioning: `Treadmill incline walk
15 mins

Sled pushes
6 rounds

Bike
10 minutes moderate pace`,
  circuit: `4 rounds

10 kettlebell swings 24kg
12 box jumps
15 calorie row
60 sec rest`,
  amrap: `10 minute AMRAP

5 pull ups
10 push ups
15 air squats`,
  rir: `Bench press
80kg
3x6
around 2 RIR`,
  incomplete: `Chest today

Incline press heavy
maybe 4 sets

some flyes

finished with pushups`,
  ambiguous: `Leg press
180kg I think
maybe 10 reps
3 or 4 sets`,
  correction: `Lat pulldown 50kg
actually 55kg
3 sets of 10`,
  mixedUnits: `Bench 135 lb 3x8
Cable curl 12.5 kg 3x12`,
  noNumbers: `Chest and back.

Bench press
Cable fly
Rows
Lat pulldown

Good session.`,
  messyDictation: `okay bench press first 60 kilos ten reps then seventy for eight then eighty got six reps then incline dumbbell twenty kilos I think three sets around ten then pec deck seven rounds short rest maybe twelve each`,
  nonWorkoutNumbers: `Worked out at 7pm.

Bench press
60kg
3x10

Gym was packed, waited 15 minutes for the machine.`
} as const;

