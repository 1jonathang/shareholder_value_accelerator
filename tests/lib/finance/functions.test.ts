import { describe, it, expect } from 'vitest';
import {
  NPV,
  IRR,
  XIRR,
  PV,
  FV,
  PMT,
  NPER,
  RATE,
  amortizationSchedule,
  CAGR,
  paybackPeriod,
  MIRR,
} from '@/lib/finance/functions';

describe('Financial Functions', () => {
  describe('NPV', () => {
    it('calculates net present value correctly', () => {
      // Initial investment of -1000, then 300 for 5 years at 10%
      const npv = NPV(0.1, 300, 300, 300, 300, 300);
      expect(npv).toBeCloseTo(1137.24, 2);
    });

    it('handles negative cash flows', () => {
      const npv = NPV(0.1, -100, -100, 500);
      expect(npv).toBeCloseTo(202.63, 2);
    });

    it('returns 0 for empty cash flows', () => {
      const npv = NPV(0.1);
      expect(npv).toBe(0);
    });
  });

  describe('IRR', () => {
    it('calculates internal rate of return', () => {
      // Investment project: -1000 initial, then positive returns
      const irr = IRR([-1000, 300, 400, 400, 300]);
      expect(irr).toBeCloseTo(0.1061, 4);
    });

    it('handles simple case', () => {
      const irr = IRR([-100, 110]);
      expect(irr).toBeCloseTo(0.1, 4);
    });

    it('throws on non-convergence', () => {
      // All positive cash flows - no valid IRR
      expect(() => IRR([100, 100, 100])).toThrow();
    });
  });

  describe('XIRR', () => {
    it('calculates IRR with irregular dates', () => {
      const cashFlows = [
        { amount: -10000, date: new Date('2020-01-01') },
        { amount: 2750, date: new Date('2020-06-01') },
        { amount: 4250, date: new Date('2020-09-01') },
        { amount: 3250, date: new Date('2021-01-01') },
        { amount: 2750, date: new Date('2021-04-01') },
      ];
      const xirr = XIRR(cashFlows);
      expect(xirr).toBeCloseTo(0.3785, 2);
    });
  });

  describe('PV', () => {
    it('calculates present value of annuity', () => {
      const pv = PV({ rate: 0.08, nper: 20, pmt: -500 });
      expect(pv).toBeCloseTo(4909.07, 2);
    });

    it('calculates present value with future value', () => {
      const pv = PV({ rate: 0.06 / 12, nper: 10 * 12, pmt: -200, fv: -10000 });
      expect(pv).toBeCloseTo(23443.88, 2);
    });
  });

  describe('FV', () => {
    it('calculates future value of investment', () => {
      const fv = FV({ rate: 0.06 / 12, nper: 10 * 12, pmt: -200, pv: -1000 });
      expect(fv).toBeCloseTo(35076.11, 2);
    });

    it('handles compound interest only', () => {
      const fv = FV({ rate: 0.05, nper: 10, pv: -1000 });
      expect(fv).toBeCloseTo(1628.89, 2);
    });
  });

  describe('PMT', () => {
    it('calculates loan payment', () => {
      // $200,000 loan at 6% for 30 years
      const pmt = PMT({ rate: 0.06 / 12, nper: 30 * 12, pv: 200000 });
      expect(pmt).toBeCloseTo(-1199.10, 2);
    });

    it('calculates payment with future value target', () => {
      // Save for $10,000 in 5 years at 4%
      const pmt = PMT({ rate: 0.04 / 12, nper: 5 * 12, fv: 10000 });
      expect(pmt).toBeCloseTo(-150.83, 2);
    });
  });

  describe('NPER', () => {
    it('calculates number of periods', () => {
      // How long to pay off $20,000 at 6% with $500/month
      const nper = NPER({ rate: 0.06 / 12, pmt: -500, pv: 20000 });
      expect(nper).toBeCloseTo(44.41, 2);
    });
  });

  describe('RATE', () => {
    it('calculates interest rate', () => {
      // $200/month for 4 years on $8,000 loan
      const rate = RATE(4 * 12, -200, 8000);
      expect(rate * 12).toBeCloseTo(0.0925, 4); // ~9.25% annual
    });
  });

  describe('amortizationSchedule', () => {
    it('generates correct schedule', () => {
      const schedule = amortizationSchedule(10000, 0.06, 1);
      
      expect(schedule).toHaveLength(12);
      expect(schedule[0].payment).toBeCloseTo(860.66, 2);
      expect(schedule[11].balance).toBeCloseTo(0, 2);
      
      // Total principal should equal loan amount
      const totalPrincipal = schedule.reduce((sum, e) => sum + e.principal, 0);
      expect(totalPrincipal).toBeCloseTo(10000, 2);
    });
  });

  describe('CAGR', () => {
    it('calculates compound annual growth rate', () => {
      // $10,000 growing to $19,500 over 5 years
      const cagr = CAGR(10000, 19500, 5);
      expect(cagr).toBeCloseTo(0.1431, 4); // ~14.31%
    });
  });

  describe('paybackPeriod', () => {
    it('calculates time to recover investment', () => {
      const period = paybackPeriod(10000, [2500, 2500, 2500, 2500, 2500]);
      expect(period).toBe(4);
    });

    it('calculates fractional period', () => {
      const period = paybackPeriod(10000, [3000, 4000, 5000]);
      expect(period).toBeCloseTo(2.6, 1);
    });

    it('returns Infinity if never recovered', () => {
      const period = paybackPeriod(10000, [100, 100, 100]);
      expect(period).toBe(Infinity);
    });
  });

  describe('MIRR', () => {
    it('calculates modified IRR', () => {
      const mirr = MIRR([-120000, 39000, 30000, 21000, 37000, 46000], 0.1, 0.12);
      expect(mirr).toBeCloseTo(0.1261, 4);
    });
  });
});

