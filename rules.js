/* Kniffel scoring logic — independent of the browser UI. */
(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  root.KniffelRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CATEGORIES = Object.freeze([
    { key: 'ones', name: 'Einser', hint: 'Alle Einser addieren', section: 'upper', number: 1 },
    { key: 'twos', name: 'Zweier', hint: 'Alle Zweier addieren', section: 'upper', number: 2 },
    { key: 'threes', name: 'Dreier', hint: 'Alle Dreier addieren', section: 'upper', number: 3 },
    { key: 'fours', name: 'Vierer', hint: 'Alle Vierer addieren', section: 'upper', number: 4 },
    { key: 'fives', name: 'Fünfer', hint: 'Alle Fünfer addieren', section: 'upper', number: 5 },
    { key: 'sixes', name: 'Sechser', hint: 'Alle Sechser addieren', section: 'upper', number: 6 },
    { key: 'threeKind', name: 'Dreierpasch', hint: 'Mind. drei gleiche · Augensumme', section: 'lower' },
    { key: 'fourKind', name: 'Viererpasch', hint: 'Mind. vier gleiche · Augensumme', section: 'lower' },
    { key: 'fullHouse', name: 'Full House', hint: 'Drei gleiche + zwei gleiche · 25 Punkte', section: 'lower' },
    { key: 'smallStraight', name: 'Kleine Straße', hint: 'Vier aufeinanderfolgende · 30 Punkte', section: 'lower' },
    { key: 'largeStraight', name: 'Große Straße', hint: 'Fünf aufeinanderfolgende · 40 Punkte', section: 'lower' },
    { key: 'kniffel', name: 'Kniffel', hint: 'Fünf gleiche · 50 Punkte', section: 'lower' },
    { key: 'chance', name: 'Chance', hint: 'Alle fünf Würfel addieren', section: 'lower' }
  ]);
  const KEYS = CATEGORIES.map(category => category.key);
  const UPPER_KEYS = KEYS.slice(0, 6);
  const LOWER_KEYS = KEYS.slice(6);
  const FIXED = { fullHouse: 25, smallStraight: 30, largeStraight: 40, kniffel: 50 };

  function emptyScores() {
    return Object.fromEntries(KEYS.map(key => [key, null]));
  }

  function isKniffel(dice) {
    return Array.isArray(dice) && dice.length === 5 && dice.every(value => value === dice[0] && Number.isInteger(value) && value >= 1 && value <= 6);
  }

  function hasStraight(unique, count) {
    for (let begin = 1; begin <= 7 - count; begin++) {
      if (Array.from({ length: count }, (_, index) => unique.has(begin + index)).every(Boolean)) return true;
    }
    return false;
  }

  function scoreDice(key, dice) {
    if (!KEYS.includes(key) || !Array.isArray(dice) || dice.length !== 5 || !dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6)) return 0;
    const category = CATEGORIES.find(item => item.key === key);
    const counts = Array.from({ length: 7 }, (_, value) => dice.filter(n => n === value).length);
    const sum = dice.reduce((a, b) => a + b, 0);
    const unique = new Set(dice);
    if (category.number) return category.number * counts[category.number];
    switch (key) {
      case 'threeKind': return counts.some(n => n >= 3) ? sum : 0;
      case 'fourKind': return counts.some(n => n >= 4) ? sum : 0;
      case 'fullHouse': return counts.includes(3) && counts.includes(2) ? 25 : 0;
      case 'smallStraight': return hasStraight(unique, 4) ? 30 : 0;
      case 'largeStraight': return hasStraight(unique, 5) ? 40 : 0;
      case 'kniffel': return isKniffel(dice) ? 50 : 0;
      case 'chance': return sum;
      default: return 0;
    }
  }

  // 2024 Schmidt Spiele standard rules: a subsequent Kniffel gives +50
  // and the maximum score in any still empty category. Only awarded after
  // the Kniffel category has actually been scored with 50 (not scratched).
  function isBonusKniffel(scores, dice) {
    return scores && scores.kniffel === 50 && isKniffel(dice);
  }

  function scoreForTurn(key, dice, scores) {
    if (!KEYS.includes(key) || !scores || scores[key] !== null) return null;
    if (!isBonusKniffel(scores, dice)) return scoreDice(key, dice);
    const category = CATEGORIES.find(item => item.key === key);
    if (category.number) return category.number * 5;
    if (Object.hasOwn(FIXED, key)) return FIXED[key];
    return dice.reduce((a, b) => a + b, 0);
  }

  function totals(player) {
    const scores = player.scores;
    const upper = UPPER_KEYS.reduce((sum, key) => sum + (scores[key] ?? 0), 0);
    const bonus = upper >= 63 ? 35 : 0;
    const lower = LOWER_KEYS.reduce((sum, key) => sum + (scores[key] ?? 0), 0);
    const extra = (player.bonusKniffels || 0) * 50;
    const filled = KEYS.filter(key => scores[key] !== null).length;
    return { upper, bonus, lower, extra, total: upper + bonus + lower + extra, filled };
  }
  return { CATEGORIES, KEYS, UPPER_KEYS, LOWER_KEYS, emptyScores, scoreDice, isKniffel, isBonusKniffel, scoreForTurn, totals };
});
