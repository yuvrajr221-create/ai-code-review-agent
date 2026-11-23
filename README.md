# AI Code Review Agent for Jira (Atlassian Forge + Rovo)

Codegeist 2026 submission · Category: **Apps for Software Teams** · Bonus prizes: **Best Agents (Rovo)** , **Best app with Atlassian MCP** and **Best apps with Teamwork Graph integration**

A Rovo agent that reviews code **against the context of a Jira issue** instead of in isolation. It reads the requirements, linked issues, recent comments and the previous reviews of the same issue, then saves a structured verdict back to Jira.

## What it does
1. In Rovo Chat you pick **AI Code Review Agent** and either paste a code snippet with an issue key (for example `DD-1`), or just say `Review DD-1`. In that case the agent uses the most recent code block found in the issue description or comments.
2. The agent calls the Forge action `get-issue-context`, which returns:
   - the issue requirements (summary and description),
   - linked issues and linked docs,
   - recent comments,
   - previous AI reviews of the same issue,
   - Teamwork Graph context: the parent epic, child items, linked pull requests and goals of the issue.
3. The agent reviews the code against that context and answers with **Verdict**, **Risk** (LOW / MEDIUM / HIGH) and numbered findings. Risk follows fixed rules: HIGH if a requirement is not met or there is a security problem, MEDIUM if requirements are met but error handling or tests are missing, LOW for minor issues.
4. After you confirm, the Forge action `save-review`:
   - posts the review as a Jira comment,
   - adds a label such as `ai-risk-high`,
   - stores the review in Forge Storage.
5. The **AI Code Review** issue panel (React Custom UI) shows the latest risk badge, the risk trend (for example HIGH -> LOW), counts per risk level, Teamwork Graph chips (parent epic, linked pull requests, goals) and the full review history with expandable cards.

## Architecture
| Part | Technology |
|---|---|
| Agent | Forge `rovo:agent` module |
| Tools | Forge `action` modules: `get-issue-context`, `save-review` |
| Teamwork Graph | `requestTeamworkGraph` from Forge, scope `read:graph:issue:jira` (hierarchy, linked pull requests, goals) |
| MCP server | Forge `rovo:mcp` module ("AI Code Review MCP") exposing both actions as MCP tools |
| Backend | Forge functions (Node.js), Jira REST API v3, Forge KVS storage |
| Frontend | `jira:issuePanel` with Custom UI (React + Vite) and `@forge/bridge` |
| Scopes | `read:jira-work`, `write:jira-work`, `storage:app`, `read:chat:rovo` |

The app runs fully on Atlassian infrastructure (Runs on Atlassian). No external servers are used.

## Install and test
Requirements: a Jira Cloud site where **Rovo is enabled**. A free developer site works if you create it with `forge site provision` (the standard developer license site did not include Rovo Chat for us).

1. Open the installation link and install on your Jira site:
   https://developer.atlassian.com/console/install/a00ee32d-4715-4616-a9e4-7905df2465eb?signature=AYABeNxE%2B%2F0IQhkLdk5HGc5OP7EAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucB6tzAForNLe9lcooabxR%2BtAAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDHePYWnqecaTrAe7eAIBEIA7jwLMe8OgeMxB8g6KaPlMxARgE22KklNqC2nUPF6ZbMp4f9cxXcidaQxUdQ9k1Zo01f%2FIEub%2FXzNNRiEAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgHqwrMEqUaCvU2dmO4oTTEMAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMxkvwWPOvToiaZ3mrAgEQgDuI%2BLdjI6donL19Cb0r9YlOF9p94Qe%2BEm1eaAktZpklt4o84T1WAVwmBkbYGEoBBTmx9SzXWGNQppUJOAAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAfAdjX%2BQWK9nsghDu2IgK%2FsAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAzZ%2FnXJ4H8SYJw8nTwCARCAOxXK75hp8U8EHUjQddL9IiVBknq9sHJSIb5iGOit9%2FFek3umycjwwTkBGiZdzVvBLzDZt%2FZHc1DpNILuAgAAAAAMAAAQAAAAAAAAAAAAAAAAANjDNDapxiYGCzupKdRg1sv%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADIWomBxQm9j%2F15cwJ1Skg%2BoH%2FxrcmTsMX1urdko8Vxkuq%2FheMj8r7N%2BgT3g5U3TYbj8FuvdYRRwzbIzxBWDek9N6FI%3D&product=jira
2. Create (or open) a **Software** space and a Task, for example:
   - Summary: `Add email validation to login form`
   - Description: `Email must contain @. Show an error message on empty email. Do not send the request to the server if the email is invalid.`
3. Open the issue, click the **Apps** icon (hexagon) under the title and tick **AI Code Review** so the panel appears.
4. Open **Rovo Chat**, choose **AI Code Review Agent** and send:
   `Review this code against DD-1: function login(email){ fetch('/login',{method:'POST',body:email}) }`
   (replace DD-1 with your issue key). Click **Confirm selected** when Rovo asks to save the review.
5. Reload the issue: the comment, the `ai-risk-*` label and the panel with risk badge and history appear.
6. Send a fixed version of the code with the same key to see the risk trend change.

Each agent run uses Rovo credits.

## MCP server (Atlassian MCP bonus)
The same two actions are exposed as MCP tools through the Forge `rovo:mcp` module, so Rovo Studio agents and MCP-compatible clients can call them:
- `get-issue-context` reads the requirements, linked issues, comments and previous reviews of an issue.
- `save-review` posts a review comment, sets the `ai-risk-*` label and stores the review.

A site admin enables the tools under Atlassian Administration > Connected apps > ai-review-agent > Tools > Enable tools. The per-app endpoint is `https://mcp.atlassian.com/forge/a00ee32d-4715-4616-a9e4-7905df2465eb`. The module is in Preview.

## Teamwork Graph integration (Teamwork Graph bonus)
`get-issue-context` calls the Atlassian Teamwork Graph API from the Forge backend (`api.asUser().requestTeamworkGraph`) with the issue ARI and reads:
- `jiraWorkItemHierarchy` with kinds `PARENT` and `CHILD` (the epic the work belongs to and its child items),
- `jiraWorkItemLinkedExternalPullRequests` (pull requests linked to the issue),
- `jiraWorkItemGoals` (goals the issue contributes to).

The agent uses this as review context. Example: a review of DD-4 starts with the finding "Context: part of epic DD-5 - Signup flow", and the chat reply ends with a short Teamwork Graph summary. If the graph has nothing linked, the agent says so. The Teamwork Graph API is in Preview, and every query uses an operation name of the shape `company_operation` as the API requires.

## Privacy
Reviews are stored only in the app's Forge Storage on your Atlassian site. See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md).

## Known limitations
- Code comes from Rovo Chat or from a code block in the issue. Pull requests are not fetched automatically, because that would need an external connection and the app would no longer be Runs on Atlassian.
- The Teamwork Graph API is in Preview: only hierarchy, linked pull requests and goals are read, and results are empty when nothing is linked.
- The panel must be added to an issue once through the Apps icon.
- The agent needs Rovo to be enabled on the Jira site, and each run uses Rovo credits.

## License
MIT
