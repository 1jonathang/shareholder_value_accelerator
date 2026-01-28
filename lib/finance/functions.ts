/**
 * Financial calculation functions
 * These mirror Excel/Google Sheets financial functions
 * Complex calculations are validated via Python before use
 */

import type { CashFlow, TVMParams, AmortizationEntry } from './types';

/**
 * Net Present Value (NPV)
 * Calculates the net present value of an investment based on a discount rate
 * and a series of future payments (negative values) and income (positive values)
 */
export function NPV(rate: number, ...cashFlows: number[]): number {
  return cashFlows.reduce((npv, cf, i) => {
    return npv + cf / Math.pow(1 + rate, i + 1);
  }, 0);
}

/**
 * Internal Rate of Return (IRR)
 * Uses Newton-Raphson method to find the rate where NPV = 0
 */
export function IRR(cashFlows: number[], guess: number = 0.1): number {
  const maxIterations = 100;
  const tolerance = 1e-7;
  let rate = guess;
  
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0; // derivative of NPV
    
    for (let j = 0; j < cashFlows.length; j++) {
      const cf = cashFlows[j];
      const factor = Math.pow(1 + rate, j);
      npv += cf / factor;
      if (j > 0) {
        dnpv -= j * cf / Math.pow(1 + rate, j + 1);
      }
    }
    
    if (Math.abs(npv) < tolerance) {
      return rate;
    }
    
    if (dnpv === 0) {
      throw new Error('IRR calculation failed: derivative is zero');
    }
    
    rate = rate - npv / dnpv;
  }
  
  throw new Error('IRR calculation did not converge');
}

/**
 * Extended Internal Rate of Return (XIRR)
 * IRR for irregular cash flow dates
 */
export function XIRR(cashFlows: CashFlow[], guess: number = 0.1): number {
  if (cashFlows.length < 2) {
    throw new Error('XIRR requires at least 2 cash flows');
  }
  
  const dates = cashFlows.map(cf => {
    if (!cf.date) throw new Error('XIRR requires dates for all cash flows');
    return cf.date.getTime();
  });
  
  const values = cashFlows.map(cf => cf.amount);
  const firstDate = dates[0];
  
  const maxIterations = 100;
  const tolerance = 1e-7;
  let rate = guess;
  
  for (let i = 0; i < maxIterations; i++) {
    let f = 0;
    let df = 0;
    
    for (let j = 0; j < values.length; j++) {
      const years = (dates[j] - firstDate) / (365 * 24 * 60 * 60 * 1000);
      const factor = Math.pow(1 + rate, years);
      f += values[j] / factor;
      df -= years * values[j] / Math.pow(1 + rate, years + 1);
    }
    
    if (Math.abs(f) < tolerance) {
      return rate;
    }
    
    if (df === 0) {
      throw new Error('XIRR calculation failed');
    }
    
    rate = rate - f / df;
  }
  
  throw new Error('XIRR calculation did not converge');
}

/**
 * Present Value (PV)
 * Calculate the present value of a loan or investment
 */
export function PV(params: TVMParams): number {
  const { rate, nper, pmt = 0, fv = 0, type = 0 } = params;
  
  if (rate === 0) {
    return -(fv + pmt * nper);
  }
  
  const pvFactor = Math.pow(1 + rate, nper);
  const annuityFactor = (pvFactor - 1) / rate;
  
  if (type === 1) {
    return -(fv / pvFactor + pmt * (1 + rate) * annuityFactor / pvFactor);
  }
  
  return -(fv / pvFactor + pmt * annuityFactor / pvFactor);
}

/**
 * Future Value (FV)
 * Calculate the future value of an investment
 */
export function FV(params: TVMParams): number {
  const { rate, nper, pmt = 0, pv = 0, type = 0 } = params;
  
  if (rate === 0) {
    return -(pv + pmt * nper);
  }
  
  const fvFactor = Math.pow(1 + rate, nper);
  const annuityFactor = (fvFactor - 1) / rate;
  
  if (type === 1) {
    return -(pv * fvFactor + pmt * (1 + rate) * annuityFactor);
  }
  
  return -(pv * fvFactor + pmt * annuityFactor);
}

/**
 * Payment (PMT)
 * Calculate the periodic payment for a loan
 */
export function PMT(params: TVMParams): number {
  const { rate, nper, pv = 0, fv = 0, type = 0 } = params;
  
  if (rate === 0) {
    return -(pv + fv) / nper;
  }
  
  const fvFactor = Math.pow(1 + rate, nper);
  const annuityFactor = (fvFactor - 1) / rate;
  
  if (type === 1) {
    return -(pv * fvFactor + fv) / ((1 + rate) * annuityFactor);
  }
  
  return -(pv * fvFactor + fv) / annuityFactor;
}

