import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/vk-lead-webhook-prepare.yml', 'utf8');
const compose = readFileSync('deploy/docker-compose.team.yml', 'utf8');
const runtime = readFileSync('server/runtime.mjs', 'utf8');

test('VK lead webhook setup is manual, production-scoped and does not persist the OAuth secret', () => {
  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^\s*environment: production\s*$/m);
  assert.match(workflow, /group: kordevteam-production/);
  assert.match(workflow, /secrets\.VK_LEAD_WEBHOOK_PATH_TOKEN/);
  assert.doesNotMatch(workflow, /VK_ADS_CLIENT_SECRET/);
  assert.doesNotMatch(compose.split('x-vk-ads-read-environment:')[0], /VK_ADS_CLIENT_SECRET/);
});

test('webhook token is written atomically to the protected env and never echoed', () => {
  assert.match(workflow, /stat -c '%a'.*== 600/);
  assert.match(workflow, /mktemp \/etc\/kordevteam\/\.operations\.env\.vk-lead/);
  assert.match(workflow, /chmod 0600/);
  assert.match(workflow, /mv -Tf/);
  assert.match(workflow, /tee -a "\$webhook_env_tmp" >\/dev\/null/);
  assert.doesNotMatch(workflow, /echo[^\n]*VK_LEAD_WEBHOOK_PATH_TOKEN/);
});

test('only web slots receive callback authentication and runtime mounts it before generic API parsing', () => {
  const web = compose.split('x-web: &web')[1]?.split('services:')[0] ?? '';
  const worker = compose.split('lead-worker:')[1]?.split('seo-job:')[0] ?? '';
  assert.match(web, /vk-lead-webhook-environment/);
  assert.doesNotMatch(worker, /VK_LEAD_WEBHOOK_PATH_TOKEN|vk-lead-webhook-environment/);
  assert.match(runtime, /vkLeadRouter: build\.entry\.module\.createVkLeadRouter\(\)/);
});
