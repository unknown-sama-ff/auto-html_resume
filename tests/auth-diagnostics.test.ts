import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

async function unusedPort() {
  const server=net.createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No test port');
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return address.port;
}
async function localApp(url:string,key:string) {
  const port=await unusedPort();
  const child=spawn(process.execPath,['server/index.mjs'],{
    cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),CF_API_BASE_URL:url,CF_API_MODEL:'test-model',CF_API_KEY:key,ALLOW_PRIVATE_AI_URLS:'true',ALLOWED_AI_HOSTS:'127.0.0.1'},
  });
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('Test server startup timeout'));},10000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited: ${code}`));});
    child.stdout.on('data',data=>{if(String(data).includes('server listening')){clearTimeout(timer);resolve();}});
  });
  return {child,url:`http://127.0.0.1:${port}`};
}
const generationBody={config:{mode:'preset',presetId:'cf-api-fan'},profileText:'只用于测试的个人材料',jobText:'测试岗位'};
const fakeKey='fake-author-test-key';

test('author preset returns distinguishable 401 and 403 without exposing Key, materials or upstream body',async()=>{
  let status=401;let auth='';
  const upstream=http.createServer((request,response)=>{
    auth=request.headers.authorization??'';request.resume();response.writeHead(status,{'Content-Type':'application/json'});
    response.end(JSON.stringify({error:{message:`upstream secret detail: ${fakeKey}`}}));
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1`,fakeKey);
  try {
    for(const code of [401,403]) {
      status=code;const response=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});
      assert.equal(response.status,502);const payload=await response.json();
      assert.equal(payload.upstreamStatus,code);assert.match(payload.error,new RegExp(String(code)));
      assert.equal(auth,`Bearer ${fakeKey}`);assert.ok(!JSON.stringify(payload).includes(fakeKey));assert.ok(!JSON.stringify(payload).includes('upstream secret detail'));assert.ok(!JSON.stringify(payload).includes(generationBody.profileText));
    }
  } finally {app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('preset Key trims copy-paste edge whitespace before building Bearer header',async()=>{
  let auth='';const upstream=http.createServer((request,response)=>{auth=request.headers.authorization??'';request.resume();response.writeHead(401,{'Content-Type':'application/json'});response.end('{}');});
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1`,`  ${fakeKey}  `);
  try{await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});assert.equal(auth,`Bearer ${fakeKey}`);}
  finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('placeholder, empty and incorrectly wrapped Keys are rejected before any upstream request',async()=>{
  let calls=0;const upstream=http.createServer((request,response)=>{calls++;request.resume();response.writeHead(401);response.end();});
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
  try {
    for(const key of ['REPLACE_WITH_YOUR_NEW_API_KEY','   ',`Bearer ${fakeKey}`,`"${fakeKey}"`]){
      const app=await localApp(`http://127.0.0.1:${address.port}/v1`,key);
      try{
        const response=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});
        assert.equal(response.status,400);const payload=await response.json();assert.match(payload.error,/CF_API_KEY/);assert.ok(!payload.error.includes(fakeKey));
      }finally{app.child.kill();}
    }
    assert.equal(calls,0);
  }finally{upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});