/**
 * Number of Periods (NPER)
 * Calculate the number of periods for a loan or investment
 */
export function NPER(params: Omit<TVMParams, 'nper'> & { pmt: number }): number {
  const { rate, pmt, pv = 0, fv = 0, type = 0 } = params;
  
  if (rate === 0) {
    return -(pv + fv) / pmt;
  }
  
  const pmtAdj = type === 1 ? pmt * (1 + rate) : pmt;
  
  return Math.log((pmtAdj - fv * rate) / (pmtAdj + pv * rate)) / Math.log(1 + rate);
}

/**
 * Interest Rate (RATE)
 * Calculate the interest rate per period
 * Uses Newton-Raphson iteration
 */
export function RATE(
  nper: number,
  pmt: number,
  pv: number,
  fv: number = 0,
  type: 0 | 1 = 0,
  guess: number = 0.1
): number {
  const maxIterations = 100;
  const tolerance = 1e-7;
  let rate = guess;
  
  for (let i = 0; i < maxIterations; i++) {
    const fvFactor = Math.pow(1 + rate, nper);
    const annuityFactor = (fvFactor - 1) / rate;
    
    let f: number;
    let df: number;
    
    if (type === 1) {
      f = pv * fvFactor + pmt * (1 + rate) * annuityFactor + fv;
      df = pv * nper * Math.pow(1 + rate, nper - 1) +
           pmt * annuityFactor +
           pmt * (1 + rate) * (nper * Math.pow(1 + rate, nper - 1) / rate - annuityFactor / rate);
    } else {
      f = pv * fvFactor + pmt * annuityFactor + fv;
      df = pv * nper * Math.pow(1 + rate, nper - 1) +
           pmt * (nper * Math.pow(1 + rate, nper - 1) / rate - annuityFactor / rate);
    }
    
    if (Math.abs(f) < tolerance) {
      return rate;
    }
    
    rate = rate - f / df;
  }
  
  throw new Error('RATE calculation did not converge');
}

/**
 * Generate amortization schedule
 */
export function amortizationSchedule(
  principal: number,
  annualRate: number,
  years: number,
  paymentsPerYear: number = 12
): AmortizationEntry[] {
  const rate = annualRate / paymentsPerYear;
  const nper = years * paymentsPerYear;
  const pmt = PMT({ rate, nper, pv: principal });
  
  const schedule: AmortizationEntry[] = [];
  let balance = principal;
  
  for (let period = 1; period <= nper; period++) {
    const interest = balance * rate;
    const principalPayment = -pmt - interest;
    balance -= principalPayment;
    
    schedule.push({
      period,
      payment: -pmt,
      principal: principalPayment,
      interest,
      balance: Math.max(0, balance),
    });
  }
  
  return schedule;
}

/**
 * Compound Annual Growth Rate (CAGR)
 */
export function CAGR(beginningValue: number, endingValue: number, years: number): number {
  return Math.pow(endingValue / beginningValue, 1 / years) - 1;
}

/**
 * Payback Period
 * Calculate the time needed to recover an initial investment
 */
export function paybackPeriod(initialInvestment: number, cashFlows: number[]): number {
  let cumulative = -Math.abs(initialInvestment);
  
  for (let i = 0; i < cashFlows.length; i++) {
    cumulative += cashFlows[i];
    if (cumulative >= 0) {
      // Interpolate for fractional period
      const prevCumulative = cumulative - cashFlows[i];
      const fraction = -prevCumulative / cashFlows[i];
      return i + fraction;
    }
  }
  
  return Infinity; // Never recovers
}

/**
 * Profitability Index
 */
export function profitabilityIndex(initialInvestment: number, npv: number): number {
  return (npv + Math.abs(initialInvestment)) / Math.abs(initialInvestment);
}

/**
 * Modified Internal Rate of Return (MIRR)
 */
export function MIRR(
  cashFlows: number[],
  financeRate: number,
  reinvestRate: number
): number {
  const n = cashFlows.length - 1;
  
  // PV of negative cash flows (at finance rate)
  let pvNegative = 0;
  // FV of positive cash flows (at reinvest rate)
  let fvPositive = 0;
  
  for (let i = 0; i < cashFlows.length; i++) {
    if (cashFlows[i] < 0) {
      pvNegative += cashFlows[i] / Math.pow(1 + financeRate, i);
    } else {
      fvPositive += cashFlows[i] * Math.pow(1 + reinvestRate, n - i);
    }
  }
  
  if (pvNegative === 0) {
    throw new Error('MIRR requires at least one negative cash flow');
  }
  
  return Math.pow(fvPositive / -pvNegative, 1 / n) - 1;
}

