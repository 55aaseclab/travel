# Travel

[简体中文](README.zh-CN.md)

A bilingual itinerary viewer with route lists, day plans, budgets, preparation lists and optional map and search providers. A fresh catalog has no itineraries. Authorized operator-supplied catalogs can be built independently, and scoped business requests can update configured itineraries.

```sh
npm ci
npm run build
npm start -- --host 127.0.0.1 --port 4323
```

Open http://127.0.0.1:4323/. To publish private trips set both `TRAVEL_SEED_DIR` and `TRAVEL_PUBLIC_DIR` to directories outside Git. The built-in source includes the empty catalog and the Material Icons licensing notice. Run `npm test` for the synthetic suite.

## Managed installation

The configured web space may have an empty trip list, for example `{"version":1,"webSpace":"personal","spaces":{"personal":[]}}`. It serves an empty native catalog and signed itinerary list. No trip record is created at startup. To add a first imported catalog, supply its source JSON and metadata using the authorized content workflow, add the trip ID to the same private space map, then restart Travel. Keep `TRAVEL_DATA_DIR`, the signing key and the space ID unchanged so existing edits remain associated with their original source.

## Praxis integration

The app-owned [provider contract](docs/PRAXIS-PROVIDER.md) supplies authorized source-backed cards and data-source metadata without exposing a new HTTP endpoint. Run `npm run test:provider` for the isolated provider checks.
