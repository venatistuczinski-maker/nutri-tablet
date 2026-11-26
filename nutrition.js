import {meals, validDate} from './domain.js';
import {foodById, tacoId} from './foods.js';

import {householdMeasures, isMass, massUnits} from './household-measures.js';

export const phases = ['planned', 'served'];
export const measures = ['g', 'kg', ...householdMeasures];
export const nutrients = ['kcal', 'protein', 'carbs', 'fat'];
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
  return item.quantity * (isMass(item.unit) ? massUnits[item.unit] : item.gramsPerUnit);
}

export function itemFood(item) {
  return item.food !== undefined ? foodById.get(tacoId(item.food)) : item.customFood;
}

export function totals(items, divisor = 1) {
  const total = {kcal: 0, protein: 0, carbs: 0, fat: 0};
  for (const item of items) {
    const weight = grams(item);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const values = itemFood(item) ?? totals(item.recipe.items, item.recipe.yieldGrams / 100);
    for (const key of nutrients) total[key] += values[key] * weight / 100 / divisor;
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
    if (!Number.isFinite(weight) || weight <= 0) return;
    const food = itemFood(item);
    if (food) {
      const previous = weights.get(food.id);
      weights.set(food.id, {name: food.name, weight: (previous?.weight ?? 0) + weight});
    } else item.recipe.items.forEach(ingredient => add(ingredient, weight / item.recipe.yieldGrams));
  }
  for (const date of dates) mealItems(state, date, 'planned').flat().forEach(item => add(item, people));
  return [...weights.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function validateItems(items, allowRecipe, allowMissingWeight = false) {
  if (!Array.isArray(items) || items.length > 100) throw Error('Limite de 100 itens por refeição ou ficha.');
  for (const item of items) {
    if (!item || !measures.includes(item.unit) || !finite(item.quantity, 100000)) throw Error('Revise a quantidade e o peso por medida.');
    const missing = !isMass(item.unit) && item.gramsPerUnit == null;
    if (!(allowMissingWeight && missing) &&
      (!finite(grams(item), 100000) || (isMass(item.unit) ? item.gramsPerUnit !== undefined : !finite(item.gramsPerUnit, 100000)))) {
      throw Error('Revise a quantidade e o peso por medida.');
    }
    if (item.conversion !== undefined && (!item.conversion || !['reference','estimate','personal'].includes(item.conversion.kind) ||
      typeof item.conversion.source !== 'string' || item.conversion.source.length > 400)) throw Error('Fonte da conversão inválida.');
    if (item.food !== undefined) {
      if (tacoId(item.food) === undefined || item.recipe !== undefined || item.customFood !== undefined) throw Error('Alimento inválido.');
    } else if (item.customFood !== undefined) {
      if (item.recipe !== undefined) throw Error('Alimento inválido.');
      validateCustomFood(item.customFood);
    } else {
      if (!allowRecipe) throw Error('Selecione um alimento do catálogo.');
      validateRecipe(item.recipe, allowMissingWeight);
      if (item.recipeId !== undefined && (typeof item.recipeId !== 'string' || !/^[\da-f-]{36}$/.test(item.recipeId))) {
        throw Error('Identificador de ficha inválido.');
      }
    }
  }
}

export function validateRecipe(recipe, allowMissingWeight = false) {
  if (!recipe || typeof recipe.name !== 'string' || !recipe.name.trim() || recipe.name.length > 100 ||
    typeof recipe.instructions !== 'string' || recipe.instructions.length > 5000 ||
    !finite(recipe.yieldGrams, 100000) || !Number.isInteger(recipe.portions) || !finite(recipe.portions, 1000)) {
    throw Error('Revise o nome, o rendimento e o número de porções.');
  }
  validateItems(recipe.items, false, allowMissingWeight);
  if (!recipe.items.length) throw Error('Adicione pelo menos um ingrediente à ficha.');
}

export function validateCustomFood(food) {
  if (!food || typeof food.id !== 'string' || !/^[\da-f-]{36}$/.test(food.id) ||
    typeof food.name !== 'string' || !food.name.trim() || food.name.length > 100 ||
    (food.measureReference !== undefined && food.measureReference !== 'geleia') ||
    typeof food.source !== 'string' || !food.source.trim() || food.source.length > 200 ||
    nutrients.some(key => !Number.isFinite(food[key]) || food[key] < 0 || food[key] > (key === 'kcal' ? 1000 : 100))) {
    throw Error('Revise o nome, a fonte e os nutrientes por 100 g.');
  }
}

export function validateNutrition(state) {
  if (state.measurePreferences !== undefined) {
    const prefs = state.measurePreferences;
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs) || Object.keys(prefs).length > 5000) {
      throw Error('Padrões de medidas inválidos.');
    }
    for (const [key, units] of Object.entries(prefs)) {
      if (!/^(taco:\d{1,3}|(?:local|ficha):[\da-f-]{36})$/.test(key) ||
        !units || typeof units !== 'object' || Array.isArray(units) ||
        Object.entries(units).some(([unit, weight]) => !householdMeasures.includes(unit) || !finite(weight, 100000))) {
        throw Error('Padrão de medida inválido.');
      }
    }
  }
  if (state.customFoods !== undefined) {
    if (!Array.isArray(state.customFoods) || state.customFoods.length > 2000) throw Error('Catálogo local inválido.');
    const ids = new Set();
    for (const food of state.customFoods) {
      validateCustomFood(food);
      if (ids.has(food.id)) throw Error('Alimento duplicado.');
      ids.add(food.id);
    }
  }
  if (state.datedMenus !== undefined) {
    if (!state.datedMenus || typeof state.datedMenus !== 'object' || Array.isArray(state.datedMenus)) throw Error('Histórico inválido.');
    for (const [date, day] of Object.entries(state.datedMenus)) {
      if (!validDate(date) || !day || typeof day !== 'object' || Array.isArray(day)) throw Error('Data de cardápio inválida.');
      for (const [phase, entries] of Object.entries(day)) {
        if (!phases.includes(phase) || !Array.isArray(entries) || entries.length !== meals.length) throw Error('Cardápio inválido.');
        entries.forEach(items => validateItems(items, true, true));
      }
    }
  }
  if (state.technicalRecipes !== undefined) {
    const recipes = state.technicalRecipes;
    if (!recipes || typeof recipes !== 'object' || Array.isArray(recipes) || Object.keys(recipes).length > 2000) throw Error('Fichas inválidas.');
    for (const [id, recipe] of Object.entries(recipes)) {
      if (!/^[\da-f-]{36}$/.test(id)) throw Error('Identificador de ficha inválido.');
      validateRecipe(recipe, true);
    }
  }
}
