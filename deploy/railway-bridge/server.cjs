'use strict';
const http=require('node:http');
const https=require('node:https');
const upstream=new URL(process.env.ASCEND_BRIDGE_UPSTREAM || 'https://http--ascend-api--gz5syg92ny7y.code.run');
if(upstream.protocol!=='https:' || upstream.host!=='http--ascend-api--gz5syg92ny7y.code.run' || upstream.pathname!=='/' || upstream.search || upstream.username)throw Error('Unexpected migration upstream');
const maintenance=process.env.ASCEND_BRIDGE_MAINTENANCE!=='false';
const allowedOrigins=new Set((process.env.CORS_ORIGIN||'https://www.getascend.fit').split(',').map(x=>x.trim()));
const hop=new Set(['host','connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
const agent=new https.Agent({keepAlive:true,maxSockets:32,timeout:180000});
function send(res,status,message){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'5'});res.end(JSON.stringify({error:message}));}
const server=http.createServer((req,res)=>{
 const path=(req.url||'/').split('?')[0];
 if(path==='/_migration/health'||(path==='/api/v1/health/ready'&&maintenance)){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:'ok',service:'ascend-compatibility-bridge',maintenance}));return;}
 if(req.headers.origin && allowedOrigins.has(req.headers.origin)){
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');
 }
 if(req.method==='OPTIONS'){
  res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Ascend-Edition,X-Cron-Secret','Access-Control-Max-Age':'600'});res.end();return;
 }
 if(maintenance){send(res,503,'Ascend is moving your data safely. Please try again in a moment.');return;}
 if(!path.startsWith('/api/v1/')){send(res,404,'Not found');return;}
 const headers={};for(const [key,value] of Object.entries(req.headers)){if(!hop.has(key))headers[key]=value;}
 // Keep the exact method, URL, query string and request bytes, including signed webhooks.
 headers.host=upstream.host;headers['x-forwarded-proto']='https';
 const proxy=https.request({hostname:upstream.hostname,port:443,path:req.url,method:req.method,headers,agent,timeout:180000},response=>{
  const out={};for(const [key,value] of Object.entries(response.headers)){if(!hop.has(key))out[key]=value;}
  if(req.headers.origin&&allowedOrigins.has(req.headers.origin)){out['access-control-allow-origin']=req.headers.origin;out['access-control-allow-credentials']='true';out.vary='Origin';}
  out['cache-control']='no-store';res.writeHead(response.statusCode||502,out);response.pipe(res);
 });
 proxy.on('timeout',()=>proxy.destroy(Error('upstream timeout')));
 proxy.on('error',()=>{if(!res.headersSent)send(res,503,'Ascend is temporarily unavailable. Please try again.');else res.destroy();});
 req.on('aborted',()=>proxy.destroy());res.on('close',()=>{if(!res.writableFinished)proxy.destroy();});req.pipe(proxy);
});
server.listen(Number(process.env.PORT||4000),'0.0.0.0',()=>console.log('Ascend compatibility bridge ready'));
function stop(){server.close(()=>{agent.destroy();process.exit(0);});setTimeout(()=>process.exit(1),70000).unref();}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
