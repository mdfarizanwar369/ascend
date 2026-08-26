# Portion-Aware Nutrition V1 Owner Pilot

## Safe configuration

Apply migration `035_portion_aware_nutrition_v1.sql`, then use:

```text
PORTION_AWARE_NUTRITION_V1=false
PORTION_AWARE_NUTRITION_OWNER_PILOT=true
```

Only the server-verified Platform Owner receives the V1 analysis. Keep the global flag false throughout the owner pilot.

## What to inspect

After analysing a photo, expand **Owner pilot diagnostics**. For each item verify:

- detected identity and original AI quantity;
- final quantity after any correction;
- separate food and portion confidence;
- nutrition source and database-density availability;
- AI versus standard-serving fallback;
- calculation basis and final item nutrition;
- fallback reason and `portion_aware_v1` analysis version.

## Photo matrix

Record the photo, angle, result, correction, and whether the result was directionally useful.

### Simple foods

- [ ] Single chicken breast
- [ ] Banana
- [ ] Boiled eggs
- [ ] Bread or toast
- [ ] Protein shake

### Rice meals

- [ ] Chicken rice
- [ ] Nasi lemak
- [ ] Nasi goreng
- [ ] Economy or mixed rice
- [ ] Rice, chicken, and vegetables

### Malaysia and Singapore mixed foods

- [ ] Mee goreng
- [ ] Laksa
- [ ] Roti canai
- [ ] Nasi kandar
- [ ] Curry dish

### Western mixed meals

- [ ] Burger and fries
- [ ] Pasta
- [ ] Salad with dressing
- [ ] Steak with sides

### Liquids

- [ ] Coffee with milk
- [ ] Teh tarik
- [ ] Juice
- [ ] Smoothie
- [ ] Soup

### Difficult photographs

- [ ] Partially hidden sauce
- [ ] Overlapping food
- [ ] Deep bowl
- [ ] Takeaway container
- [ ] Very close photograph
- [ ] Far-away photograph
- [ ] Low light
- [ ] Top-down angle
- [ ] Angled photograph

## Required comparisons

Photograph the same food at two clearly different portions, ideally rice and chicken. The larger portion should normally produce a larger quantity and nutrition result. Record any pair that collapses to the same value.

For every ambiguous photograph, confirm that portion confidence drops or a transparent standard-serving fallback appears. Never treat photo-derived quantities as measured values.

## Live provider request

Run against an isolated owner-pilot environment after configuring the existing provider credentials. Do not store the Firebase token or image data in source control.

```powershell
$token = $env:ASCEND_OWNER_FIREBASE_ID_TOKEN
$api = $env:ASCEND_API_URL.TrimEnd('/')
$endpoint = if ($api.EndsWith('/api/v1')) { "$api/food-logs/estimate-data-url" } else { "$api/api/v1/food-logs/estimate-data-url" }
$imagePath = "C:\path\to\pilot-meal.jpg"
$imageData = [Convert]::ToBase64String([IO.File]::ReadAllBytes($imagePath))
$body = @{
  imageDataUrl = "data:image/jpeg;base64,$imageData"
  timezoneOffsetMinutes = -480
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri $endpoint `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body
```

Success requires `estimate.analysisVersion` to equal `portion_aware_v1`, at least one validated item, and nutrition tied to each item's stated visible quantity. Review the owner diagnostic UI before saving.

## Stop conditions

Stop the pilot and disable the owner flag if:

- a valid visible quantity is replaced by one generic serving;
- small and large comparison photos repeatedly collapse to identical nutrition;
- malformed quantities are saved;
- diagnostics appear for a non-owner account;
- normal members receive V1 while the global flag is false.
