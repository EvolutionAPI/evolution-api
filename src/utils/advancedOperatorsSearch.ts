function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function advancedOperatorsSearch(data: string, query: string): boolean {
  const filters = query.split(' ').reduce((acc: Record<string, string[]>, filter) => {
    const [operator, ...values] = filter.split(':');
    const value = values.join(':');

    if (!acc[operator]) {
      acc[operator] = [];
    }
    acc[operator].push(value);
    return acc;
  }, {});

  const normalizedItem = normalizeString(data);

  return Object.entries(filters).every(([operator, values]) => {
    return values.some((val) => {
      const subValues = val.split(',');
      return subValues.every((subVal) => {
        const normalizedSubVal = normalizeString(subVal);

        switch (operator.toLowerCase()) {
          case 'contains':
            return normalizedItem.includes(normalizedSubVal);
          case 'notcontains':
            return !normalizedItem.includes(normalizedSubVal);
          case 'startswith':
            return normalizedItem.startsWith(normalizedSubVal);
          case 'endswith':
            return normalizedItem.endsWith(normalizedSubVal);
          case 'exact':
            return normalizedItem === normalizedSubVal;
          default:
            return false;
        }
      });
    });
  });
}
