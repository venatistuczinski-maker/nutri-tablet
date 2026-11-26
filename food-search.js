const groups = [
  ['mussarela muçarela mozzarella mozarella', [463]],
  ['queijos', [461, 462, 463, 464, 465, 466, 467, 468, 469]],
  ['goiabada', [198, 199]],
  ['doce de fruta doces de frutas', [176, 198, 199, 506]],
  ['doce de marmelo', [506]],
  ['bananada doce de banana', [176]],
  ['bolacha bolachas biscoitos', [8, 9, 10, 11, 12, 13, 99]],
  ['pães', [48, 49, 50, 51, 52, 53, 54, 140, 141]],
  ['cacetinho pão de sal pão francês', [53]],
  ['frios embutidos', [323, 424, 438, 439, 443]],
  ['aipim macaxeira', [129, 130, 132]],
  ['bergamota bergamotas', [237, 238, 251]],
  ['carne seca', [338, 339]],
  ['carreteiro de charque', [526]],
  ['missões missioneiro regional', [62, 129, 132, 237, 238, 251, 338, 347, 423, 443, 500, 526, 595]],
];

const aliases = new Map();
for (const [words, ids] of groups) {
  for (const id of ids) aliases.set(id, (aliases.get(id) ?? '') + ' ' + words);
}

function normalize(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function searchCatalog(choices, query) {
  const normalized = normalize(query);
  if (!normalized) return choices;
  const terms = normalized.split(' ');
  const matches = [];
  for (const choice of choices) {
    const name = normalize(choice.name);
    const words = name.split(' ');
    const extra = normalize(aliases.get(choice.food?.id) ?? '');
    if (!terms.every(term => name.includes(term) || extra.includes(term))) continue;
    const rank = name === normalized ? 0 : name.startsWith(normalized) ? 1
      : words[0].startsWith(terms[0]) && terms.every(term => name.includes(term)) ? 2
      : terms.every(term => name.includes(term)) ? 3 : 4;
    matches.push({choice, rank});
  }
  return matches.sort((a, b) => a.rank - b.rank).map(match => match.choice);
}
