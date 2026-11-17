const upstream='https://http--ascend-web--gz5syg92ny7y.code.run';
const apiUpstream='https://http--ascend-api--gz5syg92ny7y.code.run';
export default {
 async fetch(request){
  const incoming=new URL(request.url);
  const selectedUpstream=incoming.pathname.startsWith('/api/v1/')?apiUpstream:upstream;
  const target=new URL(selectedUpstream);
  target.pathname=incoming.pathname;
  target.search=incoming.search;
  const headers=new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host',incoming.host);
  headers.set('x-forwarded-proto','https');
  try{
   const response=await fetch(new Request(target,{
    method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,
    redirect:'manual'
   }));
   const outgoing=new Headers(response.headers);
   const location=outgoing.get('location');
   if(location){const redirect=new URL(location,target);if(redirect.origin===selectedUpstream){redirect.host=incoming.host;redirect.protocol='https:';outgoing.set('location',redirect.href);}}
   outgoing.set('x-ascend-host','northflank');
   if(incoming.pathname.startsWith('/api/'))outgoing.set('cache-control','no-store');
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers:outgoing});
  }catch{
   return Response.json({error:'Ascend is temporarily unavailable. Please try again.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'5'}});
  }
 }
};
