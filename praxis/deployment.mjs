import { initializeDatabase } from './database.mjs';
import { createDemoIntegration } from './demo.mjs';
import { createStackIntegration } from './stack.mjs';
import { localCompose } from './local-compose.mjs';
export function createDeploymentIntegration() { return {
  initializeDatabase,
  initialDatabases: [{"path": "travel.db", "spaceId": "local", "value": null}],
  demo: createDemoIntegration(),
  stack: createStackIntegration(),
  localCompose,
  "dataId": "travel",
  "volumes": [
    "travel"
  ],
  "adapterPort": 4323,
  "runtime": {
    "TRAVEL_DATA_DIR": "/data/travel",
    "TRAVEL_REQUIRE_DATABASE": "1",
    "TRAVEL_BUSINESS_KEY_FILE": "/config/key",
    "TRAVEL_BUSINESS_CONFIG_FILE": "/config/spaces.json"
  },
  "spaces": {
    "version": 1,
    "webSpace": "${spaceId}",
    "spaces": {
      "${spaceId}": []
    }
  },
  "businessBindings": {
    "dataDir": "/data/travel",
    "businessConfigFile": "/app-config/travel/spaces.json"
  },
  "initialFiles": [],
  "native": {
    "dockerfile": "Dockerfile.praxis",
    "command": [
      "node",
      "src/server.js"
    ]
  }
}; }
