import { FastifyInstance } from 'fastify';
import { VehicleValuationRequest } from './types/vehicle-valuation-request';
import { VehicleValuation } from '@app/models/vehicle-valuation';
import { ProviderLogs } from '@app/models/provider-logs';
import { valuationService } from '@app/services/valuation-service';

export function valuationRoutes(fastify: FastifyInstance) {
  // Initialize the valuation service with the log repository after ORM is ready
  fastify.addHook('onReady', async () => {
    const logRepository = fastify.orm.getRepository(ProviderLogs);
    valuationService.setLogRepository(logRepository);
  });

  fastify.get<{
    Params: {
      vrm: string;
    };
  }>('/valuations/:vrm', async (request, reply) => {
    const valuationRepository = fastify.orm.getRepository(VehicleValuation);
    const { vrm } = request.params;

    if (vrm === null || vrm === '' || vrm.length > 7) {
      return reply
        .code(400)
        .send({ message: 'vrm must be 7 characters or less', statusCode: 400 });
    }

    const result = await valuationRepository.findOneBy({ vrm: vrm });

    if (result == null) {
      return reply
        .code(404)
        .send({
          message: `Valuation for VRM ${vrm} not found`,
          statusCode: 404,
        });
    }

    return result;
  });

  fastify.put<{
    Body: VehicleValuationRequest;
    Params: {
      vrm: string;
    };
  }>('/valuations/:vrm', async (request, reply) => {
    const valuationRepository = fastify.orm.getRepository(VehicleValuation);
    const { vrm } = request.params;
    const { mileage } = request.body;

    if (vrm.length > 7) {
      return reply
        .code(400)
        .send({ message: 'vrm must be 7 characters or less', statusCode: 400 });
    }

    if (mileage === null || mileage <= 0) {
      return reply
        .code(400)
        .send({
          message: 'mileage must be a positive number',
          statusCode: 400,
        });
    }

    // Check if valuation already exists to avoid unnecessary API calls
    const existingValuation = await valuationRepository.findOneBy({ vrm });
    if (existingValuation) {
      fastify.log.info('Returning existing valuation: ', existingValuation);
      return existingValuation;
    }

    try {
      const valuation = await valuationService.getValuation(vrm, mileage);

      // Save to DB.
      await valuationRepository.insert(valuation).catch((err) => {
        if (err.code !== 'SQLITE_CONSTRAINT') {
          throw err;
        }
      });

      fastify.log.info('Valuation created: ', valuation);
      return valuation;
    } catch (error) {
      if (error instanceof Error && error.message === 'SERVICE_UNAVAILABLE') {
        return reply
          .code(503)
          .send({
            message: 'Valuation service temporarily unavailable',
            statusCode: 503,
          });
      }
      
      // For other errors, maintain existing behavior
      return reply
        .code(500)
        .send({
          message: 'Internal server error',
          statusCode: 500,
        });
    }
  });
}
