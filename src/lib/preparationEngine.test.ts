import { describe, it, expect } from 'vitest';
import { countSupportingComponents, computePreparationMedal, SupportingComponentsInput } from './preparationEngine';

function components(overrides: Partial<SupportingComponentsInput> = {}): SupportingComponentsInput {
  return {
    physicalReadiness: null,
    mentalPriming: null,
    impulseControlSmoking: null,
    impulseControlPmo: null,
    impulseControlRecovery: null,
    ...overrides,
  };
}

describe('countSupportingComponents', () => {
  it('counts 0 when nothing is filled in', () => {
    expect(countSupportingComponents(components())).toBe(0);
  });

  it('counts Physical Readiness as complete for LIGHT or FULL, but not NONE', () => {
    expect(countSupportingComponents(components({ physicalReadiness: 'LIGHT' }))).toBe(1);
    expect(countSupportingComponents(components({ physicalReadiness: 'FULL' }))).toBe(1);
    expect(countSupportingComponents(components({ physicalReadiness: 'NONE' }))).toBe(0);
  });

  it('counts Mental Priming as complete only when true', () => {
    expect(countSupportingComponents(components({ mentalPriming: true }))).toBe(1);
    expect(countSupportingComponents(components({ mentalPriming: false }))).toBe(0);
  });

  it('counts Impulse Control as one component, requiring all three sub-checks clean', () => {
    expect(
      countSupportingComponents(
        components({ impulseControlSmoking: false, impulseControlPmo: false, impulseControlRecovery: true }),
      ),
    ).toBe(1);
    // Any single sub-check failing means the whole component doesn't count.
    expect(
      countSupportingComponents(
        components({ impulseControlSmoking: true, impulseControlPmo: false, impulseControlRecovery: true }),
      ),
    ).toBe(0);
    expect(
      countSupportingComponents(
        components({ impulseControlSmoking: false, impulseControlPmo: true, impulseControlRecovery: true }),
      ),
    ).toBe(0);
    expect(
      countSupportingComponents(
        components({ impulseControlSmoking: false, impulseControlPmo: false, impulseControlRecovery: false }),
      ),
    ).toBe(0);
  });

  it('counts all 3 components when everything is fully completed', () => {
    expect(
      countSupportingComponents({
        physicalReadiness: 'FULL',
        mentalPriming: true,
        impulseControlSmoking: false,
        impulseControlPmo: false,
        impulseControlRecovery: true,
      }),
    ).toBe(3);
  });
});

describe('computePreparationMedal', () => {
  it('is GOLD when sleep and meditation both clear target with >=2 supporting components', () => {
    expect(
      computePreparationMedal({ sleepHours: 7, meditationMinutes: 20, supportingComponentsCompleted: 2 }),
    ).toBe('GOLD');
    expect(
      computePreparationMedal({ sleepHours: 8, meditationMinutes: 30, supportingComponentsCompleted: 3 }),
    ).toBe('GOLD');
  });

  it('is SILVER when sleep and meditation both clear target but fewer than 2 supporting components', () => {
    expect(
      computePreparationMedal({ sleepHours: 7, meditationMinutes: 20, supportingComponentsCompleted: 1 }),
    ).toBe('SILVER');
    expect(
      computePreparationMedal({ sleepHours: 7, meditationMinutes: 20, supportingComponentsCompleted: 0 }),
    ).toBe('SILVER');
  });

  it('is BRONZE when exactly one of sleep or meditation is below target', () => {
    expect(
      computePreparationMedal({ sleepHours: 6, meditationMinutes: 20, supportingComponentsCompleted: 3 }),
    ).toBe('BRONZE');
    expect(
      computePreparationMedal({ sleepHours: 7, meditationMinutes: 10, supportingComponentsCompleted: 3 }),
    ).toBe('BRONZE');
  });

  it('is NONE when both sleep and meditation are below target, regardless of supporting components', () => {
    expect(
      computePreparationMedal({ sleepHours: 5, meditationMinutes: 5, supportingComponentsCompleted: 3 }),
    ).toBe('NONE');
  });

  it('treats a null (unlogged) signal the same as below target', () => {
    expect(
      computePreparationMedal({ sleepHours: null, meditationMinutes: 25, supportingComponentsCompleted: 3 }),
    ).toBe('BRONZE');
    expect(
      computePreparationMedal({ sleepHours: null, meditationMinutes: null, supportingComponentsCompleted: 3 }),
    ).toBe('NONE');
  });

  it('is exactly at the boundary thresholds (>=7h sleep, >=20min meditation) inclusive', () => {
    expect(
      computePreparationMedal({ sleepHours: 6.99, meditationMinutes: 20, supportingComponentsCompleted: 2 }),
    ).toBe('BRONZE');
    expect(
      computePreparationMedal({ sleepHours: 7, meditationMinutes: 19, supportingComponentsCompleted: 2 }),
    ).toBe('BRONZE');
  });
});
