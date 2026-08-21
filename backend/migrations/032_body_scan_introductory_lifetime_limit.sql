create unique index if not exists body_composition_scans_introductory_user_unique_idx
  on body_composition_scans(user_id)
  where experience_scope = 'introductory' and user_confirmed = true;
