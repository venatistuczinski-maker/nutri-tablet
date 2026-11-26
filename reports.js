import {days, meals, validDate} from './domain.js';
import {localDate, mealItems, totals, weekDates} from './nutrition.js';

const fmt = date => date.split('-').reverse().join('/');
const decimal = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2});
const num = value => decimal.format(value);

export function renderReports(main, state, esc, selected) {
  main.innerHTML = `<h1>Relatórios</h1><section class="report-controls">
    <label>Relatório<select id="report-kind">
      <option value="individual">Evolução individual</option><option value="weekly">Cardápio semanal</option>
    </select></label>
    <label id="report-person-field">Pessoa acompanhada<select id="report-person">
      ${state.children.map(person => `<option value="${esc(person.id)}"${person.id === selected ? ' selected' : ''}>${esc(person.name)}</option>`).join('')}
    </select></label>
    <div class="nutrition-controls" id="report-menu-fields" hidden>
      <label>Data da semana<input id="report-date" type="date" value="${localDate()}"></label>
      <label>Registro<select id="report-phase"><option value="planned">Planejado</option><option value="served">Realizado</option></select></label>
    </div>
    <p>Na janela de impressão, escolha “Salvar como PDF” para gerar um arquivo. O PDF e a impressão ficam fora do cofre.</p>
    <button type="button" id="report-print">Imprimir / salvar PDF</button>
  </section><section id="print-report" aria-label="Prévia do relatório"></section>`;

  const kind = main.querySelector('#report-kind');
  const individual = main.querySelector('#report-person-field');
  const menu = main.querySelector('#report-menu-fields');
  const personSelect = main.querySelector('#report-person');
  const dateInput = main.querySelector('#report-date');
  const phaseInput = main.querySelector('#report-phase');
  const print = main.querySelector('#report-print');
  const preview = main.querySelector('#print-report');
  const heading = '<p class="report-brand">Nutrir · Casa de Acolhimento · Ambiente de demonstração</p>';

  function update() {
    individual.hidden = kind.value !== 'individual';
    menu.hidden = !individual.hidden;
    if (!individual.hidden) {
      const person = state.children.find(record => record.id === personSelect.value);
      print.disabled = !person;
      if (!person) {
        preview.innerHTML = '<p>Cadastre uma pessoa fictícia para emitir este relatório.</p>';
        return;
      }
      const entries = [...person.measurements].sort((a,b) => a.date.localeCompare(b.date));
      preview.innerHTML = `${heading}<h2>Evolução individual</h2>
        <p><strong>${esc(person.name)}</strong> · Nascimento em ${fmt(person.birth)}</p>
        <table><thead><tr><th scope="col">Data</th><th scope="col">Peso (kg)</th><th scope="col">Altura (cm)</th><th scope="col">IMC (kg/m²)</th></tr></thead>
        <tbody>${entries.map(entry => `<tr><td>${fmt(entry.date)}</td><td>${num(entry.weight)}</td><td>${num(entry.height)}</td><td>${num(entry.weight / (entry.height / 100) ** 2)}</td></tr>`).join('') ||
          '<tr><td colspan="4">Sem avaliações registradas.</td></tr>'}</tbody></table>
        <p>Registro de medidas, sem classificação antropométrica automática.</p>`;
      return;
    }
    print.disabled = !validDate(dateInput.value);
    if (print.disabled) {
      preview.innerHTML = '<p>Selecione uma data válida.</p>';
      return;
    }
    const dates = weekDates(dateInput.value);
    const phase = phaseInput.value;
    preview.innerHTML = `${heading}<h2>Cardápio semanal · ${phase === 'planned' ? 'Planejado' : 'Realizado'}</h2>
      <p>${fmt(dates[0])} a ${fmt(dates.at(-1))} · Valores por pessoa</p>
      <table><thead><tr><th scope="col">Dia</th><th scope="col">Refeição</th><th scope="col">VET (kcal)</th><th scope="col">Proteínas (g)</th><th scope="col">Carboidratos (g)</th><th scope="col">Lipídios (g)</th></tr></thead>
      <tbody>${dates.map((date,index) => {
        const entries = mealItems(state,date,phase);
        const registered = state.datedMenus?.[date]?.[phase];
        const dateLabel = `${days[index]} · ${fmt(date)}`;
        if (!registered) return `<tr><td>${dateLabel}</td><td colspan="5">Sem registro</td></tr>`;
        return entries.map((items, meal) => {
          const values = totals(items);
          return `<tr><td>${meal === 0 ? dateLabel : ''}</td><td>${meals[meal]}</td><td>${num(values.kcal)}</td><td>${num(values.protein)}</td><td>${num(values.carbs)}</td><td>${num(values.fat)}</td></tr>`;
        }).join('') + `<tr class="report-total"><td></td><th scope="row">Total do dia</th>${['kcal','protein','carbs','fat'].map(key => `<td>${num(totals(entries.flat())[key])}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table>`;
  }
  for (const input of [kind, personSelect, dateInput, phaseInput]) input.onchange = update;
  print.onclick = () => {if (!print.disabled) window.print();};
  update();
}
