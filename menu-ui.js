import {days, meals, validDate} from './domain.js';
import {foods, tacoUrl} from './foods.js';
import {grams, itemFood, localDate, mealItems, measures, nutrients, shoppingList, totals, validateCustomFood, validateRecipe, weekDates} from './nutrition.js';

const number = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2});
const format = value => number.format(value);
const dateLabel = date => date.split('-').reverse().join('/');
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const matchesName = (name, query) => query.split(/\s+/).every(word => normalize(name).includes(word));
const foodChoices = customFoods => [
  ...customFoods.map(food => ({name: food.name, detail: food.source, food, item: {customFood: food}})),
  ...foods.map(food => ({name: food.name, detail: `TACO nº ${food.id}`, food, item: {food: food.id}})),
];
const nutrientNames = {kcal: 'Energia (kcal)', protein: 'Proteínas (g)', carbs: 'Carboidratos (g)', fat: 'Lipídios (g)'};
const nutrientLabel = values => `VET ${format(values.kcal)} kcal · Proteínas ${format(values.protein)} g · Carboidratos ${format(values.carbs)} g · Lipídios ${format(values.fat)} g`;
const source = `<p class="muted">Valores por peso comestível. Traços são tratados como zero. <a href="${tacoUrl}" target="_blank" rel="noopener noreferrer">TACO, NEPA/UNICAMP, 4ª edição, 2011</a> · <a href="https://www.tbca.net.br/" target="_blank" rel="noopener noreferrer">Consultar TBCA online</a></p>`;

