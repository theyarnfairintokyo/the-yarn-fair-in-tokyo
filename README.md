# THE YARN FAIR IN TOKYO™ — Operational System V3

This release completes the practical Phase 1 operating functions and adds the exhibitor CMS.

## Implemented
- Supabase visitor registration
- QR generation and confirmation page
- iPad/iPhone camera check-in and re-entry
- Admin visitor list
- CSV and Excel export
- Supabase-backed public exhibitor pages
- Admin exhibitor CMS
- Complete JP/EN switching for static and dynamic content
- Embedded Google Map, venue address and access

## Required before production use
1. Run `supabase/003_phase1_application_patch.sql`.
2. Create admin/reception Auth users and run `004_create_first_admin_example.sql` with the real UUID.
3. Add Netlify environment variables listed in `ENVIRONMENT_VARIABLES_EXAMPLE.txt`.
4. Verify Resend sender domain before enabling public email delivery.
5. Test registration, email, QR and check-in on two separate devices.

# THE YARN FAIR IN TOKYO™ — Phase 1 Final Design V2

# THE YARN FAIR IN TOKYO™ — Phase 1 Complete Project

This repository is the deployable **Vite + Supabase + Netlify Functions** Phase 1 application for ANDES JAPAN LLC.

## Included

- Approved public website design, Japanese/English switching
- Production visitor registration
- Secure server-side Supabase write through Netlify Functions
- Duplicate registration protection and consent history
- Registration number and QR code issuance
- Optional Resend confirmation email
- Supabase Auth staff login
- Visitor administration list and Excel export
- iPhone/iPad QR check-in, duplicate check and re-entry

## Before Netlify deployment

### 1. Run the application SQL patch

In Supabase **SQL Editor**, run:

`supabase/003_phase1_application_patch.sql`

The Production Database V2 base schema must already exist.

### 2. Create the first administrator

In Supabase **Authentication → Users**, add the administrator user. Copy the user's UUID, replace `AUTH_USER_UUID` in:

`supabase/004_create_first_admin_example.sql`

Then run that SQL in SQL Editor.

### 3. Netlify environment variables

Already created:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Still required:

- `SUPABASE_SECRET_KEY` — Supabase `sb_secret_...`; mark as **Secret**
- `PUBLIC_SITE_URL` — final Netlify URL; not secret
- `EVENT_CODE` — `TYF-TYO-AW26`; not secret

Required before public email launch:

- `RESEND_API_KEY` — mark as Secret
- `FROM_EMAIL` — sender on a verified domain
- `ORGANIZER_EMAIL` — `THEYARNFAIRINTOKYO@gmail.com`

Never commit a secret key to GitHub.

## Netlify build configuration

The included `netlify.toml` configures everything automatically:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

## Upload to GitHub in the browser

1. Unzip the package on your Mac.
2. In the empty GitHub repository, click **uploading an existing file**.
3. Open the unzipped folder, select **all files and folders inside it**, and drag them into GitHub.
4. Confirm that folders such as `src`, `public`, `netlify`, and `supabase` appear.
5. Enter commit message: `Initial Phase 1 application`.
6. Click **Commit changes**.

Do not upload the ZIP itself as the only repository file.

## Production test before launch

- Submit Japanese and English test registrations
- Confirm visitor, registration and consent rows in Supabase
- Confirm QR display
- Log in as administrator
- Test QR scanning on a second phone/iPad
- Test duplicate entry and re-entry
- Export the Excel file
- Verify email delivery after Resend is connected

## Final design lock

- Deep Plum `#4B1E3F`
- One yarn-ball logo only, in the hero
- No yarn-ball logo in the header or footer
- THE YARN FAIR IN TOKYO™ uses the same font family as the rest of the website
- English navigation shows only:
  ABOUT / EVENT / EXHIBITORS / REGISTRATION / CONTACT
- Japanese buttons:
  詳細はこちら / 来場予約
- Organizer:
  ANDES JAPAN LLC / アンデスジャパン合同会社
- Tagline:
  Curated for Japan. Connected to the World.

Phase 1 registration, QR, staff login, admin and check-in functionality remains unchanged.
