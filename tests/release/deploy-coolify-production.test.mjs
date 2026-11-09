import test from 'node:test';
import assert from 'node:assert/strict';
import { PROD, checkContext, checkBuild, checkApp, checkEnvs, release } from '../../scripts/release/deploy-coolify-production.mjs';
const sha = 'a'.repeat(40);
const prev = 'b'.repeat(40);
const validApp = () => ({
  uuid: PROD.uuid, git_repository: PROD.repo, git_branch: 'main',
  docker_compose_location: PROD.compose, build_pack: 'dockercompose',
  status: 'running:healthy', fqdn: 'https://' + PROD.web + ',https://' + PROD.platform,
  settings: { is_auto_deploy_enabled: false, is_raw_compose_deployment_enabled: false },
});
const envs = (pin = prev) => [
  {key: 'WEB_HOST', value: PROD.web, is_preview: false},
  {key: 'PLATFORM_HOST', value: PROD.platform, is_preview: false},
  {key: 'WAYTA_PROD_IMAGE_SHA', value: pin, is_preview: false},
];
const releaseEnv = () => ({
  GITHUB_REPOSITORY: PROD.repo, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha,
  GITHUB_TOKEN: 'mock-github-token', WAYTA_COOLIFY_API_TOKEN: 'mock-coolify-token',
});
const build = () => ({head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success'});
const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
function mockApi({app=validApp(), oldSha=prev, latestSha=sha, builds=[build()]}={}) {
  const calls=[];
  let pinned=oldSha;
  const original=globalThis.fetch;
  globalThis.fetch=async (url, opts={}) => {
    const p=new URL(url).pathname;
    const method=opts.method??'GET';
    calls.push({p, method, body: opts.body ? JSON.parse(opts.body):null});
    if (p.endsWith('/git/ref/heads/main')) return json({object:{sha:latestSha}});
    if (p.endsWith('/actions/workflows/wayta-publish-ghcr-production.yml/runs')) return json({workflow_runs: builds});
    if (p.endsWith('/applications/'+PROD.uuid) && method==='GET') return json(app);
    if (p.endsWith('/applications/'+PROD.uuid+'/envs') && method==='GET') return json(envs(pinned));
    if (p.endsWith('/applications/'+PROD.uuid+'/envs') && method==='PATCH') {
      pinned=JSON.parse(opts.body).value;
      return json({key:'WAYTA_PROD_IMAGE_SHA'},201);
    }
    if (p==='/api/v1/deploy' && method==='POST') return json({deployments:[{resource_uuid:PROD.uuid,deployment_uuid:'mock-deploy'}]});
    if (p.endsWith('/deployments/mock-deploy')) return json({status:'finished'});
    if (p==='/' || p==='/login') return new Response('ok',{status:200});
    throw new Error('Unexpected: '+method+' '+p);
  };
  return {calls, restore:()=>{ globalThis.fetch=original; }};
}
test('must run against main in the correct repository with both credentials',()=>{
  assert.equal(checkContext(releaseEnv()),sha);
  assert.throws(()=>checkContext({...releaseEnv(),GITHUB_REF:'refs/heads/development'}),/main/);
  assert.throws(()=>checkContext({...releaseEnv(),WAYTA_COOLIFY_API_TOKEN:undefined}),/Missing/);
});
test('image build must be successful, for main and the exact SHA',()=>{
  assert.doesNotThrow(()=>checkBuild([build()],sha));
  assert.throws(()=>checkBuild([{...build(),head_sha:prev}],sha),/No successful/);
  assert.throws(()=>checkBuild([{...build(),event:'pull_request'}],sha),/No successful/);
  assert.throws(()=>checkBuild([{...build(),conclusion:'failure'}],sha),/No successful/);
});
test('Coolify app safety: exact UUID, hosts, compose and manual-only settings',()=>{
  assert.doesNotThrow(()=>checkApp(validApp()));
  assert.throws(()=>checkApp({...validApp(),uuid:'development'}),/mismatch/);
  assert.throws(()=>checkApp({...validApp(),docker_compose_location:'/infra/docker/compose.coolify.yml'}),/prebuilt/);
  assert.throws(()=>checkApp({...validApp(),fqdn:'https://'+PROD.web}),/domains/);
  assert.throws(()=>checkApp({...validApp(),settings:{...validApp().settings,is_auto_deploy_enabled:true}}),/Auto deploy/);
});
test('Coolify envs must have one readable production SHA and correct hosts',()=>{
  assert.equal(checkEnvs(envs()),prev);
  assert.throws(()=>checkEnvs([...envs(),{key:'WAYTA_PROD_IMAGE_SHA',value:sha}]),/one readable/);
  assert.throws(()=>checkEnvs(envs('*****')),/unavailable/);
  assert.throws(()=>checkEnvs(envs().map(e=>e.key==='WEB_HOST'?{...e,value:'wrong.example'}:e)),/hosts/);
});
test('promotes exactly one SHA and deploys only the allowlisted app',async()=>{
  const m=mockApi();
  try {
    const result=await release(releaseEnv());
    assert.equal(result.deploymentUuid,'mock-deploy');
    const writes=m.calls.filter(c=>c.method!=='GET');
    assert.deepEqual(writes.map(x=>x.method),['PATCH','POST']);
    assert.deepEqual(writes[0].body,{key:'WAYTA_PROD_IMAGE_SHA',value:sha});
    assert.deepEqual(writes[1].body,{uuid:PROD.uuid,force:false});
  } finally {m.restore();}
});
test('skips deployment when the current release is already pinned',async()=>{
  const m=mockApi({oldSha:sha});
  try {
    assert.equal((await release(releaseEnv())).skipped,true);
    assert.equal(m.calls.filter(c=>c.method!=='GET').length,0);
  } finally {m.restore();}
});
test('refuses deployment when main has moved or no build succeeded',async()=>{
  for(const p of [{latestSha:prev},{builds:[]}]) {
    const m=mockApi(p);
    try {
      await assert.rejects(release(releaseEnv()));
      assert.equal(m.calls.filter(c=>c.method!=='GET').length,0);
    } finally {m.restore();}
  }
});
test('refuses source-building Compose without writes',async()=>{
  const m=mockApi({app:{...validApp(),docker_compose_location:'/infra/docker/compose.coolify.yml'}});
  try {
    await assert.rejects(release(releaseEnv()),/prebuilt/);
    assert.equal(m.calls.filter(c=>c.method!=='GET').length,0);
  } finally {m.restore();}
});
