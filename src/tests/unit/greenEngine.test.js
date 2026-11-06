import { describe, it, expect } from 'vitest';
import { computeTokenImpact, evalBadges } from '../../services/green/greenEngine';
import { GREEN_FACTORS, BADGES } from '../../utils/constants';

const baseToken = {
  waitSeconds: 30 * 60, // waited 30 virtual minutes
  joinedRemote: false,
};

describe('greenEngine — Green Impact accounting', () => {
  it('every token saves at least one paper sheet and positive CO₂', () => {
    const imp = computeTokenImpact(baseToken);
    expect(imp.sheets).toBe(GREEN_FACTORS.paperSheetsPerToken);
    expect(imp.co2g).toBeGreaterThan(0);
    expect(imp.minutesSaved).toBe(30);
    expect(imp.points).toBeGreaterThan(0);
  });

  it('remote joins add the two-way commute factor', () => {
    const near = computeTokenImpact({ ...baseToken, joinedRemote: false });
    const far = computeTokenImpact({ ...baseToken, joinedRemote: true });
    const commuteExtra = GREEN_FACTORS.avgCommuteKmOneWay * 2 * GREEN_FACTORS.co2gPerKmMix;
    expect(far.co2g).toBeGreaterThanOrEqual(near.co2g + commuteExtra - 1);
  });

  it('CO₂ grows with avoided standing time (HVAC crowd factor)', () => {
    const short = computeTokenImpact({ ...baseToken, waitSeconds: 5 * 60 });
    const long = computeTokenImpact({ ...baseToken, waitSeconds: 60 * 60 });
    expect(long.co2g).toBeGreaterThan(short.co2g);
  });

  it('₹ value uses the configured student hourly rate', () => {
    const imp = computeTokenImpact({ ...baseToken, waitSeconds: 60 * 60 });
    expect(imp.inrValue).toBeGreaterThan(0);
  });

  it('badges unlock exactly at their thresholds', () => {
    const none = evalBadges({ tokens: 9, minutesSaved: 299, co2g: 4999, offpeakJoins: 4 });
    expect(none).toEqual([]);
    const all = evalBadges({ tokens: 25, minutesSaved: 300, co2g: 5000, offpeakJoins: 5 });
    expect(all).toEqual(BADGES.map((b) => b.id));
    const pioneer = evalBadges({ tokens: 10, minutesSaved: 0, co2g: 0, offpeakJoins: 0 });
    expect(pioneer).toEqual(['paperless-pioneer']);
  });
});
