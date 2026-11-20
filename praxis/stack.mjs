import { access, lstat, readFile, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
const isWithin = (parent, child) => { const path = relative(resolve(parent), resolve(child)); return path === '' || (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path)); };
const bind = (source, target, read_only) => ({ type: 'bind', source, target, read_only, bind: { create_host_path: false } });
async function resolveTravelBusinessRuntime(app, { registered, home, uid, workspace, protectedPaths, privateFiles, businessFile }) {
  if (app === undefined) return null;
  if (!app || typeof app !== 'object' || Array.isArray(app) || app.url !== 'http://127.0.0.1:4323/api/business' || !Array.isArray(app.spaces) || app.spaces.length !== 1 || typeof app.spaces[0] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(app.spaces[0])) throw new Error('Travel business runtime requires one explicit pilot space and its fixed local adapter.');
  protectedPaths = protectedPaths.filter(path => typeof path === 'string');
  privateFiles = privateFiles.filter(path => typeof path === 'string').map(path => resolve(path));
  const dataDir = ctxAbsolutePath(app.dataDir, home), keyFile = ctxAbsolutePath(app.keyFile, home), configFile = ctxAbsolutePath(app.businessConfigFile, home);
  if (dataDir !== registered('travel', 'itineraries', 'directory')) throw new Error('Travel business data must match its registered travel/itineraries directory.');
  const overlaps = (left, right) => isWithin(left, right) || isWithin(right, left);
  const broad = ['/', '/tmp', '/var', '/var/lib', '/run', '/etc', '/opt', '/mnt', '/media', '/home', home];
  if ([dataDir, keyFile, configFile].some(path => /[\0\r\n$]/.test(path)) || broad.includes(dataDir) || dataDir.split('/').filter(Boolean).length < 3 || dataDir.split('/').some(part => ['.git', '.ssh', '.gnupg', '.aws', '.kube', '.docker'].includes(part)) || ['/proc', '/sys', '/dev', '/etc', '/usr', '/bin', '/sbin', '/lib', '/run'].some(root => isWithin(root, dataDir)) || privateFiles.some(path => isWithin(dataDir, path)) || [workspace, ...protectedPaths, dirname(keyFile), dirname(configFile), dirname(businessFile)].some(path => overlaps(dataDir, resolve(path)))) throw new Error('Travel business data requires a dedicated private directory outside source, credentials, controls and other applications.');
  const info = await lstat(dataDir).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!info?.isDirectory() || info.isSymbolicLink() || info.uid !== Number(uid) || (info.mode & 0o777) !== 0o700 || await realpath(dataDir) !== dataDir) throw new Error('The registered Travel business directory must already exist as a canonical private mode700 directory; no replacement will be created.');
  await access(dataDir, constants.R_OK | constants.W_OK);
  if (keyFile === configFile || [keyFile, configFile].some(path => privateFiles.includes(path))) throw new Error('Travel business credentials and mapping require separate files.');
  for (const [path, minimum, maximum] of [[keyFile, 32, 4096], [configFile, 2, 65536]]) {
    const file = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    const parent = await stat(dirname(path)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!file?.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.uid !== Number(uid) || (file.mode & 0o777) !== 0o600 || file.size < minimum || file.size > maximum || !parent?.isDirectory() || parent.uid !== Number(uid) || (parent.mode & 0o077) !== 0 || await realpath(path) !== path || [workspace, ...protectedPaths].some(root => isWithin(resolve(root), path))) throw new Error('Travel business key and mapping require separate canonical private mode600 files outside source, data and controls.');
    await access(path, constants.R_OK);
  }
  let mapping;
  try { mapping = JSON.parse(await readFile(configFile, 'utf8')); } catch { throw new Error('Travel business mapping must be valid bounded JSON.'); }
  const space = app.spaces[0];
  const approvedTrips = new Set(['western-sichuan-2026', 'daxinganling-2026', 'changbaishan-2026']);
  const trips = mapping?.spaces?.[space];
  const validTrips = Array.isArray(trips) && trips.length >= 1 && trips.length <= approvedTrips.size && new Set(trips).size === trips.length && trips.every(id => approvedTrips.has(id));
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || Object.keys(mapping).some(key => !['version', 'webSpace', 'spaces'].includes(key)) || mapping.version !== 1 || mapping.webSpace !== space || !mapping.spaces || typeof mapping.spaces !== 'object' || Array.isArray(mapping.spaces) || Object.keys(mapping.spaces).length !== 1 || !Object.hasOwn(mapping.spaces, space) || !validTrips) throw new Error('Travel business mapping must bind the single pilot space to the approved itinerary IDs.');
  return { dataDir, keyFile, configFile };
}

