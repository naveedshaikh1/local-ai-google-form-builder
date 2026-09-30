# Privacy and data handling

The extension has no analytics, advertising, payment service, or developer-hosted backend.

- AI endpoint/model settings are stored in `chrome.storage.local`.
- Google access tokens, expiry, and tab context are stored in `chrome.storage.session`.
- Source text is sent to the configured loopback AI endpoint when you generate a quiz. Connection testing sends “Hello”. The AI service has its own logging and data handling behavior.
- Generated titles, descriptions, questions, answers, and grading are sent to Google's Forms API when you deploy.
- Supported Google Workspace pages receive a floating button and page-extraction helpers. Source text is currently provided through the panel by paste or upload; no automatic extraction is initiated by the panel.
- Copy/download actions place quiz JSON on your clipboard or download it. Those copies remain under your control.
- Signing out removes local Google session credentials. Revoke account access through your Google account to withdraw Google consent.

## Permissions

| Permission or host | Purpose |
| --- | --- |
| `storage` | Store AI settings and temporary session context/authentication |
| `sidePanel` | Display the quiz builder |
| `tabs` | Identify the active Workspace page and keep tab context |
| `scripting` | Run bundled document-export helpers when requested |
| `identity` | Google OAuth sign-in |
| Google Docs/Slides/Forms hosts | Floating button and source-page integration |
| `forms.googleapis.com` | Create and populate forms |
| `localhost:10086`, `127.0.0.1:10086` | Local AI requests |

Use only source content you are authorized to process. Quiz content can include personal information from source material; review it before creating or sharing a form.
