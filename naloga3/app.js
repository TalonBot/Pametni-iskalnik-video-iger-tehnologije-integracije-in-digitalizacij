import { buildView } from './model.js';

const $ = id => document.getElementById(id);
const integer = new Intl.NumberFormat('sl-SI', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const date = value => new Date(value).toLocaleString('sl-SI');
const format = (value, percent = false) => value == null ? '—' : (percent ? decimal : integer).format(value);
const filters = ['year', 'sex', 'education', 'metric'];
let data;
let charts = [];
let currentView;
const state = () => Object.fromEntries(filters.map(key => [key, $(key).value]));
const label = (options, code) => options.find(option => option.code === code)?.label || '';
const annotations = row => {
  if (!row) return '—';
  return [row.count === null ? `igranje: ${row.raw}` : row.note ? `igranje: ${row.note}` : '',
    row.internetUsers === null ? `internet: ${row.baseRaw}` : row.baseNote ? `internet: ${row.baseNote}` : ''].filter(Boolean).join('; ') || '—';
};

function populate(id, options, old) {
  $(id).replaceChildren(...options.map(item => new Option(item.label, item.code)));
  if (options.some(item => item.code === old)) $(id).value = old;
}

function setDefaults() {
  $('sex').value = data.sexes[0].code;
  $('education').value = data.educations[0].code;
  $('year').value = [...data.years].reverse().find(year => data.rows.some(row => row.year === year && row.count !== null));
  $('metric').value = 'percent';
}

function makeChart(id, type, groups, horizontal = false) {
  const { metric, year } = state();
  const percent = metric === 'percent';
  const line = type === 'line';
  const chart = new Chart($(id), {
    type,
    data: {
      labels: groups.map(group => group.label),
      datasets: [{ label: percent ? 'Delež uporabnikov interneta (%)' : 'Število oseb',
        data: groups.map(group => group.row?.[metric] ?? null),
        borderColor: '#c6f36a', backgroundColor: line ? '#c6f36a12' : groups.map((_, index) => index === 0 ? '#c6f36a' : index === 1 ? '#e3e3e3' : '#858585'),
        borderWidth: line ? 2 : 0, fill: line, tension: 0, spanGaps: false,
        pointBackgroundColor: groups.map(group => group.label === year ? '#ffffff' : '#c6f36a'),
        pointRadius: groups.map(group => group.label === year ? 6 : 4), pointHoverRadius: 7,
        maxBarThickness: 42, borderRadius: line ? 0 : 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
      animation: { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250 },
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: context => `${format(context.raw, percent)}${percent && context.raw !== null ? ' %' : ' oseb'}`,
        afterLabel: context => {
          const note = annotations(groups[context.dataIndex].row);
          return note === '—' ? '' : `Oznaka SURS: ${note}`;
        },
      } } },
      scales: {
        x: { beginAtZero: horizontal || !line, ...(horizontal && percent ? { max: 100 } : {}), grid: { color: '#292929' },
          ticks: { color: '#b0b0b0', ...(horizontal ? { callback: n => format(n) } : {}) }, border: { display: false } },
        y: { beginAtZero: true, ...(!horizontal && percent ? { max: 100 } : {}), grid: { color: horizontal ? 'transparent' : '#292929' },
          ticks: { color: '#b0b0b0', ...(!horizontal ? { callback: n => format(n) } : {}) }, border: { display: false } },
      },
    },
  });
  charts.push(chart);
  const available = groups.filter(group => group.row?.[metric] != null);
  $(id).setAttribute('aria-label', `${line ? 'Trend' : 'Primerjava'}: ${groups.map(group => `${group.label}: ${format(group.row?.[metric], percent)}${percent ? ' %' : ' oseb'}`).join('; ')}. Podatki so tudi v tabeli.`);
  return available.length;
}

function renderTable(view) {
  const addRow = (body, values, selected = false) => {
    const tr = document.createElement('tr');
    if (selected) tr.className = 'selected';
    values.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
    body.append(tr);
  };
  $('table-body').replaceChildren();
  for (const row of view.table) addRow($('table-body'), [row.year, format(row.count), format(row.internetUsers), format(row.percent, true), annotations(row)], row.year === $('year').value);
  $('comparison-body').replaceChildren();
  for (const [name, groups] of [['Po spolu', view.bySex], ['Po izobrazbi', view.byEducation]]) {
    for (const group of groups) addRow($('comparison-body'), [name, group.label, format(group.row?.count), format(group.row?.percent, true), annotations(group.row)]);
  }
}

