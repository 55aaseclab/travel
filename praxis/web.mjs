import { authorizeTravelShare, readTravelShares, validateShareManifest } from './share.mjs';
export function createWebIntegration() {
  return {
    "slug": "travel",
    "policy": "grant",
    "kind": "proxy",
    share: {prefix:"/share/travel/",configurationKey:"travelSharesFile",configurationEnv:"PRAXIS_TRAVEL_SHARES_FILE",format:"travel-share-v1",authorize:authorizeTravelShare,read:readTravelShares,validate:validateShareManifest},
    "nativePort": 4323
  };
}
