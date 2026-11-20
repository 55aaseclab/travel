import { projectInventory } from './inventory.mjs';
export function createStorageIntegration() { return {
  inventory: { project: projectInventory },
  "rootId": "travel",
  "paths": {
    "travel": "itineraries",
    "travelContent": "content"
  },
  "sources": [
    {
      "kind": "directory",
      "path": "travel",
      "target": "itineraries"
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
