export async function setupAppUpdate({canReload, notify}){
  const offlineStatus=document.querySelector('#offline-status');
  const button=document.querySelector('#update-app');
  const updateStatus=document.querySelector('#update-status');
  if(!('serviceWorker' in navigator)){
    offlineStatus.textContent='Use o Chrome Android atualizado para preparar o uso offline.';
    return;
  }

  const workers=navigator.serviceWorker;
  const pageVersion=document.body.dataset.shellVersion;
  let registration, checking, reloading=false, activated=false;

  function controllerVersion(){
    return new Promise(resolve=>{
      const worker=workers.controller;
      if(!worker)return resolve(null);
      const channel=new MessageChannel();
      const finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value);};
      const timer=setTimeout(()=>finish(null),1500);
      channel.port1.onmessage=event=>finish(event.data?.version);
      try{worker.postMessage({type:'NUTRIR_VERSION'},[channel.port2]);}
      catch{finish(null);}
    });
  }

  async function showAvailable(){
    const version=await controllerVersion();
    activated=Boolean(version&&version!==pageVersion);
    if(activated||(registration?.active&&registration.waiting))updateStatus.textContent='Nova versão disponível.';
    else if(updateStatus.textContent==='Nova versão disponível.')updateStatus.textContent='';
    return activated;
  }

  function waitForInstallation(worker){
    return new Promise(resolve=>{
      function onStateChange(){
        if(worker.state==='installing')return;
        worker.removeEventListener('statechange',onStateChange);
        resolve(worker.state!=='redundant');
      }
      worker.addEventListener('statechange',onStateChange);
      onStateChange();
    });
  }

  function check(){
    if(checking)return checking;
    if(!registration||!navigator.onLine)return Promise.resolve(false);
    checking=(async()=>{
      try{
        if(await showAvailable()||registration.waiting)return true;
        if(!registration.installing)await registration.update();
        const installing=registration.installing;
        if(installing&&!(await waitForInstallation(installing)))return false;
        await showAvailable();
        return true;
      }catch{return false;}
    })().finally(()=>{checking=null;});
    return checking;
  }

  function finishReload(){
    if(!canReload()){
      reloading=false;
      button.disabled=false;
      updateStatus.textContent='Salve as alterações e toque em Atualizar aplicativo.';
      return;
    }
    location.reload();
  }

  workers.addEventListener('controllerchange',async()=>{
    if(await showAvailable()&&reloading)finishReload();
  });

  try{
    registration=await workers.register(new URL('./sw.js',document.baseURI),{updateViaCache:'none'});
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      if(worker)waitForInstallation(worker).then(showAvailable);
    });
    workers.ready.then(()=>{
      offlineStatus.textContent='Arquivos prontos para uso offline neste navegador.';
      button.hidden=false;
      check();
    });
  }catch{
    offlineStatus.textContent='Não foi possível preparar o uso offline. Conecte-se e tente novamente.';
    return;
  }

  button.addEventListener('click',async()=>{
    if(!canReload())return notify('Salve as alterações antes de atualizar o aplicativo.');
    if(await showAvailable())return finishReload();
    if(!registration.waiting&&!navigator.onLine)return notify('Conecte-se à internet para procurar uma nova versão.');

    button.disabled=true;
    updateStatus.textContent='Verificando atualização…';
    const checked=await check();
    if(await showAvailable()){
      button.disabled=false;
      return finishReload();
    }
    const waiting=registration.waiting;
    if(!waiting||!canReload()){
      button.disabled=false;
      updateStatus.textContent=waiting?'Salve as alterações e tente novamente.':
        checked?'O aplicativo está atualizado.':'Não foi possível verificar a atualização. Tente novamente.';
      return;
    }
    reloading=true;
    updateStatus.textContent='Carregando nova versão…';
    waiting.postMessage({type:'NUTRIR_ACTIVATE'});
    setTimeout(async()=>{
      if(!reloading)return;
      if(await showAvailable())return finishReload();
      reloading=false;
      button.disabled=false;
      updateStatus.textContent='A atualização ainda não foi ativada. Tente novamente.';
    },10000);
  });

  window.addEventListener('online',check);
  window.addEventListener('pageshow',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  setInterval(()=>{if(!document.hidden)check();},60000);
}
