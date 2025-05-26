import { VehicleValuation } from '@app/models/vehicle-valuation';
import { ProviderLogs } from '@app/models/provider-logs';
import { fetchValuationFromSuperCarValuation } from '@app/super-car/super-car-valuation';
import { fetchValuationFromPremiumCarValuation } from '@app/premium-car/premium-car-valuation';
import { Repository } from 'typeorm';

export enum ValuationProvider {
  SUPER_CAR = 'SuperCar Valuations',
  PREMIUM_CAR = 'Premium Car Valuations'
}

interface ProviderStats {
  requests: number;
  failures: number;
  lastFailoverTime?: Date;
}

class ValuationFailoverService {
  private providerStats: Map<ValuationProvider, ProviderStats> = new Map();
  private readonly FAILURE_THRESHOLD = 0.5; // 50%
  private readonly REVERT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
  private readonly MIN_REQUESTS_FOR_THRESHOLD = 10; // Need at least 10 requests to calculate meaningful failure rate
  private logRepository?: Repository<ProviderLogs>;
  
  constructor(logRepository?: Repository<ProviderLogs>) {
    this.providerStats.set(ValuationProvider.SUPER_CAR, { requests: 0, failures: 0 });
    this.providerStats.set(ValuationProvider.PREMIUM_CAR, { requests: 0, failures: 0 });
    this.logRepository = logRepository;
  }

  setLogRepository(logRepository: Repository<ProviderLogs>): void {
    this.logRepository = logRepository;
  }

  private getFailureRate(provider: ValuationProvider): number {
    const stats = this.providerStats.get(provider)!;
    if (stats.requests < this.MIN_REQUESTS_FOR_THRESHOLD) {
      return 0; // Not enough data to determine failure rate
    }
    return stats.failures / stats.requests;
  }

  private shouldUseSecondary(): boolean {
    const superCarStats = this.providerStats.get(ValuationProvider.SUPER_CAR)!;
    
    // Check if we should revert back to primary after timeout
    if (superCarStats.lastFailoverTime) {
      const timeSinceFailover = Date.now() - superCarStats.lastFailoverTime.getTime();
      if (timeSinceFailover >= this.REVERT_TIMEOUT_MS) {
        // Reset stats and revert to primary
        this.resetProviderStats(ValuationProvider.SUPER_CAR);
        return false;
      }
    }

    const failureRate = this.getFailureRate(ValuationProvider.SUPER_CAR);
    return failureRate >= this.FAILURE_THRESHOLD;
  }

  private resetProviderStats(provider: ValuationProvider): void {
    this.providerStats.set(provider, { requests: 0, failures: 0 });
  }

  private recordSuccess(provider: ValuationProvider): void {
    const stats = this.providerStats.get(provider)!;
    stats.requests++;
  }

  private recordFailure(provider: ValuationProvider): void {
    const stats = this.providerStats.get(provider)!;
    stats.requests++;
    stats.failures++;
    
    if (provider === ValuationProvider.SUPER_CAR && !stats.lastFailoverTime) {
      const failureRate = this.getFailureRate(provider);
      if (failureRate >= this.FAILURE_THRESHOLD) {
        stats.lastFailoverTime = new Date();
      }
    }
  }

  async getValuation(vrm: string, mileage: number): Promise<VehicleValuation> {
    const useSecondary = this.shouldUseSecondary();
    const primaryProvider = useSecondary ? ValuationProvider.PREMIUM_CAR : ValuationProvider.SUPER_CAR;
    const fallbackProvider = useSecondary ? ValuationProvider.SUPER_CAR : ValuationProvider.PREMIUM_CAR;

    try {
      const valuation = await this.callProvider(primaryProvider, vrm, mileage);
      this.recordSuccess(primaryProvider);
      return valuation;
    } catch (error) {
      this.recordFailure(primaryProvider);
      
      try {
        const valuation = await this.callProvider(fallbackProvider, vrm, mileage);
        this.recordSuccess(fallbackProvider);
        return valuation;
      } catch (fallbackError) {
        this.recordFailure(fallbackProvider);
        throw new Error('SERVICE_UNAVAILABLE');
      }
    }
  }

  private async logProviderRequest(
    vrm: string,
    provider: ValuationProvider,
    requestUrl: string,
    startTime: Date,
    endTime: Date,
    responseCode: number,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    if (!this.logRepository) return;

    const log = new ProviderLogs();
    log.vrm = vrm;
    log.requestDateTime = startTime;
    log.requestDurationMs = endTime.getTime() - startTime.getTime();
    log.requestUrl = requestUrl;
    log.responseCode = responseCode;
    log.errorCode = errorCode;
    log.errorMessage = errorMessage;
    log.providerName = provider;

    try {
      await this.logRepository.save(log);
    } catch (error) {
      console.error('Failed to log provider request:', error);
    }
  }

  private getProviderUrl(provider: ValuationProvider, vrm: string, mileage: number): string {
    switch (provider) {
      case ValuationProvider.SUPER_CAR:
        return `https://run.mocky.io/v3/67abe639-2efa-4283-ad0e-61b696c6949b/valuations/${vrm}?mileage=${mileage}`;
      case ValuationProvider.PREMIUM_CAR:
        return `https://run.mocky.io/v3/67abe639-2efa-4283-ad0e-61b696c6949b/valueCar?vrm=${vrm}`;
      default:
        return 'unknown';
    }
  }

  private async callProvider(provider: ValuationProvider, vrm: string, mileage: number): Promise<VehicleValuation> {
    const startTime = new Date();
    const requestUrl = this.getProviderUrl(provider, vrm, mileage);
    
    try {
      let valuation: VehicleValuation;
      
      switch (provider) {
        case ValuationProvider.SUPER_CAR:
          valuation = await fetchValuationFromSuperCarValuation(vrm, mileage);
          break;
        case ValuationProvider.PREMIUM_CAR:
          valuation = await fetchValuationFromPremiumCarValuation(vrm, mileage);
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      const endTime = new Date();
      await this.logProviderRequest(vrm, provider, requestUrl, startTime, endTime, 200);
      
      return valuation;
    } catch (error) {
      const endTime = new Date();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Determine response code based on error type
      let responseCode = 500;
      let errorCode = 'INTERNAL_ERROR';
      
      if (errorMessage.includes('timeout')) {
        responseCode = 408;
        errorCode = 'TIMEOUT';
      } else if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND')) {
        responseCode = 503;
        errorCode = 'NETWORK_ERROR';
      }

      await this.logProviderRequest(vrm, provider, requestUrl, startTime, endTime, responseCode, errorCode, errorMessage);
      
      throw error;
    }
  }

  // Method for testing - allows inspection of internal state
  getProviderStats(): Map<ValuationProvider, ProviderStats> {
    return new Map(this.providerStats);
  }
}

export const valuationService = new ValuationFailoverService();