function render() {
  const { year, sex, education, metric } = state();
  const view = buildView(data, state());
  currentView = view;
  const current = view.current;
  const percent = metric === 'percent';
  $('selection').textContent = `${year} · ${label(data.sexes, sex)} · ${label(data.educations, education)}`;
  $('count').textContent = format(current?.count);
  $('percent').textContent = current?.percent == null ? '—' : `${format(current.percent, true)} %`;
  $('base').textContent = format(current?.internetUsers);
  $('delta').textContent = view.delta === null ? '—' : `${view.delta > 0 ? '+' : ''}${format(view.delta, percent)}${percent ? ' o. t.' : ''}`;
  $('delta-label').textContent = view.delta === null ? 'primerjava ni na voljo' : `glede na ${view.previousYear}${percent ? ' · odstotne točke' : ' · oseb'}`;
  document.querySelectorAll('.unit').forEach(element => { element.textContent = percent ? '% UPORABNIKOV INTERNETA' : 'ŠTEVILO OSEB'; });
  $('trend-context').textContent = `${label(data.sexes, sex)} · ${label(data.educations, education)}`;
  $('sex-context').textContent = `${year} · ${label(data.educations, education)} · primerjava obeh spolov`;
  $('education-context').textContent = `${year} · ${label(data.sexes, sex)} · primerjava vseh ravni izobrazbe`;
  charts.forEach(chart => chart.destroy());
  charts = [];
  makeChart('trend', 'line', view.trend);
  const sexCount = makeChart('sex-chart', 'bar', view.bySex);
  const educationCount = makeChart('education-chart', 'bar', view.byEducation.map(group => ({ ...group, label: group.label.replace('Osnovnošolska ali manj', 'Osnovna ali manj').replace('Višješolska, visokošolska ali več', 'Višja, visoka ali več') })), true);
  $('sex-empty').textContent = sexCount === 0 ? 'Za izbrano leto in skupino ni objavljenih meritev igranja.' : 'Ista izobrazba, primerjava moških in žensk. Morebitne oznake SURS so v tabeli.';
  $('education-empty').textContent = educationCount === 0 ? 'Za izbrano leto in skupino ni objavljenih meritev igranja.' : 'Isti spol, primerjava ravni izobrazbe. Delež se izračuna znotraj vsake skupine.';
  renderTable(view);
}

function showProvenance() {
  const updated = /^(\d{4})(\d{2})(\d{2}) (\d{2}):(\d{2})/.exec(data.source.updated);
  const sourceDate = updated ? `${updated[3]}. ${updated[2]}. ${updated[1]} ${updated[4]}:${updated[5]} (čas vira)` : data.source.updated;
  $('provenance').replaceChildren();
  for (const text of [
    `Posodobitev SURS: ${sourceDate} · Prenos datoteke: ${date(data.retrieval.fetchedAt)}`,
    `Vir prikaza: ${data.retrieval.mode === 'live' ? 'svež spletni prenos' : 'zadnja veljavna lokalna kopija'} · Zadnji poskus: ${date(data.retrieval.checkedAt)}`,
    `Tabela ${data.source.matrix} · ${integer.format(data.source.cells)} izvornih celic · Kodiranje ${data.source.encoding}`,
    `SHA-256 datoteke: ${data.source.sha256}`,
  ]) { const line = document.createElement('div'); line.textContent = text; $('provenance').append(line); }
}

async function load() {
  $('refresh').disabled = true;
  filters.forEach(id => { $(id).disabled = true; });
  $('reset').disabled = true;
  $('status').className = 'status';
  $('status').textContent = 'Pridobivam najnovejšo datoteko SURS …';
  try {
    const response = await fetch('/naloga3/api/data', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pridobivanje podatkov ni uspelo.');
    if (typeof Chart === 'undefined') throw new Error('Knjižnica za grafe se ni naložila. Ponovno naložite stran.');
    const previous = data ? state() : null;
    data = result;
    populate('year', data.years.map(year => ({ code: year, label: data.rows.some(row => row.year === year && row.count !== null) ? year : `${year} · brez meritve igranja` })).reverse(), previous?.year);
    populate('sex', data.sexes, previous?.sex);
    populate('education', data.educations, previous?.education);
    if (!previous) setDefaults();
    $('content').hidden = false;
    render();
    showProvenance();
    const fallback = data.retrieval.mode === 'cache';
    $('status').className = fallback ? 'status warning' : 'status';
    $('status').textContent = fallback
      ? `SURS trenutno ni dosegljiv. Prikazana je lokalna kopija, prenesena ${date(data.retrieval.fetchedAt)}. Podatki se ob naslednjem nalaganju ponovno preverijo.`
      : `Podatki uspešno pridobljeni s SURS · ${date(data.retrieval.fetchedAt)}${data.retrieval.cacheSaved ? '' : ' · lokalne kopije ni bilo mogoče shraniti'}.`;
  } catch (error) {
    $('status').className = 'status error';
    $('status').textContent = `${error.message}${data ? ' Na strani ostaja prejšnji prikaz.' : ''}`;
  } finally {
    $('refresh').disabled = false;
    filters.forEach(id => { $(id).disabled = !data; });
    $('reset').disabled = !data;
  }
}

filters.forEach(id => $(id).addEventListener('change', render));
$('refresh').addEventListener('click', load);
$('reset').addEventListener('click', () => { setDefaults(); render(); });
$('csv').addEventListener('click', () => {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const number = value => value == null ? '' : String(value).replace('.', ',');
  const { sex, education } = state();
  const rows = [['Leto', 'Spol', 'Izobrazba', 'Igranje_oseb', 'Internet_oseb', 'Delez_odstotkov', 'Izvorna_vrednost_igranje', 'Izvorna_vrednost_internet', 'Oznaka_igranje', 'Oznaka_internet', 'Vir', 'Prenos_datoteke'],
    ...currentView.table.map(row => [row.year, label(data.sexes, sex), label(data.educations, education), number(row.count), number(row.internetUsers), number(row.percent), row.raw, row.baseRaw, row.note, row.baseNote, data.source.url, data.retrieval.fetchedAt])];
  const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(quote).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `igranje-SI-spol-${sex}-izobrazba-${education}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
await load();
