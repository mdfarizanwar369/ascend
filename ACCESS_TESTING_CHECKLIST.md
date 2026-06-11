# Ascend Access Testing Checklist

Use this after every deploy that touches login, roles, plans, trainer pages, admin pages, or subscriptions.

## Before Testing

1. Wait until Railway shows the frontend and backend as deployed.
2. Open the app in a normal browser window.
3. Log out before switching accounts.
4. After logging in, wait until the account card shows the correct name and plan.

## Account Types To Test

Use one account for each type:

- Owner/admin account
- Trainer account
- Premium client account
- Free client account

## New Signup Test

Test client signup:

- Open `/login`.
- Choose `Client`.
- Create a new account with a gym or trainer referral code.
- Expected: app sends the user to onboarding.
- After onboarding, expected: dashboard shows `Free Plan` unless upgraded.

Test trainer signup:

- Open `/login`.
- Choose `Trainer`.
- Create a new account with a gym referral code such as `AF-AUSTIN` or `AF-KULAI`.
- Expected: app sends the user to the trainer area, not client onboarding.
- If Trainer Pro is not active, expected: trainer pages show the Trainer Pro upgrade screen.
- After activating Trainer Pro, expected: back button from subscription returns to `/trainer`, not `/dashboard`.

Owner/admin:

- Owner/admin should not be selectable on public signup.
- Owner/admin access should be handled only through the owner bootstrap/admin tools.

## Owner/Admin Account

Expected account card:

- Shows your name.
- Shows `Owner access / ...`.

Test these pages:

- `/admin` loads.
- `/admin/users` loads.
- `/admin/referrals` loads.
- `/admin/subscriptions` loads.
- `/trainer` loads without showing `Trainer Pro required`.
- Opening a client from trainer dashboard loads the client profile.
- Back button from a client profile returns to `/trainer`.
- `/dashboard` still loads.

Fail conditions:

- Owner sees `Trainer Pro required`.
- Owner sees `Trainer access only`.
- Owner sees `Admin page could not load`.
- Back button returns to a locked page.

## Trainer Account

Expected account card:

- Shows trainer name.
- Shows Trainer Pro if active.

Test these pages:

- `/trainer` loads if Trainer Pro is active.
- `/trainer` shows plan upgrade if Trainer Pro is not active.
- Assigned clients appear.
- Client profile opens.
- Trainer can message assigned client.
- `/admin` is blocked unless trainer also has admin role.

Fail conditions:

- Trainer Pro trainer is blocked from `/trainer`.
- Trainer sees owner/admin pages.
- Assigned client profile says client could not load.

## Premium Client Account

Expected account card:

- Shows client name.
- Shows `Premium`.

Test these pages:

- `/dashboard` loads.
- `/food-log` loads.
- `/coach` loads.
- `/reports` loads.
- `/messages` loads.
- `/progress` loads.
- `/trainer` is blocked.
- `/admin` is blocked.

Fail conditions:

- Premium client sees `Free Plan`.
- Premium client cannot use AI food, coach, weekly reports, messages, or progress photos.
- Premium client can enter admin/trainer areas.

## Free Client Account

Expected account card:

- Shows client name.
- Shows `Free Plan`.

Test these pages:

- `/dashboard` loads.
- `/weight-log` saves.
- `/water-log` saves.
- `/burn-log` saves manually.
- `/habits` works.
- `/food-log` asks for Premium.
- `/coach` asks for Premium.
- `/reports` asks for Premium.
- `/messages` asks for Premium.
- `/progress` asks for Premium.
- `/trainer` is blocked.
- `/admin` is blocked.

Fail conditions:

- Free client gets premium features.
- Free client is logged out after a few minutes.
- Dashboard loses saved water, weight, habits, or burn logs after returning.

## Phone Browser Test

1. Log in on your phone.
2. Open `/dashboard`.
3. Leave the browser for 5 minutes.
4. Come back to the browser.
5. Refresh once.

Expected:

- You should still be logged in.
- Dashboard should show your name and plan.
- It should not jump to another user or demo account.

## If Something Fails

Write down:

- Which account type you used.
- Which page failed.
- Exact message shown on screen.
- Whether the account card showed the correct name and plan.
