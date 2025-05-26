import { beforeEach, vi } from 'vitest';
import { fastify } from '~root/test/fastify';
import { VehicleValuationRequest } from '../types/vehicle-valuation-request';
import axios from 'axios';
import { VehicleValuation } from '@app/models/vehicle-valuation';
import { valuationService } from '@app/services/valuation-service';

vi.mock('axios');
vi.mock('@app/services/valuation-service');
const mockedAxios = vi.mocked(axios);
const mockedValuationService = vi.mocked(valuationService);

describe('ValuationController (e2e)', () => {
  let mockRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock repository methods
    mockRepository = {
      insert: vi.fn().mockResolvedValue(undefined),
      findOneBy: vi.fn(),
    };
    
    // Mock fastify.orm.getRepository
    vi.spyOn(fastify.orm, 'getRepository').mockReturnValue(mockRepository);
    
    // Mock valuation service
    const mockValuation = new VehicleValuation();
    mockValuation.vrm = 'ABC123';
    mockValuation.lowestValue = 15000;
    mockValuation.highestValue = 18000;
    mockValuation.providerName = 'SuperCar Valuations';
    
    mockedValuationService.getValuation.mockResolvedValue(mockValuation);
  });

  describe('PUT /valuations/', () => {
    it('should return 404 if VRM is missing', async () => {
      const requestBody: VehicleValuationRequest = {
        mileage: 10000,
      };

      const res = await fastify.inject({
        url: '/valuations',
        method: 'PUT',
        body: requestBody,
      });

      expect(res.statusCode).toStrictEqual(404);
    });

    it('should return 400 if VRM is 8 characters or more', async () => {
      const requestBody: VehicleValuationRequest = {
        mileage: 10000,
      };

      const res = await fastify.inject({
        url: '/valuations/12345678',
        body: requestBody,
        method: 'PUT',
      });

      expect(res.statusCode).toStrictEqual(400);
    });

    it('should return 400 if mileage is missing', async () => {
      const requestBody: VehicleValuationRequest = {
        // @ts-expect-error intentionally malformed payload
        mileage: null,
      };

      const res = await fastify.inject({
        url: '/valuations/ABC123',
        body: requestBody,
        method: 'PUT',
      });

      expect(res.statusCode).toStrictEqual(400);
    });

    it('should return 400 if mileage is negative', async () => {
      const requestBody: VehicleValuationRequest = {
        mileage: -1,
      };

      const res = await fastify.inject({
        url: '/valuations/ABC123',
        body: requestBody,
        method: 'PUT',
      });

      expect(res.statusCode).toStrictEqual(400);
    });

    it('should return existing valuation if already exists', async () => {
      const existingValuation = {
        vrm: 'ABC123',
        lowestValue: 14000,
        highestValue: 17000,
        providerName: 'SuperCar Valuations'
      };
      mockRepository.findOneBy.mockResolvedValue(existingValuation);

      const requestBody: VehicleValuationRequest = {
        mileage: 10000,
      };

      const res = await fastify.inject({
        url: '/valuations/ABC123',
        body: requestBody,
        method: 'PUT',
      });

      expect(res.statusCode).toStrictEqual(200);
      expect(res.json()).toEqual(existingValuation);
      expect(mockedValuationService.getValuation).not.toHaveBeenCalled();
      expect(mockRepository.insert).not.toHaveBeenCalled();
    });

    it('should return 200 with valid request for new valuation', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);

      const requestBody: VehicleValuationRequest = {
        mileage: 10000,
      };

      const res = await fastify.inject({
        url: '/valuations/ABC123',
        body: requestBody,
        method: 'PUT',
      });

      expect(res.statusCode).toStrictEqual(200);
      expect(res.json()).toEqual({
        vrm: 'ABC123',
        lowestValue: 15000,
        highestValue: 18000,
        providerName: 'SuperCar Valuations'
      });
      expect(mockedValuationService.getValuation).toHaveBeenCalledWith('ABC123', 10000);
      expect(mockRepository.insert).toHaveBeenCalled();
    });

    it('should return 503 when both providers fail', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);
      mockedValuationService.getValuation.mockRejectedValue(new Error('SERVICE_UNAVAILABLE'));

      const requestBody: VehicleValuationRequest = {
        mileage: 10000,
      };

      const res = await fastify.inject({
        url: '/valuations/ABC123',
        body: requestBody,
        method: 'PUT',
      });

      expect(res.statusCode).toStrictEqual(503);
      expect(res.json()).toEqual({
        message: 'Valuation service temporarily unavailable',
        statusCode: 503
      });
    });
  });

  describe('GET /valuations/', () => {
    it('should return 404 if valuation not found', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);

      const res = await fastify.inject({
        url: '/valuations/ABC123',
        method: 'GET',
      });

      expect(res.statusCode).toStrictEqual(404);
      expect(res.json()).toEqual({
        message: 'Valuation for VRM ABC123 not found',
        statusCode: 404
      });
    });

    it('should return 400 if VRM is too long', async () => {
      const res = await fastify.inject({
        url: '/valuations/TOOLONGVRM',
        method: 'GET',
      });

      expect(res.statusCode).toStrictEqual(400);
      expect(res.json()).toEqual({
        message: 'vrm must be 7 characters or less',
        statusCode: 400
      });
    });

    it('should return 200 with existing valuation', async () => {
      const mockValuation = {
        vrm: 'ABC123',
        lowestValue: 15000,
        highestValue: 18000
      };
      mockRepository.findOneBy.mockResolvedValue(mockValuation);

      const res = await fastify.inject({
        url: '/valuations/ABC123',
        method: 'GET',
      });

      expect(res.statusCode).toStrictEqual(200);
      expect(res.json()).toEqual(mockValuation);
      expect(mockRepository.findOneBy).toHaveBeenCalledWith({ vrm: 'ABC123' });
    });
  });
});