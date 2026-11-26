import {validateNutrition} from './nutrition.js';
import { days, meals, validateChild, validateMeasurement } from './domain.js';
export function validateState(state) {
  if (!state || !Array.isArray(state.children) || state.children.length > 2000 || !state.menus) throw Error('Dados inválidos.');
  const ids = new Set();
  for (const c of state.children) {
    validateChild(c);
    if (typeof c.id !== 'string' || c.id.length > 100 || ids.has(c.id) || typeof c.notes !== 'string' || c.notes.length > 500 || !Array.isArray(c.measurements) || c.measurements.length > 5000) throw Error('Cadastro inválido.');
    ids.add(c.id); const dates = new Set();
    for (const m of c.measurements) {
      validateMeasurement(m, c.birth);
      if (typeof m.weight !== 'number' || typeof m.height !== 'number' || dates.has(m.date)) throw Error('Avaliação inválida ou duplicada.');
      dates.add(m.date);
    }
  }
  for (const d of days) {
    const entries = state.menus[d];
    if (!Array.isArray(entries) || entries.length !== meals.length) throw Error('Cardápio inválido.');
    entries.forEach((m, i) => {
      if (m.name !== meals[i] || typeof m.description !== 'string' || !m.description.trim() || m.description.length > 300 || !Number.isInteger(m.kcal) || m.kcal < 0 || m.kcal > 5000) throw Error('Refeição inválida.');
    });
  }
  if (state.recipes !== undefined) {
    if (!Array.isArray(state.recipes) || state.recipes.length > 2000) throw Error('Receitas inválidas.');
    const recipeIds = new Set();
    for (const r of state.recipes) {
      if (typeof r.id !== 'string' || !r.id || recipeIds.has(r.id) || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 100 || typeof r.ingredients !== 'string' || !r.ingredients.trim() || r.ingredients.length > 5000 || typeof r.instructions !== 'string' || !r.instructions.trim() || r.instructions.length > 5000 || !Number.isInteger(r.portions) || r.portions < 1 || r.portions > 1000 || typeof r.kcal !== 'number' || !Number.isFinite(r.kcal) || r.kcal < 0 || r.kcal > 100000) throw Error('Receita inválida.');
      recipeIds.add(r.id);
    }
  }
  // Store only the supported schema; reject extra top-level fields.
  if (Object.keys(state).some(k => !['children', 'menus', 'recipes', 'datedMenus', 'technicalRecipes', 'customFoods'].includes(k))) throw Error('Campos desconhecidos.');
  validateNutrition(state);
}
