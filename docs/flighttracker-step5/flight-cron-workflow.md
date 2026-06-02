# FlightTracker Co - Step 5 GitHub Actions Workflow

This workflow wakes the Vercel cron endpoint three times per day using lightweight `curl` calls.

## File path

```text
.github/workflows/flight-cron.yml
```

## Recommended workflow

```yaml
name: Flight Price Tracker Cron

on:
  schedule:
    - cron: "0 8 * * *"
    - cron: "0 14 * * *"
    - cron: "0 21 * * *"
    - cron: "0 2 * * *"
    - cron: "0 11 * * *"
    - cron: "0 18 * * *"
  workflow_dispatch:

jobs:
  ping-cron-endpoint:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Validate cron configuration
        env:
          APP_URL: ${{ vars.APP_URL || secrets.APP_URL }}
        run: |
          if [ -z "${APP_URL}" ]; then
            echo "APP_URL is not configured. Set it as a repository variable or secret to your public deployment URL."
            exit 1
          fi

      - name: Call Vercel cron endpoint
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          APP_URL: ${{ vars.APP_URL || secrets.APP_URL }}
        run: |
          if [ -z "${CRON_SECRET}" ]; then
            echo "CRON_SECRET is not configured."
            exit 1
          fi

          curl -fsS \
            -X GET \
            -H "Authorization: Bearer ${CRON_SECRET}" \
            "${APP_URL}/api/cron/track-prices"
```

## Required GitHub secrets

- `CRON_SECRET`: Shared secret that must match the server route protection.
- `APP_URL`: Public Vercel deployment URL, for example `https://your-project.vercel.app`. You can store it as a repository variable or secret.

## Notes

- The schedule runs at 02:00, 08:00, 11:00, 14:00, 18:00, and 21:00 UTC unless you change the cron expressions.
- `workflow_dispatch` allows manual triggering during testing.
- `curl -fsS` ensures the job fails loudly on non-2xx responses.

