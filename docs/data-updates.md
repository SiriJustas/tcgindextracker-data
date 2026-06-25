# Data Updates

GitHub Actions updates and publishes the data.

## Scheduled Flow

1. Check whether today's Pokemon summary is already published.
2. If already updated, skip the run.
3. Download Cardmarket source files.
4. Check whether the price guide date is fresh.
5. If stale, skip cleanly.
6. Generate compact JSON.
7. Validate generated JSON.
8. Commit generated `public/data`, `.index-state/state.json`, and optional audit outputs.
9. Deploy `public` to GitHub Pages.

Validation checks the generated file layout, expected metric lists, required manifest/summary counts, JSON parseability, and absence of removed metric names or local filesystem paths.

The workflow currently runs at:

```text
08:17, 12:17, 16:17, 20:17 UTC
```

That corresponds to 11:17, 15:17, 19:17, and 23:17 Lithuania summer time.

## Same-Day Behavior

If `/data/pokemon/summary.json` already has today's valuation date, the workflow exits successfully without downloading or publishing anything.

If the summary is old but Cardmarket has not published a fresh price guide yet, the workflow exits successfully without committing stale data.

## Generated Outputs

The workflow commits generated data only after validation passes. Raw downloaded files remain temporary and ignored.
