# Zorifi privacy implementation

Controller: **Jayson Uche**. Privacy contact: **zorifvideoeditor@gmail.com**. Notice version: **2026-10-09**.

This records the implemented controls and the operational work still needed before public launch. Adding these controls does not certify GDPR compliance. The controller must confirm the notice against the services actually deployed.

## Available controls

Both the browser/desktop editor and Flutter companion have a **Privacy & data** panel. Optional AI starts disabled, is separate from Terms acceptance, and can be withdrawn. Browser consent is scoped to the current local profile; mobile consent is scoped to the app installation. Notices are versioned, and an unfamiliar notice version resets consent to off.

The browser API wrapper rejects optional AI POST requests without consent. Mobile chat also refuses requests before transport. Mobile project names, filenames and clip timings require a separate sharing choice. Withdrawing consent prevents future requests; it cannot recall data already sent. These client controls govern the app interface, rather than acting as backend authentication or a substitute for server-side processing records.

The local metadata export excludes authentication secrets and other browser profiles. Browser exports include the current profile, saved project metadata and account-scoped preferences; Flutter exports its local project metadata, connection address and privacy choices. Project backups are separate and include imported media. Exports saved outside the app are controlled by the person who saved them.

Local erasure requires confirmation and removes Zorifi editor records and imported copies in the current browser origin or mobile installation. Browser erasure covers all local Zorifi profiles in that origin and preserves unrelated application keys. Flutter erasure removes only its owned projects/media/settings. Original source files, external backups, cloud accounts, provider records, billing and desktop provider credentials remain separate. Requests for access, rectification, cloud deletion, restriction, objection or other rights go to the privacy contact. The UI does not send these requests automatically.

## Data and retention inventory

| Processing | Data and recipients | Current storage/retention behavior |
| --- | --- | --- |
| Local editing | Project names, edits, imported media copies, preferences; device/browser storage | Retained until the user deletes local data; no automatic cross-device sync |
| Browser profile and assistant memory | Local account records, support cases, approved assistant memory | Local storage until erasure; exported files remain outside this control |
| Mobile chat | Messages and optional project context; configured backend and its language provider | Chat and authentication tokens remain in app memory for the session; external retention needs deployment review |
| Requested cloud account service | Email/authentication and subscription records; Firebase when configured | Cloud retention/deletion must be confirmed by the controller; local erasure signs out without deleting the cloud account |
| Optional AI in the main editor | Prompts, conversations, project context and feature-specific reference image/audio; configured OpenAI, ElevenLabs, xAI or custom music/GPU endpoints | Explicit opt-in gates app requests; provider-specific retention and transfers require review |
| Requested support escalation | Case details and redacted diagnostics; configured support mailbox | Sent only through the requested support action; mailbox retention and deletion procedure require controller review |

The intended basis for optional AI is consent. Local editing and requested account/support processing provide the requested service; the controller must confirm the appropriate lawful basis for each deployed activity and document any additional security, billing or legal-retention processing. No fixed cloud/provider retention periods, controller postal address, EU representative or DPO appointment have been invented.

## Before a public launch

Confirm the actual processors, hosting/logging behavior, agreements, retention periods and international-transfer safeguards. Update both in-app notices when processing changes. Confirm whether an EU representative or DPO is required for the operating circumstances. Keep a record of processing and an appropriate security/incident response procedure.

Operate the privacy mailbox: verify request identity proportionately, track requests, locate local/cloud/support/provider records, respond within the applicable deadlines, and record any lawful limits on erasure. Establish provider and Firebase account deletion procedures and a clear route for billing cancellation. Do not report a cloud deletion as completed when only device data was removed.

Check deployed analytics, cookies, advertising, age restrictions and any new media uploads before adding them to the product. The current client controls do not establish that a future deployment has no additional collection.

The notice and operations checklist follow the [ICO's privacy information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/), [ICO erasure guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-to-erasure/) and [European Commission data protection guidance for organisations](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations_en). These sources explain why a notice, data controls and the controller's operational procedures all matter.