const ctxAbsolutePath = (value, home) => { if (typeof value !== 'string' || !value || /[\r\n\0]/.test(value)) throw new Error('Configuration paths must be nonempty single-line strings.'); const path = value === '~' ? home : value.startsWith('~/') ? join(home, value.slice(2)) : value; if (!isAbsolute(path)) throw new Error('Configuration paths must be absolute.'); return resolve(path); };
export function createStackIntegration() { return {
services: [{ name: 'travel', port: 4323 }],
order: 10,
async resolveRuntime(ctx) { const { registered, home, uid, workspace, config, configFile, publicUrlsFile, stateRoot, controlRoot, observationsDir, env, appsRoot, baseDataDirectories } = ctx; const businessFile = ctx.businessFile; const travelBusiness = await resolveTravelBusinessRuntime(ctx.business?.apps?.travel, { registered, home, uid, workspace, businessFile, protectedPaths: ctx.protectedFor({ excludeSources: [{ id: 'travel', target: 'itineraries' }] }), privateFiles: ctx.privateFor({ except: 'travel', fields: ['keyFile','spacesFile'], repositoryCredentials: true }) });   const candidate = ctxAbsolutePath(env.PRAXIS_TRAVEL_AMAP_CONFIG || join(home, '.config/praxis/secrets/travel-amap.json'), home);
  const mapInfo = await lstat(candidate).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  let travelMapConfigFile = '';
  if (mapInfo) {
    const parent = await stat(dirname(candidate));
    if (!mapInfo.isFile() || mapInfo.isSymbolicLink() || mapInfo.nlink !== 1 || mapInfo.uid !== Number(uid) || (mapInfo.mode & 0o777) !== 0o600 || parent.uid !== Number(uid) || (parent.mode & 0o077) !== 0 || await realpath(candidate) !== candidate || isWithin(workspace, candidate) || [appsRoot, stateRoot, controlRoot, observationsDir, ...baseDataDirectories, ...(travelBusiness ? [travelBusiness.dataDir] : [])].some(path => isWithin(path, candidate))) throw new Error('Travel map credentials require a private canonical mode600 file outside source, data and runtime controls.');
    travelMapConfigFile = candidate;
  } else if (env.PRAXIS_TRAVEL_AMAP_CONFIG) throw new Error('The configured Travel map credential file is missing.');
  if (travelBusiness && [travelBusiness.keyFile, travelBusiness.configFile].includes(travelMapConfigFile)) throw new Error('Travel business bindings must remain separate from map credentials.');
  const fliggyCandidate = ctxAbsolutePath(env.PRAXIS_TRAVEL_FLIGGY_CONFIG || join(home, '.config/praxis/secrets/travel-fliggy.json'), home);
  const fliggyInfo = await lstat(fliggyCandidate).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  let travelFliggyConfigFile = '';
  if (fliggyInfo) {
    const parent = await stat(dirname(fliggyCandidate));
    const excluded = [configFile, publicUrlsFile, config.businessConfigFile, travelMapConfigFile, ...(travelBusiness ? [travelBusiness.keyFile, travelBusiness.configFile] : [])].filter(Boolean);
    if (!fliggyInfo.isFile() || fliggyInfo.isSymbolicLink() || fliggyInfo.nlink !== 1 || fliggyInfo.uid !== Number(uid) || (fliggyInfo.mode & 0o777) !== 0o600 || fliggyInfo.size < 2 || fliggyInfo.size > 16384 || parent.uid !== Number(uid) || (parent.mode & 0o077) !== 0 || await realpath(fliggyCandidate) !== fliggyCandidate || excluded.includes(fliggyCandidate) || isWithin(workspace, fliggyCandidate) || [appsRoot, stateRoot, controlRoot, observationsDir, ...baseDataDirectories, ...(travelBusiness ? [travelBusiness.dataDir] : [])].some(path => isWithin(path, fliggyCandidate))) throw new Error('Travel Fliggy credentials require a separate private canonical mode600 file outside source, data and runtime controls.');
    travelFliggyConfigFile = fliggyCandidate;
  } else if (env.PRAXIS_TRAVEL_FLIGGY_CONFIG) throw new Error('The configured Travel Fliggy credential file is missing.');
 const shareManifestFile = ctx.webGateway ? ctxAbsolutePath(ctx.business.webGateway.shareManifestFile || join(home, '.config/praxis/web-gateway/travel-shares.json'), home) : ''; return { settings: { travelBusiness, travelMapConfigFile, travelFliggyConfigFile, shareManifestFile, travelMapOverrideFile: join(controlRoot, 'compose.travel-map.json') }, sourceMap: travelBusiness ? { travelItineraries: travelBusiness.dataDir } : {} }; },
overlayFilename: 'compose.travel-map.json',
environment: ({ settings }) => ({ PRAXIS_TRAVEL_SHARES_FILE: settings.shareManifestFile || '' }),
compose({ settings }) {   const travelEnvironment = {}, travelVolumes = [];
  if (settings.travelMapConfigFile) {
    Object.assign(travelEnvironment, { TRAVEL_AMAP_CONFIG: '/run/secrets/travel-amap.json', ...(settings.canonicalUrl ? { TRAVEL_AMAP_ORIGIN: settings.canonicalUrl } : {}) });
    travelVolumes.push({ type: 'bind', source: settings.travelMapConfigFile, target: '/run/secrets/travel-amap.json', read_only: true, bind: { create_host_path: false } });
  }
  if (settings.travelFliggyConfigFile) {
    travelEnvironment.TRAVEL_FLIGGY_CONFIG = '/run/secrets/travel-fliggy.json';
    travelVolumes.push({ type: 'bind', source: settings.travelFliggyConfigFile, target: '/run/secrets/travel-fliggy.json', read_only: true, bind: { create_host_path: false } });
  }
  if (settings.travelBusiness) {
    Object.assign(travelEnvironment, { TRAVEL_DATA_DIR: '/data/itineraries', TRAVEL_BUSINESS_KEY_FILE: '/run/secrets/travel-business-key', TRAVEL_BUSINESS_CONFIG_FILE: '/run/config/travel-business.json' });
    travelVolumes.push(...[
      { source: settings.travelBusiness.dataDir, target: '/data/itineraries', read_only: false },
      { source: settings.travelBusiness.keyFile, target: '/run/secrets/travel-business-key', read_only: true },
      { source: settings.travelBusiness.configFile, target: '/run/config/travel-business.json', read_only: true },
    ].map(binding => ({ type: 'bind', ...binding, bind: { create_host_path: false } })));
  }
  if (settings.workingPaths) {
    travelEnvironment.TRAVEL_CONTENT_ROOT = '/data/content';
    travelVolumes.push({ type: 'bind', source: settings.workingPaths.travelContent, target: '/data/content', read_only: true, bind: { create_host_path: false } });
  }
 return { services: travelVolumes.length ? { travel: { environment: travelEnvironment, volumes: travelVolumes } } : {} }; },
async validateData({ settings, validateContent }) { if (settings.workingPaths) await validateContent({ directories: [settings.workingPaths.travelContent], files: ['catalog/trips.json','catalog/routes.json','catalog/photo-credits.json','published/index.html'].map(name => ({ path: join(settings.workingPaths.travelContent, name) })) }); }
}; }
