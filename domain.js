export const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
export const meals=['Café da manhã','Lanche da manhã','Almoço','Lanche da tarde','Jantar','Ceia'];
export function vet(entries){return entries.reduce((sum,e)=>sum+Number(e.kcal||0),0);}
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function validateChild(c){if(!c.name?.trim()||c.name.trim().length>80)throw Error('Informe um nome fictício com até 80 caracteres.');if(!validDate(c.birth)||c.birth>new Date().toISOString().slice(0,10))throw Error('Informe uma data de nascimento válida, sem data futura.');}
export function validateMeasurement(m,birth){if(!validDate(m.date)||m.date<birth||m.date>new Date().toISOString().slice(0,10))throw Error('A data deve estar entre o nascimento e hoje.');if(!(Number(m.weight)>0&&Number(m.weight)<=300&&Number(m.height)>=20&&Number(m.height)<=250))throw Error('Informe peso entre 0 e 300 kg e altura entre 20 e 250 cm.');}
export function emptyState(){return {children:[],recipes:[],menus:Object.fromEntries(days.map(day=>[day,meals.map(name=>({name,description:'A definir',kcal:0}))]))};}
export function initialState(){return emptyState();}
