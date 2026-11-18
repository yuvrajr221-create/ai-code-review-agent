# Privacy Policy – AI Code Review Agent (Forge app)

Last updated: 18 November 2026

AI Code Review Agent is an Atlassian Forge app built for Codegeist 2026.

## What the app reads
When you ask the Rovo agent to review code for a Jira issue, the app reads that issue's summary, description, status, priority, labels, linked issues, remote links and recent comments through the Jira REST API, using your own permissions.

## What the app stores
- The review text and risk level (LOW, MEDIUM or HIGH) for each issue are saved in Forge Storage, which is hosted by Atlassian inside your Atlassian site's Forge environment.
- The review is also posted as a comment on the Jira issue, and a label such as ai-risk-high is added.
- The app does not store account IDs, names, e-mail addresses or any other personal data of its own.

## What the app does not do
- It does not send your data to any server outside Atlassian Forge.
- It does not sell or share data with third parties.
- It does not use cookies or trackers.

## Retention and deletion
Stored reviews remain until the app is uninstalled. Uninstalling the app removes its Forge Storage data. Comments and labels already added to Jira issues stay in Jira until you delete them.

## Contact
Questions: open an issue at the project repository listed on the Devpost submission page.
