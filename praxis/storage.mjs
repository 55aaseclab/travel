import { join } from 'node:path';
import { projectInventory } from './inventory.mjs';
export function createStorageIntegration() { return {
  recovery: { configFields: ['dataDir'], async collect(ctx) { await ctx.register({kind:'sqlite',source:ctx.path('dataDir','travel.db'),target:'travel.db'}); } },
  inventory: { project: projectInventory },
  "rootId": "travel",
  "paths": {
    "travel": "itineraries",
    "travelContent": "content"
  },
  "sources": [
    {
      "kind": "sqlite",
      "path": "travel",
      "relative": "travel.db",
      "target": "travel.db"
    },
    {
      "kind": "directory",
      "path": "travelContent",
      "target": "content"
    }
  ],
  "omissions": [
    "Travel checklists stored in a browser require an export or a backup of that browser profile."
  ],
  relocation: {
  "businessBindings": {
    "dataDir": "travel"
  },
  "registeredRoots": [
    {
      "target": "content",
      "path": "travelContent"
    }
  ]
}
}; }
