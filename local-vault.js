import { initialState } from './domain.js';
import { validateState } from './validation.js';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const ITERATIONS = 600000, MAX_BYTES = 8_000_000;
const bytes64 = bytes => { let str='';for(const b of bytes)str+=String.fromCharCode(b);return btoa(str); };
const from64 = text => Uint8Array.from(atob(text),c=>c.charCodeAt(0));
let database;
function db() {
  if(!database)database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('nutrir-local-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('vaults',{keyPath:'username'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Armazenamento local indisponível. Não use modo anônimo.'));
  });return database;
}
async function read(username){const database=await db();return new Promise((resolve,reject)=>{const request=database.transaction('vaults').objectStore('vaults').get(username);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function commit(record,expected){const database=await db();return new Promise((resolve,reject)=>{
  const tx=database.transaction('vaults','readwrite'),store=tx.objectStore('vaults'),request=store.get(record.username);let conflict=false;
  request.onsuccess=()=>{if((request.result?.revision??0)!==expected){conflict=true;tx.abort();}else store.put(record);};
  tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Falha ao gravar: verifique espaço e permissões.'));tx.onabort=()=>reject(Error(conflict?'Outra aba alterou o cofre. Bloqueie e entre novamente antes de editar.':'Gravação cancelada.'));
});}
function passwordCheck(password){if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Use uma senha de 12 a 256 caracteres. Não há recuperação de senha.');}
async function derive(password,salt){passwordCheck(password);const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function seal(data,key,salt){const iv=crypto.getRandomValues(new Uint8Array(12));return {format:'nutrir-local',version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:bytes64(salt),iv:bytes64(iv),ciphertext:bytes64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(data)))))};}
function envelopeCheck(envelope){if(!envelope||envelope.format!=='nutrir-local'||envelope.version!==1||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==ITERATIONS||typeof envelope.ciphertext!=='string'||envelope.ciphertext.length>MAX_BYTES*1.5||typeof envelope.salt!=='string'||envelope.salt.length!==24||typeof envelope.iv!=='string'||envelope.iv.length!==16||from64(envelope.salt).length!==16||from64(envelope.iv).length!==12)throw Error('Formato de cofre/backup inválido ou incompatível.');}
async function unseal(envelope,key){envelopeCheck(envelope);let data;try{data=JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(envelope.iv)},key,from64(envelope.ciphertext))));}catch{throw Error('Senha incorreta ou arquivo danificado.');}validateState(data);return data;}
export class LocalVault {
  user=null;key=null;salt=null;revision=0;
  async open(username,password,create=false){
    if(!globalThis.isSecureContext||!crypto.subtle)throw Error('Use localhost no tablet ou uma origem HTTPS. Arquivos file:// não são suportados.');
    if(!/^[a-zA-Z0-9._-]{3,80}$/.test(username))throw Error('Usuário: 3 a 80 letras, números, ponto, traço ou sublinhado.');
    const existing=await read(username);
    if(create&&existing)throw Error('Esta conta local já existe. Use Entrar.');if(!create&&!existing)throw Error('Conta local não encontrada neste navegador.');
    const salt=existing?(envelopeCheck(existing.envelope),from64(existing.envelope.salt)):crypto.getRandomValues(new Uint8Array(16));
    const key=await derive(password,salt);const state=existing?await unseal(existing.envelope,key):initialState();
    if(!existing)await commit({username,revision:1,envelope:await seal(state,key,salt)},0);
    this.user=username;this.key=key;this.salt=salt;this.revision=existing?.revision||1;
    return {user:{username,role:'admin'},csrf:''};
  }
  lock(){this.user=null;this.key=null;this.salt=null;this.revision=0;}
  require(){if(!this.key)throw Error('Cofre bloqueado. Entre novamente.');}
  async get(){this.require();const row=await read(this.user);if(!row)throw Error('Cofre não encontrado. Restaure seu backup.');const state=await unseal(row.envelope,this.key);this.revision=row.revision;return {state,revision:row.revision};}
  async put(state,revision){this.require();validateState(state);if(encoder.encode(JSON.stringify(state)).length>MAX_BYTES)throw Error('Cofre muito grande para esta versão.');const envelope=await seal(state,this.key,this.salt);await commit({username:this.user,revision:revision+1,envelope},revision);this.revision=revision+1;return {state,revision:this.revision};}
  async export(password){this.require();const {state}=await this.get();const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(password,salt);return JSON.stringify(await seal(state,key,salt));}
  async inspectBackup(text,password){this.require();if(text.length>MAX_BYTES*1.5)throw Error('Backup muito grande.');let envelope;try{envelope=JSON.parse(text);envelopeCheck(envelope);}catch{throw Error('Arquivo de backup inválido.');}const key=await derive(password,from64(envelope.salt));return unseal(envelope,key);}
}
