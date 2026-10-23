/* 正式启动展示：播放动效，等待原数据准备完成，然后自动进入。 */
(function () {
  'use strict';
  const originalBoot=App.boot.bind(App);
  const originalRoute=App.route.bind(App);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const Startup={
    active:false,ready:false,leaving:false,pending:null,target:null,
    render(){
      document.querySelector('#tabbar').style.display='none';
      App.state.view='launch';
      App.setView('launch','<section class="ui-splash-screen" aria-label="钱有数启动页">'+
        '<div class="ui-splash-brand"><div class="ui-splash-icon"><img src="assets/app-icon-v3.png" width="152" height="152" alt="数数抱着金币的钱有数应用图标" fetchpriority="high"></div><h1>钱有数</h1><p class="ui-splash-tagline">让每一分钱，都有数</p><svg class="ui-splash-mark" viewBox="0 0 90 22" aria-hidden="true"><path d="M8 17h18l13-5 12 3 22-10m-8 0h8v8"/></svg></div>'+
        '<footer class="ui-splash-footer" hidden><p id="launchState" class="ui-splash-status" role="alert"></p></footer></section>');
      document.querySelector('#v-launch').classList.add('ui-splash');
    },
    async prepare(){
      const started=performance.now();
      try{
        if(window.seedQYSPreview)await window.seedQYSPreview();
        await originalBoot();
        this.ready=true;
        await sleep(Math.max(0,(reduced()?180:1400)-(performance.now()-started)));
        await this.finish();
      }catch(error){
        const screen=document.querySelector('.ui-splash-screen');
        if(!screen)return;
        screen.classList.add('is-error');
        const text=document.querySelector('#launchState');
        if(text)text.textContent='暂时无法读取本地数据，请重新打开页面';
        const footer=document.querySelector('.ui-splash-footer');
        if(footer)footer.hidden=false;
        const retry=document.createElement('button');retry.className='ui-splash-retry';retry.type='button';retry.textContent='重新打开';retry.onclick=()=>location.reload();footer?.append(retry);
      }
    },
    start(){
      if(this.active)return this.pending;
      this.target=location.hash&&location.hash!=='#/launch'?location.hash:null;
      this.active=true;this.ready=false;this.leaving=false;
      this.render();this.pending=this.prepare();return this.pending;
    },
    async finish(){
      if(!this.active||!this.ready||this.leaving)return;
      this.leaving=true;
      document.querySelector('.ui-splash-screen')?.classList.add('is-leaving');
      await sleep(reduced()?0:220);
      let target=this.target||'#/home';
      if(!App.state.initialized)target='#/init';
      else if(App.state.user?.hash&&!App.sessionVerified)target='#/login';
      this.active=false;
      const url=new URL(location.href);url.hash=target;
      url.searchParams.delete('launchPreview');
      window.history.replaceState(null,'',url.href);
      originalRoute();
    }
  };
  window.QYSStartup=Startup;
  App.route=function(){
    if(Startup.active)return;
    if(!location.hash||location.hash==='#/launch')return Startup.start();
    return originalRoute();
  };
  App.renderLaunch=function(){return Startup.start();};
})();
