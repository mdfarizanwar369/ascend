create table if not exists body_composition_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scan_date date not null,
  machine text,
  weight_kg numeric(6,2),
  bmi numeric(5,2),
  body_fat_percent numeric(5,2),
  fat_mass_kg numeric(6,2),
  lean_body_mass_kg numeric(6,2),
  estimated_lean_body_mass_kg numeric(6,2),
  skeletal_muscle_mass_kg numeric(6,2),
  muscle_mass_kg numeric(6,2),
  visceral_fat numeric(6,2),
  body_water_percent numeric(5,2),
  protein_percent numeric(5,2),
  mineral_percent numeric(5,2),
  bone_mass_kg numeric(6,2),
  bmr_kcal integer,
  metabolic_age integer,
  segmental_muscle jsonb not null default '{}'::jsonb,
  segmental_fat jsonb not null default '{}'::jsonb,
  confidence_score numeric(4,3),
  missing_fields text[] not null default '{}',
  notes text,
  import_source text not null,
  source_images jsonb not null default '[]'::jsonb,
  user_confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_scan_machine_length check (machine is null or char_length(machine) <= 120),
  constraint body_scan_weight_range check (weight_kg is null or weight_kg between 20 and 400),
  constraint body_scan_bmi_range check (bmi is null or bmi between 8 and 80),
  constraint body_scan_body_fat_range check (body_fat_percent is null or body_fat_percent between 1 and 75),
  constraint body_scan_mass_range check (
    (fat_mass_kg is null or fat_mass_kg between 0 and 250) and
    (lean_body_mass_kg is null or lean_body_mass_kg between 10 and 250) and
    (estimated_lean_body_mass_kg is null or estimated_lean_body_mass_kg between 10 and 250) and
    (skeletal_muscle_mass_kg is null or skeletal_muscle_mass_kg between 5 and 120) and
    (muscle_mass_kg is null or muscle_mass_kg between 5 and 180) and
    (bone_mass_kg is null or bone_mass_kg between 1 and 20)
  ),
  constraint body_scan_percent_range check (
    (body_water_percent is null or body_water_percent between 20 and 80) and
    (protein_percent is null or protein_percent between 5 and 35) and
    (mineral_percent is null or mineral_percent between 1 and 15)
  ),
  constraint body_scan_bmr_range check (bmr_kcal is null or bmr_kcal between 700 and 5000),
  constraint body_scan_metabolic_age_range check (metabolic_age is null or metabolic_age between 10 and 100),
  constraint body_scan_confidence_range check (confidence_score is null or confidence_score between 0 and 1),
  constraint body_scan_import_source_value check (import_source in ('ai_import', 'manual_entry')),
  constraint body_scan_notes_length check (notes is null or char_length(notes) <= 2000)
);

create index if not exists body_composition_scans_user_date_idx on body_composition_scans(user_id, scan_date desc, created_at desc);
create index if not exists body_composition_scans_user_created_idx on body_composition_scans(user_id, created_at desc);
