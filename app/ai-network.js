/* AI-only transport: Android native HTTP; browser fetch for HTML preview. */
(function(){
 'use strict';
 const browserFetch=window.fetch.bind(window),pending=new Map();let serial=0,lastError=null,testBusy=false;
 function redact(value,key=''){
  let text=String(value||'');if(key)text=text.split(key).join('[已隐藏]');
  return text.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [已隐藏]').replace(/\bsk-[A-Za-z0-9_-]+/g,'[已隐藏]').slice(0,360);
 }
 function failure(message,code='NETWORK',status=0){const e=new Error(message);e.code=code;e.status=status;return e;}
 function endpoint(base){
  let url;try{url=new URL(String(base||'').trim());}catch(_){throw failure('接口地址无效，请填写完整的 HTTPS 地址','CONFIG');}
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.username||url.password||url.search||url.hash)throw failure('外部接口请使用 HTTPS；地址中不要填写密钥、查询参数或片段','CONFIG');
  const path=url.pathname.replace(/\/+$/,'');url.pathname=path.endsWith('/chat/completions')?path:path+'/chat/completions';return url.href;
 }
 function nativeRequest(url,options,timeout){
  return new Promise((resolve,reject)=>{
   const id='qys-ai-'+Date.now()+'-'+(++serial),headers=new Headers(options.headers||{});
   const timer=setTimeout(()=>{pending.delete(id);window.QYSAndroidAI.cancel(id);reject(failure('模型请求超时，请稍后重试','TIMEOUT'));},timeout);
   pending.set(id,{resolve,reject,timer});
   try{window.QYSAndroidAI.request(id,JSON.stringify({url,authorization:headers.get('authorization')||'',body:options.body||'{}'}));}
   catch(_){clearTimeout(timer);pending.delete(id);reject(failure('原生网络通道未就绪，请重新打开应用','BRIDGE'));}
  });
 }
 function receive(id,result){
  const job=pending.get(id);if(!job)return;pending.delete(id);clearTimeout(job.timer);
  if(result?.error)job.reject(failure(String(result.message||'模型请求失败'),String(result.error)));
  else if(!Number.isInteger(result?.status)||typeof result.body!=='string')job.reject(failure('模型服务响应格式无效','FORMAT'));
  else job.resolve(result);
 }
 function providerError(status,data,key){
  const tips={400:'请求参数不被支持，请检查模型与接口配置',401:'密钥未通过验证，请核对对应服务的 API Key',403:'无权访问，请检查模型权限或套餐使用范围',404:'未找到接口或模型，请检查地址和模型名称',408:'模型服务响应超时',429:'请求受限，请检查额度或稍后重试'};
  const tip=tips[status]||(status>=500?'模型服务暂时异常，请稍后重试':status>=300&&status<400?'接口发生重定向，请填写最终接口地址':'模型服务返回错误');
  const detail=redact(data?.error?.message||data?.message||'',key),code=redact(data?.error?.code||'HTTP_ERROR',key);
  return failure('HTTP '+status+' · '+tip+(detail?'。服务提示：'+detail:''),code,status);
 }
 async function request(url,options={}){
  lastError=null;let key='';
  try{
   url=endpoint(url);key=(new Headers(options.headers||{}).get('authorization')||'').replace(/^Bearer\s+/i,'');
   const timeout=Math.max(100,Math.min(90000,Number(options.timeoutMs)||75000));let raw;
   if(window.QYSAndroidAI&&typeof window.QYSAndroidAI.request==='function')raw=await nativeRequest(url,options,timeout);
   else {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{const response=await browserFetch(url,{...options,method:'POST',signal:controller.signal,redirect:'error'});raw={status:response.status,body:await response.text()};}
    catch(error){if(controller.signal.aborted)throw failure('模型请求超时，请稍后重试','TIMEOUT');throw failure('网页请求失败，可能被跨域或网络策略拦截；Android 版请更新后重试','BROWSER_NETWORK');}
    finally{clearTimeout(timer);}
   }
   let data;try{data=JSON.parse(raw.body);}catch(_){if(raw.status<200||raw.status>=300)throw providerError(raw.status,null,key);throw failure('服务已响应，但没有返回有效 JSON，请检查接口协议','FORMAT',raw.status);}
   if(raw.status<200||raw.status>=300||data.error)throw providerError(raw.status,data,key);
   const message=data.choices?.[0]?.message;
   if(message&&Array.isArray(message.content))message.content=message.content.map(p=>p.text||'').join('');
   if(!message||typeof message.content!=='string'||!message.content.trim()){
    const reason=data.choices?.[0]?.finish_reason;
    throw failure(reason==='length'?'服务已连通，但输出额度耗尽后仍未返回正式回答，请调整模型思考或输出设置':'服务已连通，但未返回正式回答，请检查模型和接口协议','EMPTY_RESPONSE',raw.status);
   }
   return {ok:true,status:raw.status,json:async()=>data};
  }catch(error){
   const e=failure(redact(error.message||'请求失败',key),error.code||'NETWORK',error.status||0);lastError={message:e.message,code:e.code,status:e.status,at:Date.now()};throw e;
  }
 }
 function failureMessage(fallback){return lastError?.message||fallback;}
 function showAnalysisFailure(error){
  const target=document.getElementById('aiResultBody');if(!target)return;
  let note=document.getElementById('qys-ai-network-error');if(!note){note=document.createElement('p');note.id='qys-ai-network-error';note.setAttribute('role','status');note.style.cssText='font-size:13px;line-height:1.7;color:var(--text3);margin-top:12px';target.parentElement.append(note);}
  note.textContent='结算已保存在本机，当前展示内置规则分析。AI 暂不可用：'+(lastError?.message||'请检查模型配置后重试');
 }
 window.QYSAITransport={fetch:request,receive,endpoint,failureMessage,showAnalysisFailure,get lastError(){return lastError;},get pendingCount(){return pending.size;},get mode(){return window.QYSAndroidAI?'native':'browser';}};
 App.testAi=async function(){
  if(testBusy)return;const cfg={baseUrl:document.getElementById('aiBase').value.trim(),model:document.getElementById('aiModel').value.trim(),apiKey:document.getElementById('aiKey').value.trim()};
  const button=document.querySelector('button[onclick="App.testAi()"]');let output=document.getElementById('qys-ai-test-result');
  if(!output){output=document.createElement('p');output.id='qys-ai-test-result';output.setAttribute('role','status');output.style.cssText='font-size:14px;line-height:1.7;overflow-wrap:anywhere;margin:14px 0;color:var(--text3)';button.after(output);}
  if(!cfg.apiKey||!cfg.baseUrl||!cfg.model){output.textContent='请先填全接口地址、模型和 API Key';return;}
  testBusy=true;button.disabled=true;button.textContent='测试中…';output.textContent='正在连接模型服务…';
  try{
   const body={model:cfg.model,messages:[{role:'user',content:'请只回复一个字：好'}],max_tokens:512};
   const url=endpoint(cfg.baseUrl);if(new URL(url).hostname==='ark.cn-beijing.volces.com'&&/^deepseek-v4/.test(cfg.model))body.thinking={type:'disabled'};
   const response=await request(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+cfg.apiKey},body:JSON.stringify(body)});
   await response.json();if(output.isConnected)output.textContent='连接成功，已收到模型正式回答';
  }catch(error){if(output.isConnected)output.textContent='连接失败：'+error.message;}
  finally{testBusy=false;if(button.isConnected){button.disabled=false;button.textContent='测试连接';}}
 };
 window.addEventListener('pagehide',()=>{for(const [id,job]of pending){clearTimeout(job.timer);window.QYSAndroidAI?.cancel(id);job.reject(failure('页面已关闭，请重新发起请求','CANCELLED'));}pending.clear();});
})();
