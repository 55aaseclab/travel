# Travel requirements

A bilingual itinerary viewer with route lists, day plans, budgets, preparation lists and optional map and search providers. A fresh catalog has no itineraries. Authorized operator-supplied catalogs can be built independently, and scoped business requests can update configured itineraries.

The standalone app opens its own view and keeps working data separate from its source. Integration with an external workbench uses the same renderer.

A managed shared-guide space can start with zero declared itineraries. It returns an empty authorized list and native catalog while the configured app remains available. Empty startup creates no itinerary records. Operators can later supply an authorized source catalog, declare its trip IDs in the private space map and restart the service; existing records and scope checks keep their meaning.

## Praxis provider

The app owns a version-1 `praxis-provider.mjs` contract for source-backed workbench cards and data-source metadata. Reads use host-supplied authorized callbacks; the provider has no direct filesystem, credential or network access. Preserve native object links, real revisions or stable content hashes, and distinct empty, partial and unavailable results. Personal card handling never modifies shared records. See [provider contract](PRAXIS-PROVIDER.md).
