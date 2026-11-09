// Manual-only Wayta production release. Never logs API response bodies or secrets.
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export const PROD = Object.freeze({
  repo: 'Elmo-Tech/restaurant-qr-platform',
  uuid: 'k9f0hhxjgktrzd9ln5m3mzsu',
  api: 'https://elmotechsoft.online/api/v1',
  compose: '/infra/docker/compose.coolify.prod.prebuilt.yml',
  web: 'waytaapp.com',
  platform: 'control.waytaapp.com',
  workflow: 'wayta-publish-ghcr-production.yml',
});
const SHA = /^[a-f0-9]{40}$/;
const KEY = 'WAYTA_PROD_IMAGE_SHA';

export function checkContext(env) {
  if (env.GITHUB_REPOSITORY !== PROD.repo || env.GITHUB_REF !== 'refs/heads/main' || !SHA.test(env.GITHUB_SHA ?? '')) {
    throw new Error('Release requires the exact main SHA of the Wayta repository.');
  }
  if (!env.GITHUB_TOKEN || !env.WAYTA_COOLIFY_API_TOKEN) throw new Error('Missing GitHub/Coolify token.');
  return env.GITHUB_SHA;
}
export function checkBuild(runs, sha) {
  if (!Array.isArray(runs) || !runs.some(r => r.head_sha === sha && r.head_branch === 'main' &&
    (r.event === 'push' || r.event === 'workflow_dispatch') && r.status === 'completed' && r.conclusion === 'success')) {
    throw new Error('No successful GHCR production-image build for this main SHA.');
  }
}
export function checkApp(app) {
  if (app?.uuid !== PROD.uuid || !String(app.git_repository ?? '').toLowerCase().includes('elmo-tech/restaurant-qr-platform') ||
      app.git_branch !== 'main') throw new Error('Coolify app/repository/branch mismatch.');
  if (app.build_pack !== 'dockercompose' || app.docker_compose_location !== PROD.compose) {
    throw new Error('Production must use the prebuilt image-only Docker Compose.');
  }
  if (app.settings?.is_auto_deploy_enabled !== false || app.settings?.is_raw_compose_deployment_enabled !== false) {
    throw new Error('Auto deploy or Raw Compose not confirmed disabled.');
  }
  const domains = JSON.stringify([app.fqdn, app.docker_compose_domains]);
  if (!domains.includes(PROD.web) || !domains.includes(PROD.platform)) throw new Error('Production domains mismatch.');
  if (/stopped|exited|unhealthy|error/i.test(String(app.status ?? ''))) throw new Error('Production not healthy.');
}
export function envValue(items, key) {
  const rows = Array.isArray(items) ? items : items?.data;
  if (!Array.isArray(rows)) throw new Error('Coolify env list not accessible.');
  const matches = rows.filter(e => e.key === key && e.is_preview !== true);
  if (matches.length !== 1 || typeof matches[0].value !== 'string') {
    throw new Error('Expected one readable production variable: ' + key);
  }
  return matches[0].value;
}
export function checkEnvs(items) {
  if (envValue(items, 'WEB_HOST') !== PROD.web || envValue(items, 'PLATFORM_HOST') !== PROD.platform) {
    throw new Error('Production host variables differ from approved domains.');
  }
  // Only new webhook registrations use WAYTA_API_PUBLIC_URL, but a stale explicit
  // value would register new Evolution callbacks against the retired menu origin.
  const rows = Array.isArray(items) ? items : items?.data;
  const publicUrlRows = rows.filter(e => e.key === 'WAYTA_API_PUBLIC_URL' && e.is_preview !== true);
  if (publicUrlRows.length > 1) throw new Error('Duplicate WAYTA_API_PUBLIC_URL variables.');
  if (publicUrlRows.length === 1 &&
      publicUrlRows[0].value !== '' &&
      publicUrlRows[0].value !== 'https://' + PROD.web) {
    throw new Error('WAYTA_API_PUBLIC_URL must use the approved production Web origin.');
  }
  const current = envValue(items, KEY);
  if (!SHA.test(current)) throw new Error('Current production image SHA unavailable.');
  return current;
}
async function getJSON(url, token, options = {}) {
  const method = options.method ?? 'GET';
  const response = await fetch(url, {
    method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  // Error response bodies can contain sensitive config. Never print them.
  if (!response.ok) throw new Error(method + ' ' + new URL(url).pathname + ': HTTP ' + response.status);
  return response.json();
}
async function github(path, token) {
  return getJSON('https://api.github.com/repos/' + PROD.repo + '/' + path, token);
}
async function requireCurrentMain(sha, token) {
  const data = await github('git/ref/heads/main', token);
  if (data?.object?.sha !== sha) throw new Error('main advanced; restart the release using current main.');
}
export async function smoke() {
  for (const url of ['https://' + PROD.web + '/', 'https://' + PROD.platform + '/login']) {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error('Public HTTPS smoke failed: ' + new URL(url).hostname + ': ' + res.status);
    await res.body?.cancel();
    console.log('HTTPS healthy: ' + new URL(url).hostname);
  }
}
async function waitDeployment(uuid, token) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const info = await getJSON(PROD.api + '/deployments/' + encodeURIComponent(uuid), token);
    const status = String(info.status ?? '').toLowerCase();
    console.log('Coolify deployment: ' + (status || 'pending'));
    if (status === 'finished' || status === 'success') return;
    if (/failed|cancelled|canceled|error/.test(status)) {
      throw new Error('Coolify deployment failed. Inspect logs and migrations; no automatic rollback.');
    }
    await sleep(15000);
  }
  throw new Error('Deployment status timeout; inspect Coolify before retrying.');
}
export async function release(env = process.env) {
  const sha = checkContext(env);
  const ghToken = env.GITHUB_TOKEN;
  const token = env.WAYTA_COOLIFY_API_TOKEN;
  await requireCurrentMain(sha, ghToken);
  const builds = await github('actions/workflows/' + PROD.workflow + '/runs?head_sha=' + sha + '&per_page=100', ghToken);
  checkBuild(builds.workflow_runs, sha);
  console.log('Verified successful production-image workflow for ' + sha);
  const appUrl = PROD.api + '/applications/' + PROD.uuid;
  checkApp(await getJSON(appUrl, token));
  const previous = checkEnvs(await getJSON(appUrl + '/envs', token));
  if (previous === sha) {
    console.log('This SHA is already pinned. No deployment triggered.');
    return { skipped: true, sha };
  }
  await requireCurrentMain(sha, ghToken);
  await getJSON(appUrl + '/envs', token, { method: 'PATCH', body: { key: KEY, value: sha } });
  if (envValue(await getJSON(appUrl + '/envs', token), KEY) !== sha) {
    throw new Error('Image SHA update not visible; no deployment attempted.');
  }
  console.log('Production SHA pinned: ' + sha);
  const response = await getJSON(PROD.api + '/deploy', token, {
    method: 'POST', body: { uuid: PROD.uuid, force: false },
  });
  const accepted = response?.deployments?.find(item => item.resource_uuid === PROD.uuid);
  if (!accepted?.deployment_uuid) throw new Error('Deployment not confirmed; inspect Coolify before retrying.');
  console.log('Coolify deployment queued: ' + accepted.deployment_uuid);
  await waitDeployment(accepted.deployment_uuid, token);
  await smoke();
  checkApp(await getJSON(appUrl, token));
  console.log('Release smoke checks passed. Manually verify tenants, uploads, Offers, WhatsApp receipt.');
  return { sha, deploymentUuid: accepted.deployment_uuid };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  release().catch(err => {
    console.error('Release stopped: ' + err.message);
    console.error('Do not retry blindly: image SHA may have changed. Check Coolify, migrations and mounts.');
    process.exitCode = 1;
  });
}
