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
- `PUBLIC_SITE_URL` — optional override; Netlify’s built-in site URL is used when omitted
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


## Validation status

Completed before packaging:

- JavaScript syntax checks for browser modules and the Netlify Function
- HTML parsing checks for all nine pages
- repository structure and referenced asset checks
- server-side input validation, honeypot protection and duplicate handling
- output escaping in the administration and reception interfaces

A live end-to-end test still must be completed after Supabase and Netlify secrets are connected. Do not open registration to the public until the production checklist above passes.
