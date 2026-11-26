export const ibgeMeasuresUrl = 'https://biblioteca.ibge.gov.br/visualizacao/livros/liv50000.pdf';
export const householdMeasures = ['unidade', 'meia unidade', 'fatia', 'ponta de faca', 'colher de chá',
  'colher de sobremesa', 'colher de sopa', 'concha', 'copo', 'xícara', 'escumadeira', 'porção'];

const unit = (weight, description = 'unidade média') => ({unidade: [weight, description]});
const slice = weight => ({fatia: [weight, 'fatia média']});
const spoon = (tea, dessert, soup) => ({
  'colher de chá': [tea, 'colher de chá cheia'],
  'colher de sobremesa': [dessert, 'colher de sobremesa cheia'],
  'colher de sopa': [soup, 'colher de sopa cheia'],
});
const spread = {...spoon(8, 23, 32), 'ponta de faca': [5, 'ponta de faca']};
const beans = {
  ...spoon(4.3, 8.5, 17),
  concha: [140, 'concha média cheia, referência de feijão branco cozido'],
};
const tea = {
  copo: [240, 'copo médio de 240 mL, massa aproximada pela densidade da água'],
  xícara: [200, 'xícara de chá de 200 mL, massa aproximada pela densidade da água'],
};

// Pesos de referência da POF 2008–2009, vinculados aos IDs estáveis da TACO.
// Códigos entre parênteses identificam as linhas na publicação do IBGE.
const reference = {
  1: {...spoon(5, 10, 20), concha: [117, 'concha média cheia'], escumadeira: [59, 'escumadeira média cheia'], porção: [198, 'porção do Guia Alimentar']}, // 6300201
  3: {...spoon(6.3, 12.5, 25), concha: [100, 'concha média cheia'], escumadeira: [85, 'escumadeira média cheia'], porção: [125, 'porção do Guia Alimentar']}, // 6300101
  48: slice(25), // 8001401, referência de pão de forma de aveia
  53: unit(50, 'unidade de pão francês'), // 8000105
  140: unit(20), // 8000801
  182: unit(75, 'unidade de banana-prata'), // 6801101, cru
  198: {'colher de sobremesa': [35, 'colher cheia de doce em pasta'], 'colher de sopa': [50, 'colher cheia de doce em pasta'], porção: [45, 'porção de goiabada em pasta do Guia Alimentar']}, // 6901211
  199: slice(60), // 6901211, goiabada em corte
  222: unit(150), // 6803001, maçã
  225: {porção: [160, 'porção de mamão Formosa do Guia Alimentar']}, // 6803101
  261: spread, 262: spread, // 7901501
  263: spread, 264: spread, 265: spread, 266: spread, // 7901602
  377: unit(100, 'referência de bife bovino grelhado, unidade média'), // 7100201, referência de bife
  424: slice(15), // 8102601
  438: slice(15), 439: slice(15), // 8102901, referência de presunto
  443: slice(20), // 8102701
  461: slice(30), // 7907301, referência de minas frescal
  463: slice(20), // 7901801
  467: slice(15), // 7901701
  468: {'colher de sopa': [30, 'colher de sopa cheia'], 'ponta de faca': [6, 'ponta de faca']}, // 7902901
  469: slice(35), // 7902201
  471: {copo: tea.copo, xícara: [50, 'xícara de café de 50 mL, massa aproximada pela densidade da água']}, // Quadro 4
  475: tea, 476: tea, // Quadro 4
  488: {...unit(45), fatia: [10, 'rodela média de ovo cozido']}, // 7803301, cozido
  490: unit(50), // 7803301, frito
  506: slice(60), // 6901206
  561: beans, 567: beans, // 6303102, referência genérica de feijões
};

export const fruitJamReference = {...spoon(9.5, 26, 34), porção: [34, 'porção do Guia Alimentar']}; // 6901001

export function measureKey(item) {
  if (item.food !== undefined) return `taco:${item.food}`;
  if (item.customFood) return `local:${item.customFood.id}`;
  if (item.recipeId) return `ficha:${item.recipeId}`;
}

export function measureDefault(item, unitName, preferences) {
  const saved = preferences[measureKey(item)];
  if (saved?.[unitName] !== undefined) return [saved[unitName], 'Padrão salvo no cofre'];
  if (unitName === 'meia unidade') {
    const whole = measureDefault(item, 'unidade', preferences);
    return whole && [whole[0] / 2, `Metade de uma unidade · ${whole[1]}`];
  }
  if (unitName === 'porção' && item.recipe) {
    return [item.recipe.yieldGrams / item.recipe.portions, 'Peso calculado pela ficha técnica'];
  }
  const entry = (item.customFood?.measureReference === 'geleia' ? fruitJamReference : reference[item.food])?.[unitName];
  return entry && [entry[0], `IBGE · POF 2008–2009 · ${entry[1]}`];
}
