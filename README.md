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

## Praxis registration

App release: `0.1.18`. The app owns [`praxis-app.json`](praxis-app.json), its English and Simplified Chinese presentation, the icon at `public/praxis-icon.svg`, the declared PRD locations and any legacy icon aliases. `schemaVersion: 1` identifies the registration format; it is separate from this app release and from data, protocol and document revisions. Package and lockfile release metadata, where present, agree with the declaration.

[`apps.example.json`](apps.example.json) registers a local alias by referencing `./praxis-app.json` and `http://127.0.0.1:4323/`. Start the standalone service described above before using the example; registration does not start a backend or grant account, administrator or business-data access. Installation origins, data locations and access policy remain separately configured.
