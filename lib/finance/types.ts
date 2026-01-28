/**
 * Finance function types and interfaces
 */

// Cash flow types for financial calculations
export interface CashFlow {
  amount: number;
  date?: Date; // For XIRR/XNPV
}

// Time value of money parameters
export interface TVMParams {
  rate: number;      // Interest rate per period
  nper: number;      // Number of periods
  pmt?: number;      // Payment per period
  pv?: number;       // Present value
  fv?: number;       // Future value
  type?: 0 | 1;      // 0 = end of period, 1 = beginning
}

// Loan amortization schedule entry
export interface AmortizationEntry {
  period: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

// SaaS metrics types
export interface CohortData {
  cohortMonth: string;  // YYYY-MM
  startingMRR: number;
  monthlyMRR: number[];
}

export interface SaaSMetrics {
  mrr: number;
  arr: number;
  netMRRGrowth: number;
  grossRetention: number;
  netRetention: number;
  ltv: number;
  cac: number;
  ltvCacRatio: number;
  paybackMonths: number;
}

// Revenue recognition schedule
export interface RevenueSchedule {
  contractValue: number;
  startDate: Date;
  endDate: Date;
  recognitionType: 'straight-line' | 'usage-based' | 'milestone';
  monthlyRecognition: { month: string; amount: number }[];
}

// Financial model cell types
export type FinanceCellType =
  | 'currency'
  | 'percentage'
  | 'number'
  | 'date'
  | 'text'
  | 'formula';

export interface FinanceCell {
  type: FinanceCellType;
  value: number | string | Date | null;
  formula?: string;
  format?: string;
  validation?: CellValidation;
}

export interface CellValidation {
  type: 'range' | 'list' | 'custom';
  min?: number;
  max?: number;
  allowedValues?: (string | number)[];
  customFormula?: string;
  errorMessage?: string;
}

// Three-statement model types
export interface IncomeStatement {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: {
    salesAndMarketing: number;
    researchAndDev: number;
    generalAndAdmin: number;
    depreciation: number;
    amortization: number;
  };
  operatingIncome: number;
  interestExpense: number;
  interestIncome: number;
  otherIncome: number;
  ebt: number; // Earnings before tax
  taxes: number;
  netIncome: number;
}

export interface BalanceSheet {
  assets: {
    cash: number;
    accountsReceivable: number;
    inventory: number;
    prepaidExpenses: number;
    totalCurrentAssets: number;
    ppe: number; // Property, Plant & Equipment
    accumulatedDepreciation: number;
    intangibles: number;
    goodwill: number;
    totalAssets: number;
  };
  liabilities: {
    accountsPayable: number;
    accruedExpenses: number;
    deferredRevenue: number;
    shortTermDebt: number;
    totalCurrentLiabilities: number;
    longTermDebt: number;
    totalLiabilities: number;
  };
  equity: {
    commonStock: number;
    retainedEarnings: number;
    totalEquity: number;
  };
}

export interface CashFlowStatement {
  operating: {
    netIncome: number;
    depreciation: number;
    amortization: number;
    stockBasedComp: number;
    changesInWorkingCapital: number;
    cashFromOperations: number;
  };
  investing: {
    capex: number;
    acquisitions: number;
    investmentPurchases: number;
    cashFromInvesting: number;
  };
  financing: {
    debtIssuance: number;
    debtRepayment: number;
    equityIssuance: number;
    dividends: number;
    shareRepurchases: number;
    cashFromFinancing: number;
  };
  netCashChange: number;
  beginningCash: number;
  endingCash: number;
}

