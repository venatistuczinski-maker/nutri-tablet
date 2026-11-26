import {faoDensityUrl, ibgeMeasuresUrl, isMass, measureDefault, measureKey, measureOptions} from './household-measures.js';
import {days, meals, validDate} from './domain.js';
import {foods, tacoUrl} from './foods.js';
import {searchCatalog} from './food-search.js';
import {grams, itemFood, localDate, mealItems, nutrients, shoppingList, totals, validateCustomFood, validateRecipe, weekDates} from './nutrition.js';

const number = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2});
const format = value => number.format(value);
const dateLabel = date => date.split('-').reverse().join('/');
const foodChoices = customFoods => [
  ...customFoods.map(food => ({name: food.name, detail: food.source, food, item: {customFood: food}})),
  ...foods.map(food => ({name: food.name, detail: `TACO nº ${food.id}`, food, item: {food: food.id}})),
];
const nutrientNames = {kcal: 'Energia (kcal)', protein: 'Proteínas (g)', carbs: 'Carboidratos (g)', fat: 'Lipídios (g)'};
const nutrientLabel = values => `VET ${format(values.kcal)} kcal · Proteínas ${format(values.protein)} g · Carboidratos ${format(values.carbs)} g · Lipídios ${format(values.fat)} g`;
const source = `<p class="muted">Valores por peso comestível. Traços são tratados como zero. <a href="${tacoUrl}" target="_blank" rel="noopener noreferrer">TACO, NEPA/UNICAMP, 4ª edição, 2011</a> · <a href="https://www.tbca.net.br/" target="_blank" rel="noopener noreferrer">Consultar TBCA online</a></p>`;

const measureHelp = `<p>As medidas com peso aparecem primeiro. Confirme as estimativas sugeridas ou informe a pesagem. Para guardar um peso da Casa, toque em “Guardar padrão” e salve. Fontes de referência: <a href="${ibgeMeasuresUrl}" target="_blank" rel="noopener noreferrer">IBGE · POF</a> e <a href="${faoDensityUrl}" target="_blank" rel="noopener noreferrer">FAO/INFOODS · densidades</a>.</p>`;

function measureDraft(state) {
  const values = structuredClone(state.measurePreferences ?? {});
  let changed = false;
  return {values, set(key, unit, weight) {
    values[key] ??= {};
    values[key][unit] = weight;
    changed = true;
  }, commit(next) {
    if (changed) next.measurePreferences = values;
  }};
}

function customFoodFields() {
  return `<label>Nome<input name="name" required maxlength="100"></label>
    <label>Fonte dos valores<input name="source" required maxlength="200" placeholder="Ex.: rótulo do produto"></label>
    <label>Referência de medidas<select name="measureReference"><option value="">Pesagem própria</option><option value="geleia">Geleia de frutas · IBGE</option></select></label>
    <div class="nutrition-controls">${nutrients.map(key => `<label>${nutrientNames[key]}<input name="${key}" type="number" min="0" max="${key === 'kcal' ? 1000 : 100}" step="any" required inputmode="decimal"></label>`).join('')}</div>`;
}

function readCustomFood(form) {
  const food = {id: crypto.randomUUID(), name: form.elements.name.value.trim(), source: form.elements.source.value.trim()};
  if (form.elements.measureReference.value) food.measureReference = form.elements.measureReference.value;
  for (const key of nutrients) food[key] = form.elements[key].valueAsNumber;
  validateCustomFood(food);
  return food;
}