export function createNutritionUI({main, esc, notify, discard, markDirty, persist}) {
  let date, phase, people, recipeId;
  const reset = () => { date = localDate(); phase = 'planned'; people = 30; recipeId = ''; };
  reset();

  function itemEditor(items, customFoods, recipes, changed, update, readonly) {
    const root = document.createElement('div');
    const choices = [
      ...foodChoices(customFoods),
      ...Object.values(recipes).map(recipe => ({name: recipe.name, detail: 'Ficha técnica', item: {recipe}})),
    ];
    root.innerHTML = `<div class="food-rows"></div><div class="picker" ${readonly ? 'hidden' : ''}><label>Buscar alimento${Object.keys(recipes).length ? ' ou preparação' : ''}<input type="search" autocomplete="off"></label><div class="search-results"></div></div>`;
    const rows = root.querySelector('.food-rows');
    const search = root.querySelector('input[type=search]');
    const results = root.querySelector('.search-results');
    function renderRows(focusIndex) {
      rows.innerHTML = '';
      items.forEach((item, index) => {
        const row = document.createElement('fieldset');
        row.className = 'food-row';
        row.disabled = readonly;
        row.innerHTML = `<legend>${esc(itemFood(item)?.name ?? item.recipe.name)}</legend>
          <label>Quantidade<input data-quantity type="number" min="0.001" max="100000" step="any" inputmode="decimal" required value="${item.quantity}"></label>
          <label>Medida<select>${measures.filter(unit => unit !== 'porção' || item.recipe).map(unit => `<option ${unit === item.unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></label>
          <label data-weight-label>Gramas por medida<input data-weight type="number" min="0.001" max="100000" step="any" inputmode="decimal" value="${item.gramsPerUnit ?? ''}"></label>
          <output></output><button type="button" class="secondary" data-remove>Excluir item</button>`;
        const quantity = row.querySelector('[data-quantity]');
        const select = row.querySelector('select');
        const weight = row.querySelector('[data-weight]');
        const display = row.querySelector('output');
        function sync() {
          weight.disabled = item.unit === 'g' || item.unit === 'porção';
          weight.required = !weight.disabled;
          row.querySelector('[data-weight-label]').hidden = item.unit === 'g';
          quantity.setCustomValidity(grams(item) > 100000 ? 'Limite de 100.000 g por item.' : '');
          display.textContent = Number.isFinite(grams(item)) && grams(item) > 0 ? `${format(grams(item))} g` : 'Informe o peso';
        }
        function edit() { sync(); changed(); update(); }
        quantity.oninput = () => { item.quantity = quantity.valueAsNumber; edit(); };
        weight.oninput = () => { item.gramsPerUnit = weight.valueAsNumber; edit(); };
        select.onchange = () => {
          item.unit = select.value;
          delete item.gramsPerUnit;
          if (item.unit === 'porção') item.gramsPerUnit = item.recipe.yieldGrams / item.recipe.portions;
          weight.value = item.gramsPerUnit ?? '';
          edit();
          if (!weight.disabled) weight.focus();
        };
        row.querySelector('[data-remove]').onclick = () => {
          items.splice(index, 1); changed(); renderRows(); update(); search.focus();
        };
        sync();
        rows.append(row);
        if (focusIndex === index) quantity.focus();
      });
    }
    search.oninput = () => {
      results.replaceChildren();
      const query = normalize(search.value.trim());
      if (!query) return;
      const matches = choices.filter(choice => matchesName(choice.name, query)).slice(0, 12);
      if (!matches.length) results.textContent = 'Nenhum resultado.';
      for (const choice of matches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = `${choice.name} · ${choice.detail}`;
        button.onclick = () => {
          if (items.length >= 100) return notify('Limite de 100 itens.');
          const item = {...choice.item, unit: 'g', quantity: 100};
          if (item.recipe) Object.assign(item, {unit: 'porção', quantity: 1, gramsPerUnit: item.recipe.yieldGrams / item.recipe.portions});
          items.push(item);
          search.value = '';
          results.replaceChildren();
          changed(); renderRows(items.length - 1); update();
        };
        results.append(button);
      }
    };
    search.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
    renderRows();
    return root;
  }

  const completeItems = items => items.filter(item => Number.isFinite(grams(item)) && grams(item) > 0);
  function renderMenus(state, readonly) {
    const dates = weekDates(date);
    const entries = structuredClone(mealItems(state, date, phase));
    main.innerHTML = `<h1>Cardápio semanal</h1>
      <section><div class="nutrition-controls"><label>Data do cardápio<input id="menu-date" type="date" value="${date}"></label>
      <label>Registro<select id="menu-phase"><option value="planned">Planejado</option><option value="served">Realizado</option></select></label></div>
      <div class="week-days" aria-label="Dias da semana">${dates.map((day, index) => `<button type="button" class="secondary" data-date="${day}" aria-pressed="${day === date}">${days[index]} ${dateLabel(day).slice(0, 5)}${Object.keys(state.datedMenus?.[day] ?? {}).length ? ' •' : ''}</button>`).join('')}</div>
      <label>Histórico de datas registradas<select id="menu-history"><option value="">Selecionar data</option>${Object.keys(state.datedMenus ?? {}).sort().reverse().map(day => `<option value="${day}" ${day === date ? 'selected' : ''}>${dateLabel(day)}</option>`).join('')}</select></label>
      <p id="daily-vet" class="nutrition-total" aria-live="polite"></p>
      <p>Quantidades por pessoa. Para medidas caseiras, informe o peso em gramas da sua medida.</p>
      <form id="dated-menu-form">${meals.map((name, index) => `<fieldset class="nutrition-meal"><legend>${name}</legend><div data-meal="${index}"></div><p data-vet="${index}" class="nutrition-total"></p></fieldset>`).join('')}
      <button ${readonly ? 'hidden' : ''}>Salvar cardápio</button></form>${source}</section>
      <section><h2>Lista de compras da semana</h2><label>Pessoas<input id="shopping-people" type="number" min="1" max="10000" value="${people}" inputmode="numeric" required></label>
      <p>Usa os cardápios planejados salvos. Pesos no estado indicado, sem ajuste para cascas, aparas ou cocção. Fichas são desdobradas em ingredientes.</p><ul id="shopping-list"></ul></section>
      <section><details><summary>Cardápios anteriores sem data</summary>${days.map(day => `<h3>${day}</h3><ul>${state.menus[day].map(meal => `<li>${esc(meal.name)} · ${esc(meal.description)} · ${meal.kcal} kcal</li>`).join('')}</ul>`).join('')}</details></section>`;
    function update() {
      entries.forEach((items, index) => {
        main.querySelector(`[data-vet="${index}"]`).textContent = nutrientLabel(totals(completeItems(items)));
      });
      main.querySelector('#daily-vet').textContent = 'Dia · ' + nutrientLabel(totals(completeItems(entries.flat())));
    }
    entries.forEach((items, index) => main.querySelector(`[data-meal="${index}"]`)
      .append(itemEditor(items, state.customFoods ?? [], state.technicalRecipes ?? {}, markDirty, update, readonly)));
    update();
    const dateInput = main.querySelector('#menu-date');
    const phaseInput = main.querySelector('#menu-phase');
    phaseInput.value = phase;
    const switchDate = next => {
      if (!validDate(next) || !discard()) { dateInput.value = date; return; }
      date = next;
      renderMenus(state, readonly);
    };
    dateInput.onchange = () => switchDate(dateInput.value);
    const history = main.querySelector('#menu-history');
    history.onchange = () => {
      switchDate(history.value);
      if (history.isConnected) history.value = Object.hasOwn(state.datedMenus ?? {}, date) ? date : '';
    };
    main.querySelectorAll('[data-date]').forEach(button => button.onclick = () => switchDate(button.dataset.date));
    phaseInput.onchange = () => {
      if (!discard()) { phaseInput.value = phase; return; }
      phase = phaseInput.value;
      renderMenus(state, readonly);
    };
    main.querySelector('#dated-menu-form').onsubmit = event => {
      event.preventDefault();
      if (readonly) return;
      persist(next => {
        next.datedMenus ??= {};
        next.datedMenus[date] ??= {};
        next.datedMenus[date][phase] = entries;
      }, 'Cardápio salvo.');
    };
    const peopleInput = main.querySelector('#shopping-people');
    const list = main.querySelector('#shopping-list');
    function updateShopping() {
      if (!peopleInput.validity.valid || !Number.isInteger(peopleInput.valueAsNumber)) {
        list.innerHTML = '<li>Informe um número inteiro de pessoas entre 1 e 10.000.</li>';
        return;
      }
      people = peopleInput.valueAsNumber;
      list.innerHTML = shoppingList(state, dates, people).map(row =>
        `<li>${esc(row.name)} · ${format(row.weight)} g</li>`).join('') || '<li>Nenhum item planejado nesta semana.</li>';
    }
    peopleInput.oninput = updateShopping;
    updateShopping();
  }

  function renderRecipes(state, readonly) {
    const recipes = state.technicalRecipes ?? {};
    const draft = structuredClone(recipes[recipeId] ?? {name: '', instructions: '', portions: 1, yieldGrams: '', items: []});
    main.innerHTML = `<h1>Fichas técnicas</h1>
      <section><label>Ficha<select id="technical-recipe"><option value="">Nova ficha</option>${Object.entries(recipes).map(([id, recipe]) =>
        `<option value="${id}" ${id === recipeId ? 'selected' : ''}>${esc(recipe.name)}</option>`).join('')}</select></label>
      <form id="technical-form"><fieldset ${readonly ? 'disabled' : ''}><legend>Preparação</legend>
        <label>Nome<input name="name" required maxlength="100" value="${esc(draft.name)}"></label>
        <label>Modo de preparo<textarea name="instructions" maxlength="5000">${esc(draft.instructions)}</textarea></label>
        <div class="nutrition-controls"><label>Rendimento final (g)<input name="yieldGrams" required type="number" min="0.001" max="100000" step="any" inputmode="decimal" value="${draft.yieldGrams}"></label>
        <label>Número de porções<input name="portions" required type="number" min="1" max="1000" inputmode="numeric" value="${draft.portions}"></label></div>
        <h2>Ingredientes</h2><div id="recipe-items"></div>
        <p id="portion-vet" class="nutrition-total" aria-live="polite"></p><button>Salvar ficha técnica</button>
      </fieldset></form>${source}</section>
      <section><details><summary>Receitas anteriores</summary>${(state.recipes ?? []).map(recipe =>
        `<article><h3>${esc(recipe.name)}</h3><p>${esc(recipe.ingredients)}</p><p>${esc(recipe.instructions)}</p><p>${recipe.portions} porções · ${format(recipe.kcal / recipe.portions)} kcal informadas por porção</p></article>`).join('') || '<p>Nenhuma receita anterior.</p>'}</details></section>`;
    const form = main.querySelector('#technical-form');
    function update() {
      const portions = form.elements.portions.valueAsNumber;
      const yieldGrams = form.elements.yieldGrams.valueAsNumber;
      const output = main.querySelector('#portion-vet');
      output.textContent = portions > 0 && yieldGrams > 0
        ? `Por porção (${format(yieldGrams / portions)} g) · ${nutrientLabel(totals(completeItems(draft.items), portions))}`
        : 'Informe rendimento e número de porções.';
    }
    main.querySelector('#recipe-items').append(itemEditor(draft.items, state.customFoods ?? [], {}, markDirty, update, readonly));
    for (const name of ['name', 'instructions', 'yieldGrams', 'portions']) form.elements[name].oninput = () => { markDirty(); update(); };
    update();
    main.querySelector('#technical-recipe').onchange = event => {
      if (!discard()) { event.target.value = recipeId; return; }
      recipeId = event.target.value;
      renderRecipes(state, readonly);
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (readonly) return;
      draft.name = form.elements.name.value.trim();
      draft.instructions = form.elements.instructions.value;
      draft.yieldGrams = form.elements.yieldGrams.valueAsNumber;
      draft.portions = form.elements.portions.valueAsNumber;
      try { validateRecipe(draft); } catch (error) { return notify(error.message); }
      const id = recipeId || crypto.randomUUID();
      await persist(next => {
        next.technicalRecipes ??= {};
        next.technicalRecipes[id] = draft;
      }, 'Ficha técnica salva.', () => { recipeId = id; });
    };
  }
  function renderFoods(state, readonly) {
    const choices = foodChoices(state.customFoods ?? []);
    main.innerHTML = `<h1>Banco de alimentos</h1><section>
      <label>Buscar no catálogo<input id="catalog-search" type="search" autocomplete="off"></label>
      <p id="catalog-count" role="status"></p><ul id="catalog-list"></ul>
      <button type="button" class="secondary" id="catalog-more">Mostrar mais alimentos</button>${source}</section>
      <section ${readonly ? 'hidden' : ''}><h2>Cadastrar alimento</h2>
      <p>Informe os valores por 100 g de parte comestível e a fonte usada. O cadastro fica no cofre desta conta.</p>
      <form id="custom-food-form"><label>Nome<input name="name" required maxlength="100"></label>
      <label>Fonte dos valores<input name="source" required maxlength="200" placeholder="Ex.: rótulo do produto"></label>
      <div class="nutrition-controls">${nutrients.map(key => `<label>${nutrientNames[key]}<input name="${key}" type="number" min="0" max="${key === 'kcal' ? 1000 : 100}" step="any" required inputmode="decimal"></label>`).join('')}</div>
      <button>Salvar alimento</button></form></section>`;

    const search = main.querySelector('#catalog-search');
    const list = main.querySelector('#catalog-list');
    const more = main.querySelector('#catalog-more');
    let limit = 30;
    function update() {
      const query = normalize(search.value.trim());
      const matches = choices.filter(choice => matchesName(choice.name, query));
      main.querySelector('#catalog-count').textContent = `${matches.length} alimentos encontrados.`;
      list.innerHTML = matches.slice(0, limit).map(({name, detail, food}) =>
        `<li><strong>${esc(name)}</strong> · ${esc(detail)}<br>${nutrientLabel(food)} por 100 g</li>`).join('');
      more.hidden = matches.length <= limit;
    }
    search.oninput = () => {limit = 30; update();};
    more.onclick = () => {limit += 30; update();};
    update();
    const form = main.querySelector('#custom-food-form');
    form.oninput = markDirty;
    form.onsubmit = event => {
      event.preventDefault();
      if (readonly) return;
      const food = {id: crypto.randomUUID(), name: form.elements.name.value.trim(), source: form.elements.source.value.trim()};
      for (const key of nutrients) food[key] = form.elements[key].valueAsNumber;
      try {validateCustomFood(food);} catch (error) {return notify(error.message);}
      persist(next => {
        next.customFoods ??= [];
        next.customFoods.push(food);
      }, 'Alimento salvo.');
    };
  }

  return {renderMenus, renderRecipes, renderFoods, reset};
}
