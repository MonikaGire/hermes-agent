# Hermes Metal ERP Pilot — Start here

This pilot runs live public search for international metal-business operating problems. It does not send emails or touch MongoDB, Redis, Gmail, SMTP, your CRM, or any company records.

## One Windows command

Open PowerShell inside the new cloned hermes-agent folder and paste:

    git pull origin feat/metal-erp-evidence-first-quality-gates; powershell -NoProfile -ExecutionPolicy Bypass -File .\PILOT.ps1

The script loads SERPAPI_KEY from the clone's .env if present. Otherwise it prompts for a key with characters hidden. It does not write the key into any report.

Node.js 22+ is required. MongoDB and Prisma are not needed for this pilot. A real SerpAPI key is needed for the live Google search.

The launcher writes files into pilot-results and opens the summary. Share the CSV or summary only, not .env, screenshots of API keys, or the entire project.

## Outputs

- REVIEW.csv: potential first-party company pages mentioning metal and an operational/software signal
- THIRD-PARTY.csv: third-party clues requiring company matching
- ALL-SEARCH-RESULTS.csv: searchable source-level audit trail
- SUMMARY.txt: counts, limits and provider errors

Important: this pilot does not establish purchase intent or verify decision-maker emails. Search snippets are not buyer commitments. Review employer identity, date and original evidence before outreach.

Offline self-test (no API key, no network):

    node scripts/metal-pilot.mjs --self-test

## Why the old setup looked confusing

The screenshots showed an outer project folder and a newly cloned inner hermes-agent folder. Run the command in whichever folder contains PILOT.ps1. Do not edit the outer .env for this pilot.

Security: screenshots exposed what appear to be real tokens/database credentials. Revoke/rotate them at the respective providers and do not paste them in chat.

## Next engineering phase

Only after reviewing this search output should Hermes resolve third-party job-board/forum signals to named companies, verify contacts, and test replies with sandbox mailboxes. Automated outreach remains off for the pilot.
