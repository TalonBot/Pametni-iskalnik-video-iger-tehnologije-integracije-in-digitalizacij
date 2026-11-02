export function selectRow(data, year, sex, education) {
  return data.rows.find(row => row.year === year && row.sex === sex && row.education === education);
}

export function buildView(data, { year, sex, education, metric }) {
  const value = row => row?.[metric] ?? null;
  const current = selectRow(data, year, sex, education);
  const earlier = data.years.filter(y => Number(y) < Number(year)).reverse()
    .map(y => selectRow(data, y, sex, education)).find(row => value(row) !== null);
  const delta = value(current) !== null && earlier ? value(current) - value(earlier) : null;
  return {
    current, previousYear: earlier?.year ?? null, delta,
    trend: data.years.filter(y => data.rows.some(row => row.year === y && row.count !== null))
      .map(y => ({ label: y, row: selectRow(data, y, sex, education) })),
    // SURS publishes totals. Never add total + subgroups (or average percentages).
    bySex: data.sexes.slice(1).map(group => ({ label: group.label, row: selectRow(data, year, group.code, education) })),
    byEducation: data.educations.slice(1).map(group => ({ label: group.label, row: selectRow(data, year, sex, group.code) })),
    table: data.years.map(y => selectRow(data, y, sex, education)),
  };
}
