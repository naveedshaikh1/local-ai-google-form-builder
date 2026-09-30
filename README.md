# Local AI Google Form Builder

A Chrome Manifest V3 extension that turns source text into Google Forms quizzes using a local AI server with an OpenAI-compatible chat-completions endpoint. Generate and preview a quiz, export its JSON, then sign in to Google to create the form.

**Status:** source distribution for developers and self-hosted use. Google sign-in requires your own OAuth configuration. This is not a Chrome Web Store release. The local AI server is not included.

## Features

- Generate multiple-choice, true/false, short-answer, and mixed quizzes.
- Paste source text or upload `.txt`, `.md`, `.csv`, or `.json` files.
- Preview questions and copy or download generated JSON.
- Create Google Forms quizzes with answer keys and points.
- Open the side panel from the toolbar or floating button on supported Google Workspace pages.

The generation prompt adds “Your Name” and “Your Class” questions. Review generated questions, factual accuracy, answers, and grading before deployment. The panel currently requires pasted/uploaded text; opening a Workspace page does not automatically populate it. PDF, Word, and PowerPoint uploads are not supported.

## Install locally

1. Download this repository and extract it into a permanent folder.
2. Use Chrome 116 or newer.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
4. Pin the extension and click its toolbar icon to open the panel.

No build step or npm dependency installation is required to use the extension.

## Configure local AI

Run a local service that supports `POST /v1/chat/completions`, accepts a `model` and `messages`, and returns `choices[0].message.content` as text. Configure the service on port **10086**. The supported endpoints are:

- `http://127.0.0.1:10086/v1/chat/completions`
- `http://localhost:10086/v1/chat/completions`

Enter the endpoint and the actual model identifier in the side panel, choose **Save Settings**, then **Test Connection**. The service must allow requests from the extension's origin and require no API key. Keep it bound to loopback; do not expose it to the network. Other hosts and ports are intentionally rejected; changing these requires updating both `validation.js` and manifest host permissions.

## Configure Google sign-in

1. Create a Google Cloud project and enable the **Google Forms API**.
2. Configure OAuth consent/branding and the audience. In testing mode, add the Google accounts that will use it as test users.
3. Load the extension, then open its service-worker console from `chrome://extensions` and run `chrome.identity.getRedirectURL()`. Copy the returned URL exactly, including the trailing slash.
4. Create an OAuth client of type **Web application** and register that exact URL as an authorized redirect URI.
5. Put its public client ID in `oauth_config.js`, replacing the empty string. Never add a client secret, access token, refresh token, or credentials JSON to this repository.
6. Reload the extension and choose **Sign in with Google**.

The extension requests only `https://www.googleapis.com/auth/forms.body`. The redirect is computed from the loaded extension rather than a fixed developer ID. An unpacked extension's ID may differ on another installation; register the correct redirect for each ID. For a shared public distribution, maintain a stable extension ID and configure your OAuth project accordingly. Google may require consent-screen verification depending on distribution and audience. Consult the current official documentation before publishing.

Authentication uses `launchWebAuthFlow` with an access-token response and a checked OAuth state. Tokens are stored in browser session storage with their expiry. There is no refresh-token flow: sign in again after expiry. Signing out clears local session credentials; it does not revoke previously granted Google account consent.

## Use

1. Enter or upload source text, select a quiz type, and choose **Generate with Local AI**. Google sign-in is not required for generation.
2. Review the preview and JSON. If needed, revise the source and regenerate. The preview is read-only.
3. Sign in with Google and choose **Deploy to Google Forms**.
4. Open the returned form editor link and verify its questions, answer keys, and settings. Share or publish the form through Google Forms yourself.

## Privacy and permissions

See [PRIVACY.md](PRIVACY.md) for data handling and the reason for each permission. “Local AI” refers to the configured loopback service. Creating a Google Form sends the generated quiz to Google; it is not an entirely offline workflow.

## Development

Node.js 20+ is needed only for checks:

```sh
npm run check
npm test
```

GitHub Actions runs the same checks. There are no runtime dependencies. Reload the unpacked extension after code changes.

## Troubleshooting

- **OAuth not configured:** set `GOOGLE_CLIENT_ID` in `oauth_config.js` and reload.
- **redirect_uri_mismatch:** register the exact result from `chrome.identity.getRedirectURL()` for this installation.
- **Access denied:** check consent-screen test users, audience, scope, and enabled Forms API.
- **Local AI connection failed:** check server availability, port, model name, response format, and extension-origin access policy.
- **Invalid JSON or quiz:** regenerate with clearer text. Models can return unsupported types or invalid answers.
- **Deployment failed:** sign in again and inspect the error. Form creation and question insertion are separate API calls; a failed insertion may leave an empty or partially configured form in Google Drive. Check before retrying to avoid duplicates.

## Validation and release limits

Automated validation covers endpoint restrictions, quiz checks, source context parsing, referenced assets, and JavaScript syntax. Live OAuth, Chrome UI, local-model generation, and Google Forms deployment still need a manual integration test with your own setup; they were not verified for this release.

## License

No open-source license has been selected. Public visibility alone does not grant permission to reuse or redistribute the code. The repository owner should choose and add an appropriate license before inviting reuse.

## Official references

- [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Google OAuth for client-side applications](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)
- [Google Forms API: create](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms/create)
