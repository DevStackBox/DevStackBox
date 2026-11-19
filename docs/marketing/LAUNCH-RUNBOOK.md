# Launch runbook

## Publish the Windows PHP walkthrough

1. Merge the canonical tutorial, navigation and AI guide into the application documentation source used by the website build. Preview the website at those revisions before promoting it.
2. Run the docs checks in the app repository. In the website checkout run `npm test` and `npm run build`. Start the production preview, set `SMOKE_BASE_URL` to its origin, and run `npm run test:smoke`.
3. Follow the tutorial from the homepage. Check the two site results, default CLI explanation, video captions, transcript, keyboard navigation and download link. Compare the published installer name and SHA-256 with the GitHub release.
4. After deployment check the canonical tutorial, sitemap and AI guide aliases on the public domain. Keep the previous website deployment available for rollback.

## Measure discovery

- Export the last 90 days and the most recent 28 days from Search Console, grouped by query and page. Separate brand searches from searches for Windows PHP workflows. Record dates, country and device.
- Inspect the published tutorial in Google Search Console and Bing Webmaster Tools. Check HTTP responses and indexing for the canonical URL. An accepted sitemap alone does not establish indexing.
- When website analytics is enabled, configure the Plausible custom event goal named `Installer Download` and verify one test click on the deployed site. Filter by tutorial entry page to measure sessions that reach a direct installer link. Report GitHub asset download counts separately.
- Share the tutorial and captioned demo in PHP communities that welcome project posts. Record referral channels and questions. Use comparable 28-day windows to decide whether the next tutorial should cover Laravel or WordPress. Rehearse the chosen workflow in a clean profile before publishing it.
