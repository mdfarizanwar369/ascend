with seed (
  gym_name,
  website,
  country,
  city,
  public_email,
  contact_person,
  owner_manager_name,
  linkedin_url,
  instagram_url,
  gym_size,
  pt_focus,
  existing_app,
  ai_fit_score,
  source_urls,
  research,
  email_drafts,
  note_body
) as (
  values
(
    'The Strength Yard',
    'https://www.thestrengthyard.com/',
    'Singapore',
    'Singapore',
    'support@thestrengthyard.com',
    null,
    null,
    null,
    'https://www.instagram.com/thestrengthyard/',
    '1',
    'Strength and Conditioning',
    'Uses booking tools; dedicated member app unknown',
    9,
    array['https://www.thestrengthyard.com/about/', 'https://www.thestrengthyard.com/open-gym-sign-up/']::text[],
    jsonb_build_object(
      'gymSummary', 'Neighbourhood strength and conditioning facility with personal training, classes, open gym access, and a strong strength culture.',
      'services', 'Personal training, strength classes, open gym, online coaching, retail.',
      'communityFocus', 'Strong',
      'technologyUsed', 'Booking tools visible; dedicated coaching/accountability app unknown.',
      'ptEmphasis', 'Strong',
      'estimatedSuitability', 9,
      'talkingPoints', jsonb_build_array('Ascend can help coaches see nutrition, workouts, hydration and consistency between strength sessions.', 'Good fit for strength clients tracking progress, PRs, body composition and accountability.', 'Position Ascend as a coaching layer rather than another booking app.'),
      'suggestedObjections', jsonb_build_array('Already has booking workflows.', 'May prefer simple tools for a strength-first audience.'),
      'bestOutreachAngle', 'Strength clients need accountability between coached sessions; Ascend gives coaches visibility without replacing their current programming or booking tools.'
    ),
    jsonb_build_object(
      'subject', 'Helping Strength Yard clients stay accountable between sessions',
      'coldEmail', 'Hi team,

I came across The Strength Yard and liked how focused the gym is on strength, proper coaching and long-term progression. Ascend helps trainers keep clients accountable between sessions with food logs, workouts, progress tracking, body scan insights and coach visibility.

It would sit alongside your current booking flow rather than replace it. Would you be open to a quick walkthrough to see whether a small accountability pilot makes sense?

Best,
Fariz',
      'followUp1', 'Hi team, just checking whether Ascend could be worth a quick look for your coached members. The goal is simple: help clients stay consistent during the days they are not with a coach.',
      'followUp2', '',
      'linkedinMessage', 'Hi, I’m building Ascend, a coaching accountability layer for gyms and trainers. The Strength Yard looks like a strong fit because of your strength coaching focus. Open to a quick demo?',
      'instagramDm', 'Hi team, love the strength-first coaching focus at The Strength Yard. I built Ascend to help trainers keep members accountable between sessions. Would a short walkthrough be useful?'
    ),
    'Public web research confirmed personal training/classes/open gym and public contact email. Strong boutique strength fit. Verify details before outreach.'
  ),
(
    'LEVEL Singapore',
    'https://level.com.sg/',
    'Singapore',
    'Singapore',
    'reception@level.com.sg',
    null,
    null,
    null,
    'https://www.instagram.com/levelsingapore/',
    '1',
    'Premium PT Studio',
    'Has LEVEL SG app / Mindbody listing',
    8,
    array['https://level.com.sg/contact/', 'https://apps.apple.com/pl/app/level-sg-fitness-app/id6745605194']::text[],
    jsonb_build_object(
      'gymSummary', 'Premium personal training and small group strength studio in Singapore with specialist coaching for general fitness, seniors, women, youth, rehab and corporate clients.',
      'services', 'Personal training, strength/hybrid classes, senior fitness, women-focused training, corporate fitness.',
      'communityFocus', 'Strong',
      'technologyUsed', 'Existing LEVEL SG / Mindbody app visible.',
      'ptEmphasis', 'Very strong',
      'estimatedSuitability', 8,
      'talkingPoints', jsonb_build_array('Ascend complements their existing app by adding between-session accountability.', 'Trainer visibility and weekly summaries could support high-touch PT retention.', 'Body scan and athlete-style insights may fit performance and transformation clients.'),
      'suggestedObjections', jsonb_build_array('They already have an app.', 'May prefer not to add another client-facing tool.'),
      'bestOutreachAngle', 'Ascend is not a booking app; it is the accountability layer that helps premium trainers see what happens outside the studio.'
    ),
    jsonb_build_object(
      'subject', 'A between-session accountability layer for LEVEL clients',
      'coldEmail', 'Hi LEVEL team,

I came across LEVEL and liked the premium coaching focus across personal training, strength, seniors and women’s health. Ascend is built to support that kind of high-touch coaching by showing trainers what clients do between sessions: nutrition, workouts, body scans, progress photos, habits and weekly summaries.

It would complement your existing app rather than replace it. Would you be open to a short walkthrough?

Best,
Fariz',
      'followUp1', 'Hi LEVEL team, Ascend may be useful as a retention and accountability layer for premium PT clients, especially where trainers need better visibility outside appointments.',
      'followUp2', '',
      'linkedinMessage', 'Hi, I’m building Ascend, an accountability platform for gyms and trainers. LEVEL’s premium PT model looks like a strong fit. Would you be open to a short walkthrough?',
      'instagramDm', 'Hi LEVEL team, Ascend helps trainers support clients between sessions with nutrition, workouts and progress visibility. Could be a nice complement to your coaching model.'
    ),
    'Official site and app listing show premium PT, classes, contact email and existing app. Strong fit, but outreach should position Ascend as complementary.'
  ),
(
    'MSFIT',
    'https://msfit.sg/',
    'Singapore',
    'Singapore',
    'hello@msfit.sg',
    null,
    null,
    null,
    'https://www.instagram.com/msfit.sg/',
    '3',
    'Women-only Gym and PT',
    'Booking/membership tools visible; dedicated accountability app unknown',
    8,
    array['https://msfit.sg/', 'https://msfit.sg/contact-msfit']::text[],
    jsonb_build_object(
      'gymSummary', 'Women-only fitness community with 24/7 gym access, personal training studios, certified female coaches and multiple Singapore locations.',
      'services', 'Women-only gym, personal training, classes, trainer academy.',
      'communityFocus', 'Very strong',
      'technologyUsed', 'Booking/membership tools visible; dedicated accountability app unknown.',
      'ptEmphasis', 'Strong',
      'estimatedSuitability', 8,
      'talkingPoints', jsonb_build_array('Ascend can support a women-only coaching journey with privacy-first progress tracking.', 'Coach Zoe and trainer dashboards help clients feel supported between sessions.', 'Progress photos, nutrition, habits and weekly reflections fit transformation clients.'),
      'suggestedObjections', jsonb_build_array('Brand/community experience must feel safe and supportive.', 'May need careful tone for women-only clientele.'),
      'bestOutreachAngle', 'Ascend can extend MSFIT’s supportive women-only coaching environment into the other 166 hours of the week.'
    ),
    jsonb_build_object(
      'subject', 'Supporting MSFIT members between coaching sessions',
      'coldEmail', 'Hi MSFIT team,

I came across MSFIT and really liked the women-only, coach-led community positioning. Ascend helps members stay accountable between sessions through simple food logging, water, workouts, progress photos, weekly summaries and trainer visibility.

The product is built to feel supportive, not judgmental. Would you be open to a short walkthrough to see if it could support a small pilot?

Best,
Fariz',
      'followUp1', 'Hi MSFIT team, just following up. Ascend could help trainers spot when clients are losing momentum before they disappear, while keeping the member experience simple and encouraging.',
      'followUp2', '',
      'linkedinMessage', 'Hi, I’m building Ascend, a supportive accountability app for gyms and trainers. MSFIT’s women-only coaching model feels like a strong fit. Open to a quick demo?',
      'instagramDm', 'Hi MSFIT team, love your women-only coaching community. Ascend helps members stay accountable between sessions while giving trainers visibility. Could I show you a short demo?'
    ),
    'Official pages show women-only positioning, PT studios, locations and public email. Strong community-led fit.'
  ),
(
    'One Personal Training',
    'https://www.onepersonaltrainingsg.com/',
    'Singapore',
    'Singapore',
    'info@onepersonaltrainingsg.com',
    null,
    null,
    null,
    'https://www.instagram.com/onepersonaltraining/',
    '1',
    'Personal Training Studio',
    'Dedicated accountability app unknown',
    8,
    array['https://www.onepersonaltrainingsg.com/']::text[],
    jsonb_build_object(
      'gymSummary', 'Personal training studio positioning around transformation results and structured one-to-one coaching.',
      'services', 'Personal training, transformation coaching, consultation.',
      'communityFocus', 'Medium',
      'technologyUsed', 'Unknown',
      'ptEmphasis', 'Very strong',
      'estimatedSuitability', 8,
      'talkingPoints', jsonb_build_array('Ascend can reinforce transformation journeys with weekly summaries and coach visibility.', 'AI food and progress tracking can reduce admin work for trainers.', 'Best positioned as a retention and results tool for PT clients.'),
      'suggestedObjections', jsonb_build_array('May rely on existing WhatsApp/manual follow-up.', 'May want proof of client adoption.'),
      'bestOutreachAngle', 'A high-touch PT studio can use Ascend to make client accountability visible, measurable and easier to review.'
    ),
    jsonb_build_object(
      'subject', 'A simple accountability layer for One Personal Training clients',
      'coldEmail', 'Hi team,

I came across One Personal Training and liked the transformation-focused coaching model. Ascend helps PT studios keep clients accountable between sessions with food logs, workouts, body metrics, weekly reports and trainer dashboards.

Would you be open to a short walkthrough to see whether it could support your trainers and clients?

Best,
Fariz',
      'followUp1', 'Hi team, Ascend is designed to make the between-session work visible for trainers, especially nutrition, consistency and progress signals.',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', 'Hi team, Ascend helps PT clients stay accountable between sessions and gives trainers a clearer picture of progress. Could I show you a quick demo?'
    ),
    'Official site shows Singapore PT positioning and public email. Strong PT studio fit.'
  ),
(
    'HIT Personal Training Singapore',
    'https://hitptsg.com/',
    'Singapore',
    'Singapore',
    'info@hit-pt-sg.com',
    null,
    null,
    null,
    'https://www.instagram.com/hitptsg/',
    '1',
    'Personal Training Studio',
    'Dedicated accountability app unknown',
    8,
    array['https://hitptsg.com/', 'https://hitptsg.com/hit-trainers-team/']::text[],
    jsonb_build_object(
      'gymSummary', 'Downtown Singapore personal training studio offering individual and 2-on-1 training with results-focused coaching.',
      'services', 'Individual personal training, 2-on-1 training, group training packages.',
      'communityFocus', 'Medium',
      'technologyUsed', 'Unknown',
      'ptEmphasis', 'Very strong',
      'estimatedSuitability', 8,
      'talkingPoints', jsonb_build_array('Ascend can help trainers track client consistency outside the studio.', 'Good fit for results-based programmes where food, workouts and check-ins matter.', 'Trainer Daily Brief and Coach Zoe can reduce follow-up friction.'),
      'suggestedObjections', jsonb_build_array('May prefer in-person coaching and WhatsApp.', 'Small studio may need a simple pilot path.'),
      'bestOutreachAngle', 'Ascend can help HIT trainers know who needs attention before the next appointment.'
    ),
    jsonb_build_object(
      'subject', 'Helping HIT clients stay consistent between PT sessions',
      'coldEmail', 'Hi HIT team,

I came across HIT Personal Training and noticed the strong focus on results-based individual and 2-on-1 coaching. Ascend helps trainers see what clients are doing between appointments: food, workouts, hydration, weight, progress photos and weekly summaries.

Would you be open to a short walkthrough to see if a small pilot could support client accountability?

Best,
Fariz',
      'followUp1', 'Hi HIT team, just following up. Ascend is built for the gap between PT sessions, where consistency usually decides results.',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', 'Hi HIT team, Ascend helps PT studios keep clients accountable between sessions. I’d love to show you a quick demo if useful.'
    ),
    'Official pages show individual and 2-on-1 PT plus public contact email. Good results-based PT fit.'
  ),
(
    'Creature Fitness',
    'https://creaturefitness.com.au/',
    'Australia',
    'Bondi Junction',
    'admin@creaturefitness.com.au',
    null,
    null,
    null,
    'https://www.instagram.com/creaturefitness/',
    '1',
    'Hybrid / HYROX / Small Group Training',
    'Uses Wodify for booking/classes',
    8,
    array['https://creaturefitness.com.au/', 'https://creaturefitness.com.au/contact-us']::text[],
    jsonb_build_object(
      'gymSummary', 'Small-group training and conditioning gym in Bondi Junction focused on personalised fitness, team energy, HYROX-style conditioning and coached progress.',
      'services', 'Small group training, conditioning, HYROX, memberships, drop-ins.',
      'communityFocus', 'Strong',
      'technologyUsed', 'Wodify class booking visible.',
      'ptEmphasis', 'Strong group coaching',
      'estimatedSuitability', 8,
      'talkingPoints', jsonb_build_array('Ascend can complement Wodify by focusing on member accountability outside classes.', 'Coach Zoe and trainer insights can support HYROX/conditioning clients between sessions.', 'Progress and nutrition tracking can strengthen retention for everyday athletes.'),
      'suggestedObjections', jsonb_build_array('Already uses Wodify.', 'May need a clear distinction from workout programming.'),
      'bestOutreachAngle', 'Creature already has training energy; Ascend adds the accountability layer after members leave the studio.'
    ),
    jsonb_build_object(
      'subject', 'A between-session accountability layer for Creature Fitness',
      'coldEmail', 'Hi Creature Fitness team,

I came across Creature Fitness and liked the “personalised fitness, team energy” positioning. Ascend is built for gyms like yours that already coach well, but want more visibility into what members do between sessions: nutrition, activity, progress, weekly summaries and Coach Zoe insights.

It would complement Wodify rather than replace it. Would you be open to a short walkthrough?

Best,
Fariz',
      'followUp1', 'Hi team, Ascend could be useful for your HYROX and conditioning members who need support outside class: food, recovery, consistency and progress tracking.',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', 'Hi Creature team, love the coached small-group energy. Ascend adds accountability between sessions and could complement your current setup. Open to a quick demo?'
    ),
    'Official pages show small-group coached training, HYROX/conditioning, Wodify link and public email.'
  ),
(
    'Body Factory Bali',
    'https://www.bodyfactorybali.com/',
    'Indonesia',
    'Bali',
    'info@bodyfactorybali.com',
    null,
    null,
    null,
    'https://www.instagram.com/bodyfactory_bali/',
    '1',
    'Premium Gym / HYROX / Recovery',
    'Dedicated accountability app unknown',
    7,
    array['https://www.bodyfactorybali.com/', 'https://www.bodyfactorybali.com/gym-day-pass/1-day', 'https://www.bodyfactorybali.com/recover']::text[],
    jsonb_build_object(
      'gymSummary', 'Premium Canggu fitness and recovery facility with gym access, fitness classes, coaches, recovery and HYROX positioning.',
      'services', 'Gym access, fitness classes, coaching, recovery, meal plans, cafe, events.',
      'communityFocus', 'Strong',
      'technologyUsed', 'Unknown',
      'ptEmphasis', 'Medium to strong',
      'estimatedSuitability', 7,
      'talkingPoints', jsonb_build_array('Ascend can support transformation and HYROX clients beyond the facility.', 'Body Scan / Athlete Mode could be relevant for performance-focused members.', 'Coach Zoe can help traveling/expat clients maintain consistency.'),
      'suggestedObjections', jsonb_build_array('May be more facility/lifestyle oriented than PT-process oriented.', 'Could already use several member tools.'),
      'bestOutreachAngle', 'Ascend can help premium Bali members turn training, food, recovery and progress into one connected accountability experience.'
    ),
    jsonb_build_object(
      'subject', 'A premium accountability layer for Body Factory Bali members',
      'coldEmail', 'Hi Body Factory Bali team,

I came across Body Factory Bali and liked the premium fitness, recovery and HYROX positioning. Ascend helps members stay accountable beyond the facility with food logging, workouts, body scan insights, progress tracking and Coach Zoe.

Would you be open to a short walkthrough to see whether Ascend could support a small performance or transformation pilot?

Best,
Fariz',
      'followUp1', 'Hi team, Ascend may be especially relevant for performance/HYROX or transformation members who need accountability outside the gym.',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', 'Hi Body Factory team, Ascend connects training, nutrition and progress tracking for premium fitness members. Could I show you a short demo?'
    ),
    'Official pages show premium gym/recovery positioning and public email. Strong brand fit, but may require careful positioning around premium member experience.'
  ),
(
    'Genesis Gym Singapore',
    'https://genesisgym.com.sg/',
    'Singapore',
    'Singapore',
    'support@genesisgym.com.sg',
    null,
    null,
    null,
    null,
    '2+',
    'Personal Training / Transformation',
    'Dedicated accountability app unknown',
    8,
    array['https://genesisgym.com.sg/']::text[],
    jsonb_build_object(
      'gymSummary', 'Singapore personal training brand focused on body transformation, mid-life fitness and evidence-based coaching.',
      'services', 'Personal training, body transformation, mid-life makeover programmes.',
      'communityFocus', 'Medium',
      'technologyUsed', 'Unknown',
      'ptEmphasis', 'Very strong',
      'estimatedSuitability', 8,
      'talkingPoints', jsonb_build_array('Ascend can support transformation clients by making between-session behaviour visible.', 'Weekly summaries and trainer priorities can reinforce high-touch coaching.', 'Body Scan / Ascend DNA may fit transformation progress reviews.'),
      'suggestedObjections', jsonb_build_array('Established coaching system may be internally strong.', 'May require proof that Ascend improves trainer workflow rather than adding admin.'),
      'bestOutreachAngle', 'Ascend helps transformation coaches measure and influence the 166 hours outside appointments.'
    ),
    jsonb_build_object(
      'subject', 'Supporting Genesis transformation clients between sessions',
      'coldEmail', 'Hi Genesis Gym team,

I came across Genesis Gym and noticed the strong transformation and personal training focus. Ascend is designed to help coaches see what happens between sessions: food consistency, workouts, weight, water, progress, body scans and weekly coaching summaries.

Would you be open to a short walkthrough to see if Ascend could complement your coaching process?

Best,
Fariz',
      'followUp1', 'Hi Genesis team, just checking whether Ascend could be useful as a simple between-session accountability layer for transformation clients.',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Public web research shows transformation/PT positioning and public contact email. Good fit for high-touch coaching, verify email before outreach.'
  )
),
inserted as (
  insert into founder_leads (
    gym_name,
    website,
    country,
    city,
    public_email,
    contact_person,
    owner_manager_name,
    linkedin_url,
    instagram_url,
    gym_size,
    pt_focus,
    existing_app,
    ai_fit_score,
    source_urls,
    research,
    email_drafts
  )
  select
    seed.gym_name,
    seed.website,
    seed.country,
    seed.city,
    seed.public_email,
    seed.contact_person,
    seed.owner_manager_name,
    seed.linkedin_url,
    seed.instagram_url,
    seed.gym_size,
    seed.pt_focus,
    seed.existing_app,
    seed.ai_fit_score,
    seed.source_urls,
    seed.research,
    seed.email_drafts
  from seed
  where not exists (
    select 1
    from founder_leads existing
    where lower(existing.gym_name) = lower(seed.gym_name)
  )
  returning id, gym_name
)
insert into founder_lead_notes (lead_id, note_type, body)
select inserted.id, 'general', seed.note_body
from inserted
join seed on lower(seed.gym_name) = lower(inserted.gym_name);
