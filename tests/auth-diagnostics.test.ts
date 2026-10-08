import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

// Node fetch blocks a small set of service ports. Keep test listeners above that range.
async function listenLocal(server:net.Server):Promise<void> {
  for(;;){
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    if(address && typeof address!=='string' && address.port>10240)return;
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
async function unusedPort() {
  const server=net.createServer();await listenLocal(server);
  const address=server.address();if(!address||typeof address==='string')throw new Error('No test port');
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return address.port;
}
async function localApp(url:string,key:string,extra:Record<string,string>={}) {
  const port=await unusedPort();
  const child=spawn(process.execPath,['server/index.mjs'],{
    cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),CF_API_BASE_URL:url,CF_API_MODEL:'test-model',CF_API_KEY:key,ALLOW_PRIVATE_AI_URLS:'true',ALLOWED_AI_HOSTS:'127.0.0.1',CF_API_PROTOCOL:'auto',...extra},
  });
  const logs:string[]=[];child.stderr.on('data',data=>logs.push(String(data)));
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('Test server startup timeout'));},10000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited: ${code}`));});
    child.stdout.on('data',data=>{if(String(data).includes('server listening')){clearTimeout(timer);resolve();}});
  });
  return {child,url:`http://127.0.0.1:${port}`,logs};
}
const generationBody={config:{mode:'preset',presetId:'cf-api-fan'},profileText:'只用于测试的个人材料',jobText:'测试岗位'};
const fakeKey='fake-author-test-key';

