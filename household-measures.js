import {ibgeMeasures} from './ibge-measure-data.js';

export const ibgeMeasuresUrl = 'https://biblioteca.ibge.gov.br/visualizacao/livros/liv50000.pdf';
export const faoDensityUrl = 'https://www.fao.org/fileadmin/templates/food_composition/documents/density_DB_v2_0_01.pdf';
const legacy = {
  unidade: 'unidade média', fatia: 'fatia média', 'colher de chá': 'colher de chá cheia',
  'colher de sobremesa': 'colher de sobremesa cheia', 'colher de sopa': 'colher de sopa cheia',
  concha: 'concha média', copo: 'copo médio', xícara: 'xícara de chá',
  escumadeira: 'escumadeira média', porção: 'porção média',
};
export const householdMeasures = [
  'unidade pequena', 'unidade média', 'unidade grande', 'meia unidade',
  'fatia fina', 'fatia média', 'fatia grossa', 'meia fatia', 'rodela', 'pedaço', 'cubo', 'gomo', 'dente', 'ponta de faca',
  ...['café', 'chá', 'sobremesa', 'sopa', 'servir'].flatMap(type => [`colher de ${type} rasa`, `colher de ${type} cheia`]),
  ...['concha', 'escumadeira'].flatMap(type => [`${type} pequena`, `${type} média`, `${type} grande`]),
  'xícara de café', 'xícara de chá', 'copo americano', 'copo pequeno', 'copo médio', 'copo grande', 'caneca', 'taça',
  'tigela pequena', 'tigela média', 'tigela grande', 'prato raso', 'prato fundo', 'prato de sobremesa',
  'porção pequena', 'porção média', 'porção grande', 'punhado', 'pitada', 'folha', 'ramo',
  'sachê', 'pacote', 'pote', 'lata', 'caixa', 'garrafa', 'mL', 'L',
  ...Object.keys(legacy),
];
export const massUnits = {g: 1, kg: 1000};
export const isMass = unit => Object.hasOwn(massUnits, unit);
const volumes = {'mL': 1, L: 1000, 'xícara de café': 50, 'xícara de chá': 200,
  'copo americano': 150, 'copo médio': 240, 'copo grande': 300, caneca: 300};
const orange = [1.038, 'suco de laranja'];
const densities = {
  209: orange, 211: orange, 213: orange, 215: orange, 217: orange,
  454: [1.08, 'leite integral de cabra'],
  471: [1, 'café preparado'], 475: [1, 'chá de ervas'], 476: [1, 'infusão de chá'], 477: [1, 'infusão de chá'],
};

export function measureKey(item) {
  if (item.food !== undefined) return `taco:${item.food}`;
  if (item.customFood) return `local:${item.customFood.id}`;
  if (item.recipeId) return `ficha:${item.recipeId}`;
}

export function measureDefault(item, unitName, preferences) {
  const saved = preferences[measureKey(item)] ?? {};
  const canonical = legacy[unitName] ?? unitName;
  const old = Object.keys(legacy).find(key => legacy[key] === canonical);
  const preferred = saved[unitName] ?? saved[canonical] ?? saved[old];
  if (preferred !== undefined) return [preferred, 'Padrão da Casa guardado no cofre', 'personal'];
  if (unitName === 'meia unidade' || unitName === 'meia fatia') {
    const whole = measureDefault(item, unitName === 'meia unidade' ? 'unidade média' : 'fatia média', preferences);
    return whole && [whole[0] / 2, `Metade do peso · ${whole[1]}`, whole[2]];
  }
  if (canonical === 'porção média' && item.recipe) {
    return [item.recipe.yieldGrams / item.recipe.portions, 'Rendimento da ficha dividido pelo número de porções', 'reference'];
  }
  const data = ibgeMeasures[item.customFood?.measureReference === 'geleia' ? 'geleia' : item.food];
  const density = densities[item.food];
  const personalDensity = saved.mL ?? (saved.L === undefined ? undefined : saved.L / 1000);
  if (volumes[canonical] && (personalDensity || density)) {
    const ml = volumes[canonical];
    const grams = Number((ml * (personalDensity ?? density[0])).toFixed(6));
    const container = ml > 1 ? ` · ${ml} mL${canonical === 'L' ? '' : ' (volume IBGE)'}` : '';
    if (personalDensity) return [grams, `Densidade da Casa · ${personalDensity} g/mL${container}`, 'personal'];
    return [grams, `FAO/INFOODS · ${density[1]} · ${density[0]} g/mL${container}`, 'reference'];
  }
  const entry = data?.[2][canonical];
  if (entry) return [entry[0], `IBGE · POF 2008–2009 · cód. ${data[0]} · ${entry[1]}`, entry[2]];
}

export function measureOptions(item, preferences) {
  const groups = {reference: [], estimate: [], manual: []};
  for (const unit of householdMeasures) {
    // Older spellings remain available on the records that used them.
    if (Object.hasOwn(legacy, unit) && unit !== item.unit) continue;
    const suggestion = measureDefault(item, unit, preferences);
    groups[suggestion?.[2] === 'estimate' ? 'estimate' : suggestion ? 'reference' : 'manual'].push(unit);
  }
  return groups;
}
