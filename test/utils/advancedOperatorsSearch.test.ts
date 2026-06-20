import { advancedOperatorsSearch } from '../../src/utils/advancedOperatorsSearch';

describe('advancedOperatorsSearch', () => {
  const defaultData = 'Café expresso com açúcar e leite';

  it('should return true for contains with normalized strings and no case sensitivity', () => {
    expect(advancedOperatorsSearch(defaultData, 'contains:cafe')).toBe(true);
    expect(advancedOperatorsSearch(defaultData, 'contains:acucar')).toBe(true);
  });

  it('should return false for contains when substring is missing', () => {
    expect(advancedOperatorsSearch(defaultData, 'contains:cha')).toBe(false);
  });

  it('should return true for notcontains when substring is absent', () => {
    expect(advancedOperatorsSearch(defaultData, 'notcontains:cha')).toBe(true);
  });

  it('should return false for notcontains when substring is present', () => {
    expect(advancedOperatorsSearch(defaultData, 'notcontains:leite')).toBe(false);
  });

  it('should return true for startswith when string matches at index 0', () => {
    expect(advancedOperatorsSearch(defaultData, 'startswith:cafe')).toBe(true);
  });

  it('should return false for startswith when string is found but not at index 0', () => {
    expect(advancedOperatorsSearch(defaultData, 'startswith:expresso')).toBe(false);
  });

  it('should return true for endswith when string matches at the tail end', () => {
    expect(advancedOperatorsSearch(defaultData, 'endswith:leite')).toBe(true);
  });

  it('should return false for endswith when string is found but not at the tail end', () => {
    expect(advancedOperatorsSearch(defaultData, 'endswith:cafe')).toBe(false);
  });

  it('should return true for exact match of normalized string', () => {
    expect(advancedOperatorsSearch('cafe', 'exact:cafe')).toBe(true);
    expect(advancedOperatorsSearch('João!', 'exact:joao!')).toBe(true);
  });

  it('should return false for exact match when there are extra characters', () => {
    expect(advancedOperatorsSearch(defaultData, 'exact:cafe')).toBe(false);
  });

  it('should return false for an unknown operator', () => {
    expect(advancedOperatorsSearch(defaultData, 'unknown_operator:cafe')).toBe(false);
  });

  it('should return false for empty query string to prevent matching everything', () => {
    // The function now returns false for empty queries to prevent accidental bot detection.
    expect(advancedOperatorsSearch(defaultData, '')).toBe(false);
  });

  it('should handle implicit AND logic for multiple distinct operators', () => {
    expect(advancedOperatorsSearch(defaultData, 'contains:cafe notcontains:cha')).toBe(true);
    expect(advancedOperatorsSearch(defaultData, 'contains:cafe notcontains:leite')).toBe(false);
  });

  it('should handle internal AND logic for comma-separated values within the same operator', () => {
    expect(advancedOperatorsSearch(defaultData, 'contains:cafe,leite')).toBe(true);
    expect(advancedOperatorsSearch(defaultData, 'contains:cafe,cha')).toBe(false);
  });

  it('should correctly parse values containing colons', () => {
    // Splits values like "exact:time:10:00" into segments and joins everything except the first segment, resulting in "time:10:00".
    expect(advancedOperatorsSearch('time:10:00', 'exact:time:10:00')).toBe(true);
  });

  it('should handle extra spaces gracefully by ignoring empty filters', () => {
    // Assuming the data contains empty string when split, an empty operator will match everything
    expect(advancedOperatorsSearch(defaultData, 'contains:cafe  contains:leite')).toBe(true);
  });
});
