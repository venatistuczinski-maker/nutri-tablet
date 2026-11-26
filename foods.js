// NEPA/UNICAMP, TACO, 4ª edição (2011), tabela 1, por 100 g comestíveis.
// Traços (Tr) são tratados como zero para os cálculos.
export const tacoUrl = 'https://www.cfn.org.br/wp-content/uploads/2017/03/taco_4_edicao_ampliada_e_revisada.pdf';
export const foods = [
  [1, 'Arroz integral cozido', 124, 2.6, 25.8, 1],
  [3, 'Arroz tipo 1 cozido', 128, 2.5, 28.1, 0.2],
  [4, 'Arroz tipo 1 cru', 358, 7.2, 78.8, 0.3],
  [7, 'Aveia em flocos crua', 394, 13.9, 66.6, 8.5],
  [53, 'Pão francês', 300, 8, 58.6, 3.1],
  [64, 'Abóbora cabotiá cozida', 48, 1.4, 10.8, 0.7],
  [70, 'Abobrinha italiana cozida', 15, 1.1, 3, 0.2],
  [78, 'Alface crespa crua', 11, 1.3, 1.7, 0.2],
  [91, 'Batata inglesa cozida', 52, 1.2, 11.9, 0],
  [97, 'Beterraba cozida', 32, 1.3, 7.2, 0.1],
  [100, 'Brócolis cozido', 25, 2.1, 4.4, 0.5],
  [107, 'Cebola crua', 39, 1.7, 8.9, 0.1],
  [109, 'Cenoura cozida', 30, 0.8, 6.7, 0.2],
  [129, 'Mandioca cozida', 125, 0.6, 30.1, 0.3],
  [157, 'Tomate cru com sementes', 15, 1.1, 3.1, 0.2],
  [182, 'Banana prata crua', 98, 1.3, 26, 0.1],
  [222, 'Maçã Fuji crua com casca', 56, 0.3, 15.2, 0],
  [225, 'Mamão Formosa cru', 45, 0.8, 11.6, 0.1],
  [235, 'Melancia crua', 33, 0.9, 8.1, 0],
  [261, 'Manteiga com sal', 726, 0.4, 0.1, 82.4],
  [377, 'Patinho bovino sem gordura grelhado', 219, 35.9, 0, 7.3],
  [409, 'Peito de frango sem pele cru', 119, 21.5, 0, 3],
  [410, 'Peito de frango sem pele grelhado', 159, 32, 0, 2.5],
  [448, 'Iogurte natural', 51, 4.1, 1.9, 3],
  [459, 'Leite de vaca integral em pó', 497, 25.4, 39.2, 26.9],
  [488, 'Ovo de galinha inteiro cozido (10 min)', 146, 13.3, 0.6, 9.5],
  [561, 'Feijão carioca cozido', 76, 4.8, 13.6, 0.5],
  [562, 'Feijão carioca cru', 329, 20, 61.2, 1.3],
  [577, 'Lentilha cozida', 93, 6.3, 16.3, 0.5],
].map(([id, name, kcal, protein, carbs, fat]) => ({id, name, kcal, protein, carbs, fat}));

export const foodById = new Map(foods.map(food => [food.id, food]));
