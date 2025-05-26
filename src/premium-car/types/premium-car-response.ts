import { PremiumCarValuation } from './premium-car-valuation';

export type PremiumCarResponse = {
  RegistrationDate: string;
  RegistrationYear: number;
  RegistrationMonth: number;
} & PremiumCarValuation;