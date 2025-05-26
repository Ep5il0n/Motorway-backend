import axios from 'axios';
import { parseString } from 'xml2js';
import { promisify } from 'util';

import { VehicleValuation } from '../models/vehicle-valuation';
import { PremiumCarResponse } from './types/premium-car-response';
import { providerConfig } from '../env';

const parseXml = promisify(parseString);

export async function fetchValuationFromPremiumCarValuation(
  vrm: string,
  mileage: number,
): Promise<VehicleValuation> {
  axios.defaults.baseURL = providerConfig.PREMIUM_CAR_API_URL;
  
  const response = await axios.get<string>(
    `valueCar?vrm=${vrm}`,
    {
      headers: {
        'Accept': 'application/xml'
      }
    }
  );

  // Parse XML response
  const parsedData = await parseXml(response.data) as any;
  const xmlData = parsedData.root as PremiumCarResponse;

  const valuation = new VehicleValuation();
  valuation.vrm = vrm;
  valuation.lowestValue = xmlData.ValuationPrivateSaleMinimum;
  valuation.highestValue = xmlData.ValuationPrivateSaleMaximum;
  valuation.providerName = 'Premium Car Valuations';

  return valuation;
}