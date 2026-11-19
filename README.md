# Travel

[简体中文](README.zh-CN.md)

A bilingual itinerary viewer with route lists, day plans, budgets, preparation lists and optional map and search providers. A fresh catalog has no itineraries. Authorized operator-supplied catalogs can be built independently, and scoped business requests can update configured itineraries.

```sh
npm ci
npm run build
npm start -- --host 127.0.0.1 --port 4323
```

Open http://127.0.0.1:4323/. To publish private trips set both `TRAVEL_SEED_DIR` and `TRAVEL_PUBLIC_DIR` to directories outside Git. The built-in source includes the empty catalog and the Material Icons licensing notice. Run `npm test` for the synthetic suite.
