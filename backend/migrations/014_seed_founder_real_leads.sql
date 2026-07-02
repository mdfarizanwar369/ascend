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
  email_drafts,
  note_body
) as (
  values
(
    'Wrong Gym',
    'https://wronggym.com/',
    'Indonesia',
    'Bali',
    'contact@wronggym.com',
    null,
    null,
    'https://www.linkedin.com/company/wrong-gym/',
    'https://www.instagram.com/wronggym/',
    '1+',
    'Premium Gym',
    'Uses booking app',
    9,
    array['https://wronggym.com/', 'https://wronggym.com/pages/about-wrong-gym', 'https://wronggym.com/pages/personal-training']::text[],
    jsonb_build_object(
      'subject', 'A premium accountability layer for Wrong Gym members',
      'coldEmail', 'Hi team,

I came across Wrong Gym and liked how clearly you combine training, lifestyle and premium member experience. Ascend helps gyms extend accountability beyond the session with food logging, progress tracking, Coach Zoe, trainer dashboards and client consistency signals.

It could complement your current member tools rather than replace them. Would you be open to a short walkthrough to see whether a small pilot makes sense?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official pages reference personal training, The Lab, contact email and strong premium positioning.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Wanderlust Fitness Village',
    'https://wanderlustfitnessvillage.com/',
    'Indonesia',
    'Bali',
    'info@wanderlustfitnessvillage.com',
    null,
    null,
    null,
    'https://www.instagram.com/wanderlustfitnessvillage/',
    '1',
    'CrossFit-style',
    'Uses coaching app',
    8,
    array['https://wanderlustfitnessvillage.com/', 'https://wanderlustfitnessvillage.com/reservations/', 'https://wanderlustfitnessvillage.com/your-membership/']::text[],
    jsonb_build_object(
      'subject', 'Helping Wanderlust members stay accountable after training',
      'coldEmail', 'Hi team,

Wanderlust Fitness Village looks like a strong coaching community, especially with your Bali training environment and retreats. Ascend helps members continue the accountability outside class or PT through nutrition, habits, progress photos and trainer visibility.

Would you be open to seeing how Ascend could support a small member accountability pilot?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official site references WODs app and public email. Good fit for community and travel/retreat follow-up.

Research confidence: Public web research; verify before outreach'
  ),
(
    'FITLUC',
    'https://www.fitluc.com/',
    'Singapore',
    'Singapore',
    'info@fitluc.com',
    null,
    null,
    'https://www.linkedin.com/company/fitluc/',
    'https://www.instagram.com/fitluc/',
    '2+',
    'PT Studio',
    'Uses member app',
    9,
    array['https://www.fitluc.com/', 'https://www.fitluc.com/opportunities/', 'https://www.fitluc.com/terms-of-use/']::text[],
    jsonb_build_object(
      'subject', 'Could Ascend support FITLUC clients between PT sessions?',
      'coldEmail', 'Hi team,

I came across FITLUC and noticed your strong focus on personal training, online coaching and ongoing support. Ascend helps trainers see what happens between sessions through food logs, weight, water, workouts, progress photos and Coach Zoe insights.

Would a short demo be useful to explore whether Ascend could complement your coaching model?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Public pages show personal training, online coaching and email. Likely digitally open.

Research confidence: Public web research; verify before outreach'
  ),
(
    'META Performance',
    'https://metaperformance.sg/',
    'Singapore',
    'Singapore',
    'transform@metaperformance.sg',
    null,
    null,
    'https://sg.linkedin.com/company/meta-performance-sg',
    'https://www.instagram.com/metaperformance.sg/',
    '1',
    'Transformation Gym',
    null,
    9,
    array['https://metaperformance.sg/contact/', 'https://sg.linkedin.com/company/meta-performance-sg']::text[],
    jsonb_build_object(
      'subject', 'Helping META coaches see client consistency between sessions',
      'coldEmail', 'Hi team,

META Performance looks highly aligned with transformation coaching. Ascend helps trainers identify client consistency, food logging, progress trends and risk signals between sessions, so coaching can happen earlier instead of after momentum drops.

Would you be open to a 15-minute walkthrough?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Contact page lists transformation email and corporate email. LinkedIn describes all-round personal training service.

Research confidence: Public web research; verify before outreach'
  ),
(
    'ATP Personal Training Singapore',
    'https://atp.fitness/sg/',
    'Singapore',
    'Singapore',
    null,
    null,
    null,
    'https://sg.linkedin.com/company/atp-fitness',
    'https://www.instagram.com/atp.fitness/',
    '2 countries',
    'PT Studio',
    null,
    9,
    array['https://atp.fitness/sg/where-is-atp-personal-training-singapore/', 'https://sg.linkedin.com/company/atp-fitness']::text[],
    jsonb_build_object(
      'subject', 'A client accountability layer for ATP Personal Training',
      'coldEmail', 'Hi team,

ATP appears very focused on measurable client results. Ascend helps personal training teams see client nutrition, activity, weight, workouts and weekly momentum between sessions without becoming another workout library.

Could I show you how it may support trainer follow-up and renewals?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official pages show Singapore location, phone and PT focus; email rendered protected on source, so left as Unknown.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Babel',
    'https://www.babel.fit/',
    'Malaysia',
    'Kuala Lumpur',
    'hello@babel.fit',
    null,
    null,
    null,
    'https://www.instagram.com/babel.fit/',
    '2+',
    'Premium Gym',
    'Uses member app',
    8,
    array['https://www.babel.fit/', 'https://www.babel.fit/contact-ttdi', 'https://www.babel.fit/terms-and-conditions']::text[],
    jsonb_build_object(
      'subject', 'A premium accountability layer for Babel members',
      'coldEmail', 'Hi team,

Babel has a strong premium member experience and personal training offering. Ascend could complement your existing ecosystem by helping members stay accountable outside the club and giving trainers clearer visibility into consistency and progress.

Would you be open to a short demo?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official contact and terms pages show hello@babel.fit and use of The Babel App for PT payments.

Research confidence: Public web research; verify before outreach'
  ),
(
    'FireFit Studios Malaysia',
    'https://www.firefitstudios.com/my/',
    'Malaysia',
    'Kuala Lumpur',
    null,
    null,
    null,
    null,
    'https://www.instagram.com/firefitstudios/',
    'Multiple',
    'Boutique Strength',
    'Uses booking app',
    7,
    array['https://www.firefitstudios.com/my/contact-us/', 'https://www.firefitstudios.com/my/station/one-mont-kiara/']::text[],
    jsonb_build_object(
      'subject', 'Extending FireFit accountability outside the studio',
      'coldEmail', 'Hi team,

FireFit has a strong boutique fitness brand and community feel. Ascend is built to support the hours outside training, helping members track consistency while giving coaches better visibility into who needs attention.

Would you be open to a short product walkthrough?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Contact page uses a form. Exact public general email not confirmed on Malaysia page.

Research confidence: Public web research; verify before outreach'
  ),
(
    'SOMA Collection',
    'https://somacollection.com.au/',
    'Australia',
    'Sydney',
    'hello@somacollection.com.au',
    null,
    null,
    'https://au.linkedin.com/company/somacollection',
    'https://www.instagram.com/somahealthandwellness/',
    '1+',
    'Wellness Club',
    'Uses booking app',
    8,
    array['https://somacollection.com.au/contact/', 'https://au.linkedin.com/company/somacollection', 'https://thefitguide.com/cities/sydney/clubs/soma-collection-cbd']::text[],
    jsonb_build_object(
      'subject', 'Could Ascend complement SOMA''s premium wellness experience?',
      'coldEmail', 'Hi team,

SOMA Collection feels like a premium wellness experience with a strong member journey. Ascend could complement booking and class tools by adding daily accountability, nutrition tracking, progress photos, Coach Zoe and trainer-facing insight.

Would you be open to seeing a quick walkthrough?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official contact page lists email and Sydney address. LinkedIn describes premium fitness/wellness positioning.

Research confidence: Public web research; verify before outreach'
  ),
(
    'ACERO Gym',
    'https://www.acerogym.com.au/',
    'Australia',
    'Sydney',
    null,
    null,
    'Jono Castano',
    null,
    'https://www.instagram.com/acerogym/',
    '1+',
    'Premium Gym',
    null,
    8,
    array['https://www.acerogym.com.au/contact', 'https://www.acerogym.com.au/']::text[],
    jsonb_build_object(
      'subject', 'Helping ACERO clients stay accountable between sessions',
      'coldEmail', 'Hi team,

ACERO''s premium training brand looks like a strong fit for Ascend. Ascend helps members log the work between sessions and gives coaches visibility into food, activity, weight, progress and consistency.

Would you be open to a short demo to see whether it could support client outcomes and renewals?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Contact form available; public owner/founder association should be manually verified before personalized outreach.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Uplift Fitness Boutique',
    'https://upliftfitnessboutique.co.nz/',
    'New Zealand',
    'Auckland',
    'info@upliftfitnessboutique.co.nz',
    null,
    null,
    null,
    'https://www.instagram.com/upliftfitnessboutique/',
    '1',
    'Functional Training',
    'Uses member app',
    8,
    array['https://upliftfitnessboutique.co.nz/contact/', 'https://apps.apple.com/nz/app/uplift-fitness-boutique/id1596694438']::text[],
    jsonb_build_object(
      'subject', 'Adding daily accountability to Uplift''s member journey',
      'coldEmail', 'Hi team,

Uplift Fitness Boutique appears focused on member results and already has a digital booking/member experience. Ascend could add a coaching layer around accountability, nutrition, progress and trainer follow-up between sessions.

Could I show you how it works?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official contact page lists email; App Store listing indicates a member app.

Research confidence: Public web research; verify before outreach'
  ),
(
    'BoutiqueFit',
    'https://www.boutiquefit.co.nz/',
    'New Zealand',
    'Blenheim',
    'kim@boutiquefit.co.nz',
    null,
    'Kim Norriss',
    null,
    'https://www.instagram.com/coach_kim_pt/',
    '1',
    'PT Studio',
    'No visible app',
    7,
    array['https://www.boutiquefit.co.nz/']::text[],
    jsonb_build_object(
      'subject', 'A simple coaching accountability tool for BoutiqueFit',
      'coldEmail', 'Hi Kim,

I came across BoutiqueFit and liked the personal, coach-led positioning. Ascend helps small PT studios keep clients accountable between sessions with nutrition logs, progress tracking, weekly summaries and simple coach insights.

Would you be open to a quick look?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Website publicly lists Coach Kim and email. Good owner-led outreach target.

Research confidence: Public web research; verify before outreach'
  ),
(
    'The Warehouse Gym',
    'https://whgym.com/',
    'United Arab Emirates',
    'Dubai',
    'info@whgym.com',
    null,
    null,
    'https://www.linkedin.com/company/thewarehousegym/',
    'https://www.instagram.com/whgymdubai/',
    'Multiple',
    'Premium Gym',
    'Uses member app',
    8,
    array['https://whgym.com/', 'https://contact.whgym.com/', 'https://www.linkedin.com/company/thewarehousegym/']::text[],
    jsonb_build_object(
      'subject', 'A coaching accountability layer for The Warehouse Gym',
      'coldEmail', 'Hi team,

The Warehouse Gym already has a strong member brand and digital presence. Ascend could complement your app by focusing on accountability between sessions: nutrition, progress tracking, Coach Zoe, trainer dashboards and retention signals.

Would a short partnership walkthrough be useful?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Website lists contact email and app links; strong tech openness but may need enterprise-level conversation.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Roar Fitness',
    'https://www.roar-fitness.com/',
    'United Arab Emirates',
    'Dubai',
    null,
    null,
    'Sarah Lindsay / Rich Phillipps',
    'https://uk.linkedin.com/company/roar-dubai',
    'https://www.instagram.com/roarfitnessdubai/',
    'London and Dubai',
    'Transformation Gym',
    null,
    9,
    array['https://www.roar-fitness.com/', 'https://www.instagram.com/roarfitnessdubai/', 'https://uk.linkedin.com/company/roar-dubai']::text[],
    jsonb_build_object(
      'subject', 'Supporting ROAR clients between transformation sessions',
      'coldEmail', 'Hi team,

ROAR''s transformation-led personal training model feels very aligned with Ascend. Ascend helps coaches see client consistency, nutrition, progress photos, body scans and risks between sessions so support can happen earlier.

Would you be open to seeing whether this could support a small pilot?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Public sources confirm London/Dubai and founder/coach names; direct public email not confirmed.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Unit 27',
    'https://www.unit-27.com/',
    'Thailand',
    'Phuket',
    null,
    null,
    null,
    null,
    'https://www.instagram.com/unit27thailand/',
    '2 sites',
    'HYROX / Performance',
    'No visible app',
    8,
    array['https://www.unit-27.com/', 'https://www.instagram.com/unit27thailand/', 'https://www.tripadvisor.com/Attraction_Review-g1389361-d5823176-Reviews-Unit_27_Total_Conditioning_CrossFit_Phuket-Chalong_Phuket_Town_Phuket.html']::text[],
    jsonb_build_object(
      'subject', 'A digital accountability layer for Unit 27 clients',
      'coldEmail', 'Hi team,

Unit 27 looks like a serious strength and conditioning environment with a strong coaching culture. Ascend helps clients stay accountable between sessions with food, water, workouts, progress and coach visibility.

Could I show you a short demo for a potential pilot?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official site uses contact form. Tripadvisor and official site reference two sites and S&C positioning.

Research confidence: Public web research; verify before outreach'
  ),
(
    'BASE Bangkok',
    'https://basebangkok.com/',
    'Thailand',
    'Bangkok',
    'team@basebangkok.com',
    null,
    null,
    null,
    'https://www.instagram.com/basebangkok/',
    '3',
    'HYROX / Performance',
    'Uses member app',
    9,
    array['https://basebangkok.com/', 'https://basebangkok.com/contact-us', 'https://apps.apple.com/us/app/base-bangkok/id1209369544']::text[],
    jsonb_build_object(
      'subject', 'Could Ascend complement BASELINE and member accountability?',
      'coldEmail', 'Hi team,

BASE already feels very data-driven, especially with BASELINE and your app. Ascend could complement that by focusing on the 166 hours between sessions: nutrition, daily accountability, Coach Zoe, trainer summaries and member consistency signals.

Would you be open to a quick demo?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official site shows BASELINE tech, contact emails, three locations and app listings.

Research confidence: Public web research; verify before outreach'
  ),
(
    'The Fitting Rooms Gym',
    'https://www.thefittingrooms.london/',
    'United Kingdom',
    'London',
    null,
    null,
    null,
    'https://uk.linkedin.com/company/the-fitting-rooms',
    'https://www.instagram.com/the_fitting_rooms/',
    '1',
    'PT Studio',
    'Uses member app',
    9,
    array['https://www.thefittingrooms.london/', 'https://apps.apple.com/gb/app/the-fitting-rooms-gym/id1171918072', 'https://uk.linkedin.com/company/the-fitting-rooms']::text[],
    jsonb_build_object(
      'subject', 'Helping The Fitting Rooms clients stay accountable between PT sessions',
      'coldEmail', 'Hi team,

The Fitting Rooms has a clear coaching-led model with 1-to-1 and shared PT. Ascend helps trainers keep clients accountable outside the gym with food logs, progress tracking, Coach Zoe, weekly reports and trainer-facing priorities.

Would you be open to a short walkthrough?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official site details PT model and phone; App Store listing indicates a client app.

Research confidence: Public web research; verify before outreach'
  ),
(
    'TRIBES St John''s Wood',
    'https://www.tribes.fit/',
    'United Kingdom',
    'London',
    'info@tribes.fit',
    null,
    null,
    null,
    'https://www.instagram.com/tribes.fitness/',
    '1',
    'Wellness Club',
    'Uses member app',
    8,
    array['https://www.tribes.fit/', 'https://www.tribes.fit/contactus', 'https://play.google.com/store/apps/details?id=fit.tribes.sjw.own']::text[],
    jsonb_build_object(
      'subject', 'A coaching intelligence layer for TRIBES members',
      'coldEmail', 'Hi team,

TRIBES feels like a premium member experience with personal training and wellness at the centre. Ascend could complement your app by helping coaches understand member consistency, progress and accountability between sessions.

Would a short demo be useful?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official contact page and app listings provide public contact and member app evidence.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Yard Athletics',
    'https://yardathletics.ca/',
    'Canada',
    'Vancouver',
    'info@yardathletics.ca',
    null,
    null,
    null,
    'https://www.instagram.com/yardathletics_/',
    '2',
    'Boutique Strength',
    'Uses booking app',
    8,
    array['https://yardathletics.ca/', 'https://yardathletics.ca/faqs/', 'https://shop.yardathletics.ca/pages/contact']::text[],
    jsonb_build_object(
      'subject', 'Helping Yard coaches see what happens between sessions',
      'coldEmail', 'Hi team,

Yard Athletics looks like a strong personal and small-group training environment. Ascend helps coaches see food, activity, weight, workout history and consistency between sessions so follow-up becomes more targeted.

Would you be open to a quick demo?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official site lists email, locations and personal/small group training. FAQ references Mindbody profile.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Sweat and Tonic',
    'https://sweatandtonic.com/',
    'Canada',
    'Toronto',
    'hello@sweatandtonic.com',
    null,
    null,
    'https://ca.linkedin.com/company/sweat-and-tonic',
    'https://www.instagram.com/sweatandtonic/',
    '2+',
    'Wellness Club',
    'Uses member app',
    7,
    array['https://sweatandtonic.com/pages/contact-us', 'https://sweatandtonic.com/pages/locations', 'https://ca.linkedin.com/company/sweat-and-tonic']::text[],
    jsonb_build_object(
      'subject', 'A member accountability concept for Sweat and Tonic',
      'coldEmail', 'Hi team,

Sweat and Tonic has a strong premium community and wellness experience. Ascend could complement your current member journey by helping members stay accountable between visits and giving coaches clearer engagement signals.

Would it be worth a short partnership conversation?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Strong brand and tech openness; may be less PT-led than ideal, so marked Warm.

Research confidence: Public web research; verify before outreach'
  ),
(
    'DOGPOUND',
    'https://www.thedogpound.com/',
    'United States',
    'New York / Los Angeles',
    'info@thedogpound.com',
    null,
    'Kirk Myers',
    'https://www.linkedin.com/company/the-dogpound',
    'https://www.instagram.com/dogpound/',
    '2+',
    'Premium Gym',
    null,
    8,
    array['https://www.thedogpound.com/', 'https://www.thedogpound.com/policies/', 'https://www.linkedin.com/company/the-dogpound']::text[],
    jsonb_build_object(
      'subject', 'A premium accountability layer for DOGPOUND clients',
      'coldEmail', 'Hi team,

DOGPOUND''s high-touch personal training and community model feels strongly aligned with Ascend. Ascend helps coaches see what clients do between sessions and gives members a premium way to track food, workouts, progress and consistency.

Would you be open to a short product walkthrough?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official policy page lists email; LinkedIn describes personal training community. Owner public knowledge should be verified before use.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Tone House',
    'https://tonehouse.com/',
    'United States',
    'New York',
    null,
    null,
    'Alonzo Wilson',
    'https://www.linkedin.com/company/tonehouse',
    'https://www.instagram.com/tonehouse/',
    '1',
    'HYROX / Performance',
    'Uses booking app',
    7,
    array['https://tonehouse.com/', 'https://www.linkedin.com/company/tonehouse', 'https://www.menshealth.com/fitness/a46556037/alonzo-wilson-tone-house-gym-owner/']::text[],
    jsonb_build_object(
      'subject', 'Helping Tone House members keep momentum between sessions',
      'coldEmail', 'Hi team,

Tone House has a strong performance and community identity. Ascend could add a simple accountability layer around recovery, nutrition, progress and consistency so members stay engaged between sessions.

Would a short demo be useful?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'Official site and LinkedIn confirm athletic conditioning positioning. General public email not clearly available; careers email only not used.

Research confidence: Public web research; verify before outreach'
  ),
(
    'Ultimate Performance',
    'https://ultimateperformance.com/',
    'United Kingdom',
    'London / Global',
    null,
    null,
    'Nick Mitchell',
    'https://www.linkedin.com/company/ultimate-performance',
    'https://www.instagram.com/upfitnesslive/',
    'Multiple',
    'Transformation Gym',
    'Uses coaching app',
    7,
    array['https://ultimateperformance.com/', 'https://ultimateperformance.com/contact/', 'https://www.linkedin.com/company/ultimate-performance']::text[],
    jsonb_build_object(
      'subject', 'A coaching accountability partnership idea for Ultimate Performance',
      'coldEmail', 'Hi team,

Ultimate Performance is clearly one of the strongest transformation brands globally. Ascend is a fitness accountability platform focused on the hours between sessions: nutrition, progress, coach visibility and member consistency.

Would there be interest in exploring whether Ascend could complement your digital coaching workflow in a small controlled context?

Best,
Fariz',
      'followUp1', '',
      'followUp2', '',
      'linkedinMessage', '',
      'instagramDm', ''
    ),
    'High fit philosophically, but likely has mature internal systems; treat as strategic partnership, not normal sales lead.

Research confidence: Public web research; verify before outreach'
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
    status,
    source_urls,
    email_drafts,
    research
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
    'Not Contacted',
    seed.source_urls,
    seed.email_drafts,
    jsonb_build_object(
      'bestOutreachAngle', 'Imported from Ascend real outreach CRM. Verify public data before contacting.',
      'estimatedSuitability', seed.ai_fit_score
    )
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
join seed on seed.gym_name = inserted.gym_name;
