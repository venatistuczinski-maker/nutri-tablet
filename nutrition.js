import {meals, validDate} from './domain.js';
import {foodById} from './foods.js';

export const phases = ['planned', 'served'];
export const measures = ['g', 'colher de sopa', 'colher de chá', 'xícara', 'concha', 'unidade', 'porção'];
const nutrients = ['kcal', 'protein', 'carbs', 'fat'];
const finite = (value, max) => Number.isFinite(value) && value > 0 && value <= max;

export function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0')).join('-');
}

export function weekDates(date) {
  const monday = new Date(date + 'T12:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return Array.from({length: 7}, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function grams(item) {
  return item.quantity * (item.unit === 'g' ? 1 : item.gramsPerUnit);
}

export function totals(items, divisor = 1) {
  const total = {kcal: 0, protein: 0, carbs: 0, fat: 0};
  for (const item of items) {
    const values = item.food ? foodById.get(item.food) : totals(item.recipe.items, item.recipe.yieldGrams / 100);
    for (const key of nutrients) total[key] += values[key] * grams(item) / 100 / divisor;
  }
  return total;
}

export function mealItems(state, date, phase) {
  return state.datedMenus?.[date]?.[phase] ?? meals.map(() => []);
}

export function shoppingList(state, dates, people) {
  const weights = new Map();
  function add(item, scale) {
    const weight = grams(item) * scale;
    if (item.food) weights.set(item.food, (weights.get(item.food) ?? 0) + weight);
    else item.recipe.items.forEach(ingredient => add(ingredient, weight / item.recipe.yieldGrams));
  }
  for (const date of dates) mealItems(state, date, 'planned').flat().forEach(item => add(item, people));
  return [...weights].map(([id, weight]) => ({name: foodById.get(id).name, weight}))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function validateItems(items, allowRecipe) {
  if (!Array.isArray(items) || items.length > 100) throw Error('Limite de 100 itens por refeição ou ficha.');
  for (const item of items) {
    if (!item || !measures.includes(item.unit) || !finite(item.quantity, 100000) ||
      !finite(grams(item), 100000) || (item.unit === 'g' ? item.gramsPerUnit !== undefined : !finite(item.gramsPerUnit, 100000)) ||
      (item.unit === 'porção' && !item.recipe)) throw Error('Revise a quantidade e o peso por medida.');
    if (item.food !== undefined) {
      if (!foodById.has(item.food) || item.recipe !== undefined) throw Error('Alimento inválido.');
    } else {
      if (!allowRecipe) throw Error('Selecione um alimento do catálogo.');
      validateRecipe(item.recipe);
      if (item.unit === 'porção' && item.gramsPerUnit !== item.recipe.yieldGrams / item.recipe.portions) {
        throw Error('Peso por porção incompatível com a ficha.');
      }
    }
  }
}

export function validateRecipe(recipe) {
  if (!recipe || typeof recipe.name !== 'string' || !recipe.name.trim() || recipe.name.length > 100 ||
    typeof recipe.instructions !== 'string' || recipe.instructions.length > 5000 ||
    !finite(recipe.yieldGrams, 100000) || !Number.isInteger(recipe.portions) || !finite(recipe.portions, 1000)) {
    throw Error('Revise o nome, o rendimento e o número de porções.');
  }
  validateItems(recipe.items, false);
  if (!recipe.items.length) throw Error('Adicione pelo menos um ingrediente à ficha.');
}

export function validateNutrition(state) {
  if (state.datedMenus !== undefined) {
    if (!state.datedMenus || typeof state.datedMenus !== 'object' || Array.isArray(state.datedMenus)) throw Error('Histórico inválido.');
    for (const [date, day] of Object.entries(state.datedMenus)) {
      if (!validDate(date) || !day || typeof day !== 'object' || Array.isArray(day)) throw Error('Data de cardápio inválida.');
      for (const [phase, entries] of Object.entries(day)) {
        if (!phases.includes(phase) || !Array.isArray(entries) || entries.length !== meals.length) throw Error('Cardápio inválido.');
        entries.forEach(items => validateItems(items, true));
      }
    }
  }
  if (state.technicalRecipes !== undefined) {
    const recipes = state.technicalRecipes;
    if (!recipes || typeof recipes !== 'object' || Array.isArray(recipes) || Object.keys(recipes).length > 2000) throw Error('Fichas inválidas.');
    for (const [id, recipe] of Object.entries(recipes)) {
      if (!/^[\da-f-]{36}$/.test(id)) throw Error('Identificador de ficha inválido.');
      validateRecipe(recipe);
    }
  }
}
