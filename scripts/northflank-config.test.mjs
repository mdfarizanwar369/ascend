import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd=fileURLToPath(new URL('../',import.meta.url));
const inspect=`const c=(await import('./frontend/next.config.mjs')).default; const webpack=c.webpack?.({resolve:{alias:{}}}); console.log(JSON.stringify({output:c.output,rewrites:await c.rewrites(),sharedSource:webpack?.resolve.alias['@ascend/shared']}));`;
function config(extra={}) {
  const env={...process.env};
  delete env.ASCEND_NORTHFLANK_BUILD;
  delete env.ASCEND_API_PROXY_ORIGIN;
  return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',inspect],{cwd,env:{...env,...extra},encoding:'utf8',stdio:['ignore','pipe','pipe']}));
}
test('existing deployments retain their Firebase auth rewrites',()=>{
  const current=config();
  assert.equal(current.output,undefined);
  assert.equal(current.rewrites.length,2);
  assert.equal(current.rewrites[0].source,'/__/auth/:path*');
});
test('Northflank serves the existing app API path and preserves Firebase auth',()=>{
  const staged=config({ASCEND_NORTHFLANK_BUILD:'true',ASCEND_API_PROXY_ORIGIN:'https://ascend-api.example.com/'});
  assert.equal(staged.output,'standalone');
  assert.ok(staged.sharedSource.replaceAll('\\','/').endsWith('/shared/src/index.ts'));
  assert.deepEqual(staged.rewrites[0],{source:'/api/v1/:path*',destination:'https://ascend-api.example.com/api/v1/:path*'});
  assert.equal(staged.rewrites[1].source,'/__/auth/:path*');
  assert.equal(staged.rewrites[2].source,'/__/firebase/:path*');
});
test('API proxy rejects credentials, paths, and non-HTTP destinations',()=>{
  for(const origin of ['https://user:secret@example.com','https://example.com/other','https://example.com?key=x','file:///tmp']) {
    assert.throws(()=>config({ASCEND_API_PROXY_ORIGIN:origin}));
  }
});
