# Changelog

## 1.0.3

- Replace installation-specific Google OAuth configuration with a blank public client setting and runtime redirect URL.
- Check OAuth state and access-token expiry; obtain deployment credentials from session storage.
- Restrict AI requests to declared loopback endpoints; report HTTP failures and time out requests.
- Render model output as text and validate quizzes before preview/deployment.
- Preserve zero-point grading and prevent deployment of a stale quiz after regeneration fails.
- Allow offline quiz generation without Google sign-in.
- Remove unused hosted-service configuration and unreviewed screenshots from the public package.
- Add setup, privacy, contribution, troubleshooting, and validation documentation and CI.
