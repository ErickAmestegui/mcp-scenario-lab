# Contributing

Use Node.js 22 or later. Run `npm ci` and `npm test`. All HTTP tests start loopback fixtures on ephemeral ports and close them afterwards. An environment that denies loopback networking must grant local network access before those tests can run.

Keep fixtures independent of application-specific tool names. Add a real transport regression when changing lifecycle behavior, and unit coverage when extending expectation syntax. Examples should use trusted, non-sensitive test data. Scenarios can mutate server state; do not test against someone else's service without authorization.

Open issues or pull requests with a minimal sanitized scenario, expected behavior, observed outcome and Node/OS versions. Do not include credentials, private user data or raw private reports. Contributors retain copyright in their work and contribute under the repository's MIT license.
