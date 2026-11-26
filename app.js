import {renderReports} from './reports.js';
import {setupAppUpdate} from './app-update.js';
import { LocalVault } from './local-vault.js';
import {validateChild,validateMeasurement} from './domain.js';
import {createNutritionUI} from './menu-ui.js';
import {localDate,mealItems,totals} from './nutrition.js';
let state={children:[],menus:{}},page='home',selected,revision=0,csrf='',user=null,committed=null,dirty=false,saving=false;
const vault=new LocalVault();const staticOnly=document.body.dataset.localOnly==='true';let mode=!staticOnly&&sessionStorage.getItem('nutrir-mode')==='server'?'server':'local',lockTimer,hiddenTimer,hiddenAt=0;
const main=document.querySelector('#main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>d.split('-').reverse().join('/');
function notify(text){document.querySelector('#notice').textContent=text;clearTimeout(notify.timer);notify.timer=setTimeout(()=>document.querySelector('#notice').textContent='',6000);}
async function api(path, options={}) {
  if(mode==='local'){
    if(path==='state')return options.method==='PUT'?vault.put(JSON.parse(options.body).state,JSON.parse(options.body).revision):vault.get();
    if(path==='logout'){vault.lock();return {ok:true};}
    throw Error('Operação indisponível no modo local.');
  }
  const response=await fetch(new URL('./api/'+path,document.baseURI),{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
  const data=await response.json();
  if(!response.ok){if(response.status===401){user=null;state={children:[],menus:{}};login();}throw Error(data.error);}
  return data;
}
async function save(){
  if(saving)return false;saving=true;
  try{const result=await api('state',{method:'PUT',body:JSON.stringify({state,revision})});state=result.state;revision=result.revision;committed=structuredClone(state);dirty=false;return true;}
  catch(error){state=structuredClone(committed);notify(error.message+' A alteração não foi salva.');return false;}
  finally{saving=false;}
}
async function refresh(){
  if(!user||dirty||saving)return;
  try{const result=await api('state');if(result.revision!==revision){state=result.state;revision=result.revision;committed=structuredClone(state);render();}}catch(error){notify(error.message+' Verifique a conexão.');}
}
function lock(){
  if(saving){setTimeout(lock,500);return;}
  clearTimeout(lockTimer);vault.lock();user=null;csrf='';state={children:[],menus:{}};committed=null;dirty=false;main.replaceChildren();login();
}
function activity(){if(user&&mode==='local'){clearTimeout(lockTimer);lockTimer=setTimeout(lock,5*60*1000);}}
function login(){
  nutritionUI.reset();
  document.querySelector('nav').hidden=true;document.querySelector('#account')?.remove();
  main.innerHTML=`<section><h1>Entrar no Nutrir</h1><p>${mode==='local'?'Cofre neste tablet. Funciona offline, sem mensalidade. Cada conta local possui seus próprios registros.':'Modo servidor: requer um servidor previamente configurado.'}</p><form id="login-form"><label>Usuário<input name="username" autocomplete="username" required maxlength="80" pattern="[a-zA-Z0-9._-]{3,80}"></label><label>Senha<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button>Entrar</button>${mode==='local'?'<button type="button" id="create-vault" class="secondary">Criar conta local</button>':''}</form><p>Use apenas dados fictícios. No modo local, não há recuperação de senha nem sincronização automática. Exporte backups regularmente.</p><button id="switch-mode" class="secondary">${mode==='local'?'Usar servidor existente':'Usar cofre local gratuito'}</button></section>`;
  const form=main.querySelector('form');let busy=false;
  async function enter(create){
    if(busy||!form.reportValidity())return;busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);
    const f=new FormData(form);try{
      const result=mode==='local'?await vault.open(f.get('username'),f.get('password'),create):await api('login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});
      user=result.user;csrf=result.csrf;form.reset();await load();activity();
      if(create){const persistent=await navigator.storage?.persist?.();notify(persistent?'Cofre criado. Armazenamento persistente concedido; faça backups.':'Cofre criado. O navegador pode remover dados: exporte backups regularmente.');}
    }catch(error){notify(error.message);}finally{busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  form.onsubmit=e=>{e.preventDefault();enter(false);};
  main.querySelector('#create-vault')?.addEventListener('click',()=>enter(true));
  main.querySelector('#switch-mode').hidden=staticOnly;
  main.querySelector('#switch-mode').onclick=()=>{vault.lock();mode=mode==='local'?'server':'local';sessionStorage.setItem('nutrir-mode',mode);login();};
}
async function load(){
  const result=await api('state');state=result.state;revision=result.revision;committed=structuredClone(state);selected=state.children[0]?.id;dirty=false;page='home';
  document.querySelector('nav').hidden=false;document.querySelector('[data-page=backup]').hidden=mode!=='local';document.querySelector('nav p').textContent=mode==='local'?'Cofre local criptografado. Somente dados fictícios.':'Servidor conectado. Somente dados fictícios.';
  document.querySelector('#account')?.remove();const account=document.createElement('div');account.id='account';account.className='row';
  const name=document.createElement('span');name.textContent=user.username+(mode==='local'?' · Cofre local · ':' · Servidor · ')+({admin:'Administrador',editor:'Editor',reader:'Leitura'}[user.role]);
  const logout=document.createElement('button');logout.textContent=mode==='local'?'Bloquear / Sair':'Sair';logout.onclick=async()=>{if(saving)return;try{await api('logout',{method:'POST',body:'{}'});user=null;state={children:[],menus:{}};committed=null;csrf='';clearTimeout(lockTimer);login();}catch(e){notify(e.message);}};account.append(name,logout);document.querySelector('header').after(account);render();
}
function title(k,t,p){return `<div class="eyebrow">${k}</div><h1>${t}</h1><p class="muted">${p}</p>`;}
function options(){return state.children.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('');}
function chart(c,field,label,color){const rows=[...c.measurements].sort((a,b)=>a.date.localeCompare(b.date));if(!rows.length)return '<p class="muted">Nenhuma avaliação registrada. Registre a primeira abaixo.</p>';const vals=rows.map(r=>Number(r[field])),min=Math.min(...vals)-1,max=Math.max(...vals)+1;const points=rows.map((r,i)=>`${60+i*460/Math.max(1,rows.length-1)},${150-(Number(r[field])-min)/(max-min)*100}`);return `<h2>${label}</h2><svg class="chart" viewBox="0 0 600 210" role="img" aria-label="${label}: ${esc(rows.map(r=>fmt(r.date)+' '+r[field]).join('; '))}"><path d="M45 25 V170 H560" fill="none" stroke="#b9cfc1"/><polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="3"/>${rows.map((r,i)=>{const [x,y]=points[i].split(',');return `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/><text x="${x}" y="${Number(y)-12}" text-anchor="middle">${r[field]}</text><text x="${x}" y="193" text-anchor="middle">${fmt(r.date)}</text>`;}).join('')}</svg>`;}
function render(){document.querySelectorAll('nav button').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);b.setAttribute('aria-current',b.dataset.page===page?'page':'false');});
if(page==='home'){const measured=state.children.filter(c=>c.measurements.length).length;main.innerHTML=title('Cuidar • acompanhar • nutrir','Cuidado que acompanha cada fase','Uma visão do acompanhamento nutricional da casa.')+`<div class="cards"><div class="card">Pessoas cadastradas<strong>${state.children.length}</strong><span>Crianças e adolescentes fictícios</span></div><div class="card">Com avaliações<strong>${measured}</strong><span>${state.children.length-measured} aguardando primeiro registro</span></div><div class="card">VET planejado hoje<strong>${totals(mealItems(state,localDate(),'planned').flat()).kcal.toLocaleString('pt-BR',{maximumFractionDigits:2})} <small>kcal</small></strong><span>Cardápio por pessoa</span></div></div><div class="grid"><section><h2>Acompanhamento da casa</h2>${state.children.map(c=>`<div class="person"><b>${esc(c.name)}</b><br><small>${c.measurements.length} avaliações registradas</small></div>`).join('')}<button data-go="growth" class="secondary">Registrar avaliação</button></section><section><div class="eyebrow">Planejamento alimentar</div><h2>Uma semana de cuidado à mesa</h2><p>Organize as seis refeições de cada dia e acompanhe o valor energético total.</p><button data-go="menus">Abrir cardápio semanal</button><p class="muted">Demonstração sem dados reais. As calorias são exemplos, sem finalidade de prescrição.</p></section></div>`;}
if(page==='children')main.innerHTML=title('Pessoas','Crianças e adolescentes','Cadastre somente personagens fictícios nesta versão.')+`<div class="grid"><section><h2>Novo cadastro</h2><form id="child-form"><label>Nome fictício<input name="name" required maxlength="80" placeholder="Ex.: Criança Exemplo C"></label><label>Data de nascimento<input name="birth" type="date" required max="${new Date().toISOString().slice(0,10)}"></label><label>Observações fictícias<textarea name="notes" maxlength="500" placeholder="Informações de exemplo"></textarea></label><button>Salvar cadastro</button></form></section><section><h2>Cadastros · ${state.children.length}</h2>${state.children.map(c=>`<div class="person"><b>${esc(c.name)}</b><p>Nascimento: ${fmt(c.birth)}</p><small>${esc(c.notes)}</small><p><button class="secondary" data-child="${esc(c.id)}">Ver evolução</button></p></div>`).join('')}</section></div>`;
if(page==='growth'){const c=state.children.find(c=>c.id===selected)||state.children[0];selected=c?.id;main.innerHTML=title('Acompanhamento','Evolução nutricional','Peso e altura ao longo do tempo. Sem classificação ou diagnóstico automático.')+`<label>Pessoa acompanhada<select id="person">${options()}</select></label>`+(c?`<div class="grid"><section>${chart(c,'weight','Peso (kg)','#146653')}</section><section>${chart(c,'height','Altura (cm)','#b37a2d')}</section></div><section><h2>Registrar peso e altura</h2><form id="measurement-form"><div class="grid"><label>Data<input name="date" type="date" min="${c.birth}" max="${new Date().toISOString().slice(0,10)}" required></label><label>Peso (kg)<input name="weight" type="number" step="0.1" min="0.1" max="300" required inputmode="decimal"></label><label>Altura (cm)<input name="height" type="number" step="0.1" min="20" max="250" required inputmode="decimal"></label></div><button>Salvar avaliação</button></form><h2 style="margin-top:24px">Histórico</h2>${[...c.measurements].sort((a,b)=>b.date.localeCompare(a.date)).map(m=>`<p>${fmt(m.date)} · ${m.weight} kg · ${m.height} cm</p>`).join('')||'<p>Sem registros.</p>'}</section>`:'<p>Cadastre uma pessoa para começar.</p>');}
if(page==='menus')nutritionUI.renderMenus(state,user.role==='reader');
if(page==='recipes')nutritionUI.renderRecipes(state,user.role==='reader');
if(page==='foods')nutritionUI.renderFoods(state,user.role==='reader');
if(page==='reports')renderReports(main,state,esc,selected);
if(page==='backup'&&mode==='local')main.innerHTML=title('Proteção local','Backups e armazenamento','Faça uma cópia antes de restaurar. Perder a senha e o backup pode significar perder todos os registros.')+`<section><h2>Armazenamento do tablet</h2><p id="storage-status">Verificando persistência…</p><button id="persist" class="secondary">Solicitar armazenamento persistente</button><p>Mesmo com persistência, limpar dados do Chrome, remover o perfil ou perder o tablet pode apagar o cofre. Guarde cópias em outro dispositivo ou pendrive.</p></section><div class="grid"><section><h2>Exportar backup criptografado</h2><form id="export-form"><label>Senha do backup<input name="password" type="password" minlength="12" maxlength="256" required autocomplete="new-password"></label><label>Confirmar senha do backup<input name="confirm" type="password" minlength="12" maxlength="256" required autocomplete="new-password"></label><button>Baixar backup criptografado</button></form><p>A senha pode ser diferente da conta local. Guarde-a separada do arquivo. Confira o arquivo na pasta Downloads.</p></section><section><h2>Restaurar backup</h2><form id="restore-form"><label>Arquivo de backup<input name="file" type="file" accept=".nutrir,application/json" required></label><label>Senha usada no backup<input name="password" type="password" minlength="12" maxlength="256" required autocomplete="off"></label><button>Verificar e restaurar backup</button></form><p>A restauração substitui todos os registros desta conta local; não mescla dispositivos. A senha de entrada atual é mantida. Outros cofres não são alterados.</p></section></div>`;
bind();
main.querySelectorAll('#child-form input,#child-form textarea,#measurement-form input').forEach(el=>el.addEventListener('input',()=>dirty=true));
if(user?.role==='reader')main.querySelectorAll('form input,form textarea,form button').forEach(el=>el.disabled=true);
}

function bind(){
async function storageStatus(){const el=main.querySelector('#storage-status');if(el)el.textContent=await navigator.storage?.persisted?.()?'Persistência concedida pelo navegador. Backups continuam necessários.':'Persistência não concedida. Há risco de remoção automática pelo navegador.';}
if(page==='backup')storageStatus();
main.querySelector('#persist')?.addEventListener('click',async()=>{await navigator.storage?.persist?.();storageStatus();});
main.querySelector('#export-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.target,f=new FormData(form);if(f.get('password')!==f.get('confirm'))return notify('As senhas do backup devem ser iguais.');const button=form.querySelector('button');button.disabled=true;try{const text=await vault.export(f.get('password'));const url=URL.createObjectURL(new Blob([text],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download='nutrir-'+new Date().toISOString().replaceAll(':','-')+'.nutrir';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);form.reset();notify('Download solicitado. Confirme o arquivo em Downloads e guarde uma cópia fora do tablet.');}catch(error){notify(error.message);}finally{button.disabled=false;}});
main.querySelector('#restore-form')?.addEventListener('submit',async e=>{e.preventDefault();if(saving)return;const form=e.target,f=new FormData(form),file=f.get('file');if(file.size>12000000)return notify('Arquivo muito grande.');const button=form.querySelector('button');button.disabled=true;try{const imported=await vault.inspectBackup(await file.text(),f.get('password'));if(!confirm('Backup válido: '+imported.children.length+' cadastros e '+(imported.recipes||[]).length+' receitas. Substituir TODOS os dados desta conta? Exporte seu backup atual antes de continuar.'))return;state=imported;const ok=await save();if(ok){selected=state.children[0]?.id;render();notify('Backup restaurado. A senha desta conta foi mantida.');}}catch(error){notify(error.message);}finally{button.disabled=false;form.reset();}});
main.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{page=b.dataset.go;render();});main.querySelectorAll('[data-child]').forEach(b=>b.onclick=()=>{selected=b.dataset.child;page='growth';render();});main.querySelector('#person')?.addEventListener('change',e=>{if(dirty&&!confirm('Descartar alterações não salvas?')){e.target.value=selected;return;}dirty=false;selected=e.target.value;render();});
main.querySelector('#child-form')?.addEventListener('submit',async e=>{e.preventDefault();if(saving)return;const f=new FormData(e.target);const c={id:crypto.randomUUID(),name:f.get('name').trim(),birth:f.get('birth'),notes:f.get('notes'),measurements:[]};try{validateChild(c);state.children.push(c);selected=c.id;const ok=await save();render();if(ok)notify('Cadastro fictício salvo.');}catch(err){notify(err.message);}});
main.querySelector('#measurement-form')?.addEventListener('submit',async e=>{e.preventDefault();if(saving)return;const f=new FormData(e.target),c=state.children.find(c=>c.id===selected),m={date:f.get('date'),weight:Number(f.get('weight')),height:Number(f.get('height'))};try{validateMeasurement(m,c.birth);if(c.measurements.some(r=>r.date===m.date))throw Error('Já existe uma avaliação nesta data. Escolha outra data.');c.measurements.push(m);const ok=await save();render();if(ok)notify('Avaliação salva.');}catch(err){notify(err.message);}});
}
const nutritionUI=createNutritionUI({
  main,esc,notify,
  markDirty:()=>{dirty=true;},
  discard:()=>{
    if(saving||(dirty&&!confirm('Descartar alterações ainda não salvas?')))return false;
    dirty=false;
    return true;
  },
  persist:async (change,message,onSuccess)=>{
    if(saving)return false;
    change(state);
    main.inert=true;
    try{
      const ok=await save();
      if(ok){onSuccess?.();render();notify(message);}
      return ok;
    }finally{main.inert=false;}
  },
});
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{if(saving)return;if(dirty&&!confirm('Descartar alterações ainda não salvas?'))return;dirty=false;page=b.dataset.page;render();refresh();});
window.addEventListener('online',refresh);
setInterval(refresh,15000);
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
if(mode==='server'){try{const session=await api('session');user=session.user;csrf=session.csrf;await load();}catch{login();}}else login();
setupAppUpdate({canReload:()=>!dirty&&!saving,notify});

for(const event of ['pointerdown','keydown','input'])document.addEventListener(event,activity,{passive:true});
document.addEventListener('visibilitychange',()=>{clearTimeout(hiddenTimer);if(document.hidden){hiddenAt=Date.now();if(mode==='local'&&user)hiddenTimer=setTimeout(lock,60000);}else if(hiddenAt&&Date.now()-hiddenAt>=60000&&mode==='local'&&user){hiddenAt=0;lock();}});
window.addEventListener('pagehide',()=>{if(mode==='local'&&user)lock();});

let installPrompt;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.querySelector('#install-app').hidden=false;});
document.querySelector('#install-app').onclick=async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;document.querySelector('#install-app').hidden=true;}};

window.addEventListener('pageshow',event=>{if(event.persisted&&mode==='local')lock();});

window.addEventListener('appinstalled',()=>{installPrompt=null;document.querySelector('#install-app').hidden=true;});