test('author preset returns distinguishable 401 and 403 without exposing Key, materials or upstream body',async()=>{
  let status=401;let auth='';
  const upstream=http.createServer((request,response)=>{
    auth=request.headers.authorization??'';request.resume();response.writeHead(status,{'Content-Type':'application/json'});
    response.end(JSON.stringify({error:{message:`upstream secret detail: ${fakeKey}`}}));
  });
  await listenLocal(upstream);
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
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1`,`  ${fakeKey}  `);
  try{await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});assert.equal(auth,`Bearer ${fakeKey}`);}
  finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('placeholder, empty and incorrectly wrapped Keys are rejected before any upstream request',async()=>{
  let calls=0;const upstream=http.createServer((request,response)=>{calls++;request.resume();response.writeHead(401);response.end();});
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
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

test('text-only generation is compatible with relays requiring string message content',async()=>{
  const generated={jobTitle:'测试岗位',resume:{name:'测试用户',role:'测试岗位'},report:{summary:'测试分析',requirements:[]},warnings:[]};
  const upstream=http.createServer((request,response)=>{
    let body='';request.on('data',chunk=>{body+=chunk;});request.on('end',()=>{
      const payload=JSON.parse(body);const compatible=typeof payload.messages?.[1]?.content==='string';
      response.writeHead(compatible?200:400,{'Content-Type':'application/json'});
      response.end(JSON.stringify(compatible?{choices:[{message:{content:JSON.stringify(generated)}}]}:{error:{code:'invalid_type',param:'messages[1].content',message:'Invalid type: expected a string for messages[1].content.'}}));
    });
  });
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1`,fakeKey);
  try{const response=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});assert.equal(response.status,200);const result=await response.json();assert.equal(result.resume.name,'测试用户');}
  finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('upstream400 is classified safely without returning its raw message, Key or resume content',async()=>{
  const upstream=http.createServer((request,response)=>{
    request.resume();response.writeHead(400,{'Content-Type':'application/json'});
    response.end(JSON.stringify({error:{code:'invalid_type',param:'messages[1].content',message:`Expected a string in messages[1].content. ${fakeKey} ${generationBody.profileText}`}}));
  });
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1`,fakeKey);
  try{
    const response=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});
    assert.equal(response.status,502);const result=await response.json();assert.equal(result.upstreamStatus,400);assert.equal(result.diagnostic,'content_type');assert.equal(result.upstreamParam,'messages[1].content');
    assert.ok(!JSON.stringify(result).includes(fakeKey));assert.ok(!JSON.stringify(result).includes(generationBody.profileText));assert.match(result.error,/字符串/);
  }finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('explicit Responses path supports generation and edit without auto-switching protocols or storing responses',async()=>{
  const requests:{path:string;body:Record<string,unknown>}[]=[];
  const generated={jobTitle:'测试岗位',resume:{name:'Responses测试用户',role:'测试岗位'},report:{summary:'测试分析',requirements:[]},warnings:[]};
  const patch={targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',reason:'请求测试',preview:'深蓝色',requiresConfirmation:false};
  const upstream=http.createServer((request,response)=>{
    let raw='';request.on('data',chunk=>raw+=chunk);request.on('end',()=>{
      requests.push({path:request.url??'',body:JSON.parse(raw)});response.writeHead(200,{'Content-Type':'application/json'});
      response.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(requests.length===1?generated:patch)}]}]}));
    });
  });
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1/responses`,fakeKey);
  try{
    const generation=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});assert.equal(generation.status,200);assert.equal((await generation.json()).resume.name,'Responses测试用户');
    const edit=await fetch(app.url+'/api/ai/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:generationBody.config,prompt:'改姓名颜色',selection:{id:'profile-name'}})});assert.equal(edit.status,200);assert.equal((await edit.json()).patch.value,'#315A64');
    assert.equal(requests.length,2);for(const request of requests){assert.equal(request.path,'/v1/responses');assert.equal(request.body.store,false);assert.equal(request.body.stream,false);assert.ok(Array.isArray(request.body.input));assert.ok(!('messages' in request.body));}
  }finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('unknown upstream400 carries visible safe context and a trace that matches application logs',async()=>{
  let calls=0;
  const upstream=http.createServer((request,response)=>{
    calls++;request.resume();response.writeHead(400,{'Content-Type':'application/json'});
    response.end(JSON.stringify({error:{message:`unrecognized relay detail: ${fakeKey} ${generationBody.profileText}`,code:fakeKey,param:generationBody.profileText}}));
  });
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw new Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1`,fakeKey,{RAILWAY_GIT_COMMIT_SHA:'abcdef1234567890',CF_API_REASONING_EFFORT:'medium'});
  try{
    const response=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});
    assert.equal(response.status,502);const payload=await response.json();assert.equal(payload.upstreamStatus,400);assert.equal(payload.diagnostic,'unknown');
    assert.equal(payload.diagnostics.protocol,'chat_completions');assert.equal(payload.diagnostics.model,'test-model');assert.equal(payload.diagnostics.reasoningEffort,'medium');assert.equal(payload.diagnostics.version,'abcdef1');
    assert.match(payload.requestId,/^[0-9a-f-]{36}$/);assert.equal(response.headers.get('x-app-request-id'),payload.requestId);
    const log=app.logs.join('');assert.match(log,/\[ai-error\]/);assert.ok(log.includes(payload.requestId));assert.ok(log.includes('chat_completions'));assert.ok(log.includes('400'));
    for(const forbidden of [fakeKey,generationBody.profileText,'unrecognized relay detail']){assert.ok(!JSON.stringify(payload).includes(forbidden));assert.ok(!log.includes(forbidden));}
    const health=await (await fetch(app.url+'/api/health')).json();assert.equal(health.version,'abcdef1');assert.equal(health.diagnosticsVersion,1);assert.equal(calls,1);
  }finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('configured deadline aborts a slow upstream once and reports waiting phase/elapsed without leaking data',async()=>{
  let calls=0;const upstream=http.createServer((request,response)=>{
    calls++;request.resume();const timer=setTimeout(()=>{response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({choices:[{message:{content:JSON.stringify({jobTitle:'测试岗位',resume:{name:'测试用户',role:'测试岗位'},report:{summary:'测试',requirements:[]}})}}]}));},1500);
    response.on('close',()=>clearTimeout(timer));
  });
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1`,fakeKey,{AI_REQUEST_TIMEOUT_MS:'1000',CF_API_REASONING_EFFORT:'high'});
  try{
    const response=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});assert.equal(response.status,504);
    const payload=await response.json();assert.equal(payload.diagnostic,'request_timeout');assert.equal(payload.diagnostics.timeoutMs,1000);assert.equal(payload.diagnostics.phase,'waiting_response');assert.ok(payload.diagnostics.elapsedMs>=900);assert.equal(payload.diagnostics.reasoningEffort,'high');assert.equal(calls,1);
    for(const text of [fakeKey,generationBody.profileText]){assert.ok(!JSON.stringify(payload).includes(text));assert.ok(!app.logs.join('').includes(text));}
  }finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('request timeout also covers slow response-body reading, not just connection headers',async()=>{
  let calls=0;const upstream=http.createServer((request,response)=>{
    calls++;request.resume();response.writeHead(200,{'Content-Type':'application/json'});response.flushHeaders();response.write('{"choices":');
    const timer=setTimeout(()=>response.end('[]}'),1500);response.on('close',()=>clearTimeout(timer));
  });
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw Error('No upstream port');
  const app=await localApp(`http://127.0.0.1:${address.port}/v1`,fakeKey,{AI_REQUEST_TIMEOUT_MS:'1000'});
  try{const response=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});assert.equal(response.status,504);const payload=await response.json();assert.equal(payload.diagnostic,'request_timeout');assert.equal(payload.diagnostics.phase,'reading_response');assert.equal(calls,1);assert.ok(payload.diagnostics.elapsedMs>=900);}
  finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});

test('upstream gateway504 is not confused with the tools own deadline',async()=>{
  let calls=0;const upstream=http.createServer((request,response)=>{calls++;request.resume();response.writeHead(504,{'Content-Type':'application/json'});response.end(JSON.stringify({message:fakeKey}));});
  await listenLocal(upstream);const address=upstream.address();if(!address||typeof address==='string')throw Error('No upstream port');const app=await localApp(`http://127.0.0.1:${address.port}/v1`,fakeKey);
  try{const response=await fetch(app.url+'/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(generationBody)});assert.equal(response.status,504);const payload=await response.json();assert.equal(payload.upstreamStatus,504);assert.equal(payload.diagnostic,'upstream_timeout');assert.equal(payload.diagnostics.timeoutMs,240000);assert.match(payload.error,/通道自身/);assert.ok(!JSON.stringify(payload).includes(fakeKey));assert.equal(calls,1);}
  finally{app.child.kill();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
});