export function createNutritionUI({main, esc, notify, discard, markDirty, persist}) {
  let date, phase, people, recipeId;
  const reset = () => { date = localDate(); phase = 'planned'; people = 30; recipeId = ''; };
  reset();

  function itemEditor(items, customFoods, recipes, weights, changed, update, readonly, registerFood) {
    const root = document.createElement('div');
    const preparations = Object.entries(recipes).map(([recipeId, recipe]) => ({name: recipe.name, detail: 'Ficha técnica', item: {recipe, recipeId}}));
    root.innerHTML = `<div class="food-rows"></div><div class="picker" ${readonly ? 'hidden' : ''}><label>Buscar alimento${Object.keys(recipes).length ? ' ou preparação' : ''}<input type="search" autocomplete="off"></label><p class="search-status" role="status"></p><div class="search-results"></div><button type="button" class="secondary" data-more-food hidden>Mostrar mais resultados</button>${registerFood ? '<button type="button" class="secondary" data-register-food>Cadastrar alimento</button>' : ''}</div>`;
    const rows = root.querySelector('.food-rows');
    const search = root.querySelector('input[type=search]');
    const results = root.querySelector('.search-results');
    function renderRows(focusIndex) {
      rows.innerHTML = '';
      items.forEach((item, index) => {
        const row = document.createElement('fieldset');
        row.className = 'food-row';
        row.disabled = readonly;
        const options = measureOptions(item, weights.values);
        const option = (unit, label = unit) => `<option value="${unit}" ${unit === item.unit ? 'selected' : ''}>${label}</option>`;
        const group = (label, units) => units.length ? `<optgroup label="${label}">${units.map(unit => option(unit)).join('')}</optgroup>` : '';
        row.innerHTML = `<legend>${esc(itemFood(item)?.name ?? item.recipe.name)}</legend>
          <label>Quantidade<input data-quantity type="number" min="0.000001" max="100000" step="any" inputmode="decimal" required value="${item.quantity}"></label>
          <label>Medida<select>${group('Com conversão disponível', options.reference)}
            ${option('g', 'g · gramas')}${option('kg', 'kg · quilogramas')}
            ${group('Estimativas para aprovação', options.estimate)}${group('Requer pesagem ou densidade', options.manual)}</select></label>
          <label data-weight-label><span>Gramas por medida</span><input data-weight type="number" min="0.000001" max="100000" step="any" inputmode="decimal" value="${item.gramsPerUnit ?? ''}"></label>
          <output></output><small data-measure-source></small><button type="button" class="secondary" data-approve hidden>Aprovar estimativa</button><button type="button" class="secondary" data-save-measure>Guardar padrão</button><button type="button" class="secondary" data-remove>Excluir item</button>`;
        const quantity = row.querySelector('[data-quantity]');
        const select = row.querySelector('select');
        const weightLabel = row.querySelector('[data-weight-label]');
        const weight = row.querySelector('[data-weight]');
        const display = row.querySelector('output');
        const measureSource = row.querySelector('[data-measure-source]');
        const saveMeasure = row.querySelector('[data-save-measure]');
        const approve = row.querySelector('[data-approve]');
        const key = measureKey(item);
        let pending;
        function setConversion([gramsPerUnit, source, kind]) {
          item.gramsPerUnit = gramsPerUnit;
          item.conversion = {source, kind};
        }
        function sync() {
          weight.disabled = isMass(item.unit);
          weight.required = !weight.disabled;
          weightLabel.hidden = weight.disabled;
          weightLabel.querySelector('span').textContent = item.unit === 'mL'
            ? 'Densidade (g/mL)' : item.unit === 'L' ? 'Gramas por litro' : 'Gramas por medida';
          approve.hidden = !pending;
          saveMeasure.hidden = weight.disabled || !key || readonly || Boolean(pending);
          measureSource.hidden = weight.disabled;
          const conversion = pending ? {kind: 'estimate', source: pending[1]} : item.conversion;
          const label = {reference: 'Referência', estimate: pending ? 'Estimativa · aguarda aprovação' : 'Estimativa aprovada', personal: 'Peso personalizado'};
          measureSource.textContent = conversion ? `${label[conversion.kind]} · ${conversion.source}`
            : Number.isFinite(item.gramsPerUnit) ? 'Peso registrado no item' : 'Informe o peso em gramas desta medida.';
          weight.setCustomValidity(pending ? 'Aprove a estimativa ou informe o peso medido.' : '');
          quantity.setCustomValidity(grams(item) > 100000 ? 'Limite de 100.000 g por item.' : '');
          display.textContent = pending ? 'Estimativa ainda fora do total' :
            Number.isFinite(grams(item)) && grams(item) > 0 ? `${format(grams(item))} g` : 'Informe o peso';
        }
        function edit() { sync(); changed(); update(); }
        quantity.oninput = () => { item.quantity = quantity.valueAsNumber; edit(); };
        weight.oninput = () => {
          pending = undefined;
          setConversion([weight.valueAsNumber, 'Peso informado para este item', 'personal']);
          edit();
        };
        select.onchange = () => {
          const fromGrams = item.unit === 'g';
          item.unit = select.value;
          delete item.gramsPerUnit;
          delete item.conversion;
          pending = undefined;
          if (!isMass(item.unit)) {
            const suggested = measureDefault(item, item.unit, weights.values);
            if (suggested?.[2] === 'estimate') pending = suggested;
            else if (suggested) setConversion(suggested);
          }
          if (fromGrams && item.quantity === 100 && item.unit !== 'g') {
            item.quantity = item.unit === 'kg' ? 0.1 : 1;
            quantity.value = item.quantity;
          }
          weight.value = pending?.[0] ?? item.gramsPerUnit ?? '';
          edit();
          if (!weight.disabled && !weight.value) weight.focus();
        };
        approve.onclick = () => {
          if (!pending) return;
          setConversion(pending);
          pending = undefined;
          edit();
        };
        saveMeasure.onclick = () => {
          if (!key || weight.disabled || !weight.reportValidity()) return;
          weights.set(key, item.unit, weight.valueAsNumber);
          if (item.conversion?.kind !== 'estimate') item.conversion = {kind: 'personal', source: 'Padrão da Casa'};
          edit();
          notify('Padrão preparado. Salve o cardápio ou a ficha para guardar no cofre.');
        };
        row.querySelector('[data-remove]').onclick = () => {
          items.splice(index, 1); changed(); renderRows(); update(); search.focus();
        };
        sync();
        rows.append(row);
        if (focusIndex === index) quantity.focus();
      });
    }
    const status = root.querySelector('.search-status');
    const more = root.querySelector('[data-more-food]');
    let limit = 12;
    function addItem(choice) {
      if (items.length >= 100) return notify('Limite de 100 itens.');
      const item = {...choice.item, unit: 'g', quantity: 100};
      if (item.recipe) {
        const [gramsPerUnit, source, kind] = measureDefault(item, 'porção média', weights.values);
        Object.assign(item, {unit: 'porção média', quantity: 1, gramsPerUnit, conversion: {source, kind}});
      }
      items.push(item);
      search.value = '';
      renderResults();
      changed(); renderRows(items.length - 1); update();
    }
    function renderResults() {
      results.replaceChildren();
      const query = search.value.trim();
      const matches = query ? searchCatalog([...foodChoices(customFoods), ...preparations], query) : [];
      more.hidden = matches.length <= limit;
      status.textContent = !query ? '' : matches.length
        ? `Exibindo ${Math.min(limit, matches.length)} de ${matches.length} resultados.`
        : 'Nenhum resultado. Confira o nome ou cadastre o alimento com os dados do rótulo ou de fonte validada.';
      for (const choice of matches.slice(0, limit)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = `${choice.name} · ${choice.detail}`;
        button.onclick = () => addItem(choice);
        results.append(button);
      }
    }
    search.oninput = () => {limit = 12; renderResults();};
    more.onclick = () => {limit += 12; renderResults();};
    const register = root.querySelector('[data-register-food]');
    if (register) register.onclick = () => {
      if (items.length >= 100) return notify('Limite de 100 itens.');
      registerFood(search.value.trim(), food => addItem({item: {customFood: food}}));
    };
    search.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
    renderRows();
    return root;
  }

  const completeItems = items => items.filter(item => Number.isFinite(grams(item)) && grams(item) > 0);
  function renderMenus(state, readonly) {
    const dates = weekDates(date);
    const entries = structuredClone(mealItems(state, date, phase));
    const customFoods = [...(state.customFoods ?? [])];
    const newFoods = [];
    const weights = measureDraft(state);
    main.innerHTML = `<h1>Cardápio semanal</h1>
      <section><div class="nutrition-controls"><label>Data do cardápio<input id="menu-date" type="date" value="${date}"></label>
      <label>Registro<select id="menu-phase"><option value="planned">Planejado</option><option value="served">Realizado</option></select></label></div>
      <div class="week-days" aria-label="Dias da semana">${dates.map((day, index) => `<button type="button" class="secondary" data-date="${day}" aria-pressed="${day === date}">${days[index]} ${dateLabel(day).slice(0, 5)}${Object.keys(state.datedMenus?.[day] ?? {}).length ? ' •' : ''}</button>`).join('')}</div>
      <label>Histórico de datas registradas<select id="menu-history"><option value="">Selecionar data</option>${Object.keys(state.datedMenus ?? {}).sort().reverse().map(day => `<option value="${day}" ${day === date ? 'selected' : ''}>${dateLabel(day)}</option>`).join('')}</select></label>
      <p id="daily-vet" class="nutrition-total" aria-live="polite"></p>
      <p>Quantidades por pessoa. Use frações decimais, como 0,5 fatia ou 2 colheres.</p>${measureHelp}
      <form id="dated-menu-form">${meals.map((name, index) => `<fieldset class="nutrition-meal"><legend>${name}</legend><div data-meal="${index}"></div><p data-vet="${index}" class="nutrition-total"></p></fieldset>`).join('')}
      <button ${readonly ? 'hidden' : ''}>Salvar cardápio</button></form>${source}</section>
      ${readonly ? '' : `<dialog id="menu-food-dialog" aria-labelledby="menu-food-title">
        <h2 id="menu-food-title">Cadastrar alimento</h2>
        <p>Use valores por 100 g de parte comestível, obtidos do rótulo ou de fonte nutricional validada. Salve o cardápio para gravar o alimento no cofre.</p>
        <form>${customFoodFields()}<p class="menu-food-error" role="status"></p>
          <button type="submit">Adicionar à refeição</button><button type="button" data-cancel-food class="secondary">Cancelar</button>
        </form></dialog>`}
      <section><h2>Lista de compras da semana</h2><label>Pessoas<input id="shopping-people" type="number" min="1" max="10000" value="${people}" inputmode="numeric" required></label>
      <p>Usa os cardápios planejados salvos. Pesos no estado indicado, sem ajuste para cascas, aparas ou cocção. Fichas são desdobradas em ingredientes.</p><ul id="shopping-list"></ul></section>
      <section><details><summary>Cardápios anteriores sem data</summary>${days.map(day => `<h3>${day}</h3><ul>${state.menus[day].map(meal => `<li>${esc(meal.name)} · ${esc(meal.description)} · ${meal.kcal} kcal</li>`).join('')}</ul>`).join('')}</details></section>`;
    function update() {
      entries.forEach((items, index) => {
        main.querySelector(`[data-vet="${index}"]`).textContent = nutrientLabel(totals(completeItems(items)));
      });
      main.querySelector('#daily-vet').textContent = 'Dia · ' + nutrientLabel(totals(completeItems(entries.flat())));
    }
    const dialog = main.querySelector('#menu-food-dialog');
    let addFood;
    if (dialog) {
      const form = dialog.querySelector('form');
      const error = dialog.querySelector('.menu-food-error');
      addFood = (name, select) => {
        form.reset();
        error.textContent = '';
        form.elements.name.value = name.slice(0, 100);
        dialog.showModal();
        form.onsubmit = event => {
          event.preventDefault();
          let food;
          try {food = readCustomFood(form);} catch (issue) {error.textContent = issue.message; return;}
          if (customFoods.length >= 2000) {error.textContent = 'Limite de 2.000 alimentos locais.'; return;}
          customFoods.push(food);
          newFoods.push(food);
          dialog.close();
          select(food);
        };
      };
      dialog.querySelector('[data-cancel-food]').onclick = () => dialog.close();
    }
    entries.forEach((items, index) => main.querySelector(`[data-meal="${index}"]`)
      .append(itemEditor(items, customFoods, state.technicalRecipes ?? {}, weights, markDirty, update, readonly, addFood)));
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
        weights.commit(next);
        if (newFoods.length) {
          next.customFoods ??= [];
          next.customFoods.push(...newFoods);
        }
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
    const weights = measureDraft(state);
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
        <h2>Ingredientes</h2>${measureHelp}<div id="recipe-items"></div>
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
    main.querySelector('#recipe-items').append(itemEditor(draft.items, state.customFoods ?? [], {}, weights, markDirty, update, readonly));
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
        weights.commit(next);
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
      <form id="custom-food-form">${customFoodFields()}
      <button>Salvar alimento</button></form></section>`;

    const search = main.querySelector('#catalog-search');
    const list = main.querySelector('#catalog-list');
    const more = main.querySelector('#catalog-more');
    let limit = 30;
    function update() {
      const matches = searchCatalog(choices, search.value);
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
      let food;
      try {food = readCustomFood(form);} catch (error) {return notify(error.message);}
      persist(next => {
        next.customFoods ??= [];
        next.customFoods.push(food);
      }, 'Alimento salvo.');
    };
  }

  return {renderMenus, renderRecipes, renderFoods, reset};
}
