# Description

The Motorway backend take home code test. Please read the description and the brief carefully before starting the test.

**There's no time limit so please take as long as you wish to complete the test, and to add/refactor as much as you think is needed to solve the brief. However, we recommend around 60 - 120 minutes as a general guide, if you run out of time, then don't worry.**

**For anything that you did not get time to implement _or_ that you would like to change/add but you didn't feel was part of the brief, please feel free to make a note of it at the bottom of this README.md file**

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development (local)
$ npm run dev

# production mode (deployed)
$ npm run start
```

## Test

```bash
# run all tests
$ npm run test

# test coverage
$ npm run test:coverage
```

## Current Solution

This API is a simple but important API for motorway that is responsible for retrieving valuations for cars from a 3rd party (SuperCar Valuations) by the VRM (Vehicle Registration Mark) and mileage.

- The API has two routes
	- A PUT (/valuations/{vrm}) request to create a valuation for a vehicle which accepts a small amount of input data and performs some simple validation logic.
	- A GET (/valuations/{vrm}) request to get an existing valuation. Returns 404 if no valuation for the vrm exists.

- The PUT operation handles calling a third-party API to perform the actual valuation, there is some rudimentary mapping logic between Motorway & 3rd party requests/responses.
- The PUT request is not truly idempotent so the 3rd party is called each time this operation is called and the code catches duplicate key exceptions when writing to the database.
- If the 3rd party is unreachable or returns a 5xx error, the service returns a 500 Internal Server Error.
- The outcome is stored in a database for future retrieval in the GET request.
- All the logic for the entire operation is within a single method in a single "service" class.
- A QA engineer has added some high-level tests.
- The tests for validation failures all pass.
- A simple happy path test is currently failing as the I/O calls for the database and 3rd party have not been isolated and the clients are trying to hit real resources with an invalid configuration.

## Task Brief

As this is such an important service to Motorway, a decision has been made to add a fallback 3rd party provider called Premium Car Valuations in case SuperCar Valuations is unavailable for a period of time. Before we add any more features, we need to fix the broken test.

Here are a full list of tasks that need to be completed:

**Tests**

- Modify the code/test so that the existing test suite passes and no I/O calls are made during the execution of the test suite.

- Add a test for the GET call.

- All new functionality should have test coverage in a new or updated existing test.

**Features**

- Introduce a basic failover mechanism to call the fallback 3rd party provider (Premium Car Valuations) in the event that the failure rate of the calls to SuperCar Valuations exceeds 50%. To keep the test simple, assume this service is running as a single instance. Feel free to discuss how you might solve it differently if the service was to execute in a multi-node cluster. Be mindful that this is a popular API, therefore the solution needs to be able to handle tracking the success rate of a large number of requests.

- As Premium Car Valuations is more expensive to use, there is a need to revert back to SuperCar Valuations after a configurable amount of time. At this point, the failure rate to indicate failover should be reset.

- If both providers are unreachable or return a 5xx error, then the service should now return a 503 Service Unavailable Error.

- To save costs by avoiding calling either 3rd party, improve the PUT operation so that the providers are not called if a valuation has already occurred. NOTE: This is to save costs, not for any consistency concerns between Motorway and the 3rd party. (Don't worry about concurrency, if two requests for the same route occur at the same time, either response can be saved).

- To help increase customer confidence regarding the valuation Motorway shows the user, there is a new requirement to show the name of the provider who provided the valuation to the user on the front end, e.g. "Valued by Trusted Company {X}", therefore the name of the provider that was used for the valuation needs to be persisted in the database and returned in the response.

- The service should be tolerant to older records where there is no detail of the provider (Backwards Compatible).

- Refactor the code as you see fit to ensure it is more readable, maintainable and extensible.

- To help with auditing service level agreements with the providers over an indefinite time period, there is a need to store the following details of the request:

    - Request date and time
    - Request duration
    - Request url
    - Response code
    - Error code/message if applicable and the
    - Name of the provider

    The details must be stored in a ProviderLogs table, which is correlated to a VRM, there could potentially be more than one log per VRM.


## 3rd Party APIs

For the purposes of this code test, simple mocks have been created use a service called [Mocky](https://designer.mocky.io/) with simple canned responses. Assume, that these would be real RESTful/SOAP services.

## 3rd Party OpenAPI Specs

Details of the existing 3rd party (SuperCar Valuations) and the new provider (Premium Car Valuations) can be found below.

To view the OpenAPI specifications for the 3rd Party APIs at the links below, first run the `npm run third-party-api:serve-docs` command.

### SuperCar Valuations

This is the current and preferred provider used for valuations, it is a fairly modern and cost-effective API.

The OpenAPI Specification can be found [here](http://localhost:3001/docs).

The URI for this test stub in Mocky is https://run.mocky.io/v3/9245229e-5c57-44e1-964b-36c7fb29168b.

### Premium Car Valuations

This is the proposed fallback provider to be used for valuations, it is an old service and costs significantly more for each call.

The OpenAPI Specification can be found [here](http://localhost:3002/docs).

The URI for this test stub in Mocky is https://run.mocky.io/v3/0dfda26a-3a5a-43e5-b68c-51f148eda473.


# Candidate Notes

Changes made in this project:
1. Added new tests and updated existing tests to return mock objects instead of calling actual api
2. created module premium-car, used a new mocky url and implemented xml parsing
3. created a generic load balancer class ValuationFailoverService which will take care of routing to the appropriate provider based on failure threshold, revert timeout, minimum request for threshold
4. Implemented ProviderLogs table to help with auditing 
5. Check if valuation already exists in DB to avoid unnecessary API calls
6. Added test to return 503 when both service fails

How would I do things differently in a multi node cluster 

Currently running this in multi node will have below issues
1. Provider records stored in each node's memory 
2. Each node makes independent failover decisions 
3. Multiple nodes could simultaneously trigger failover

So basically we need co-ordination between all nodes

I would suggest three solutions 
1. Use a centralized metrics aggregator 
    - Use a centralized metrics system like Prometheus collect and aggregate success/failure rates from all nodes.
    - Each node would push metrics (e.g uccess/failure counts) to the central system periodically.
    - The central system would calculate the overall success rate across the cluster
    - Easy to implement

2. Use a distributed database
    - Use a distributed database like Redis (cluster) to store success/failure counters.
    - Each node would increment counters in the shared database for every request.
    - This will scale well with the number of nodes
    - The database would maintain consistency across nodes.
    - Scales horizontally with the cluster.


 3. Event streaming
 - Use a streaming platform like Apache Kafka to track request outcomes
 - Each node would publish success/failure events to a kafka topics
 - A consumer service would process these events in real-time to calculate success rate
 - Kafka is fault-tolerant and highly scalable


 Issues with solution 1:
  - Single point of failure
  - Metrics aggegation typically happens at intervals so delay can result in outdated data

Iussues with solution 2:
   - Consistent atomic operations across a cluster comes with it's shortcoming like latency 
   - network communications between nodes can delay
   - if strong consistency is required it may reduce availability 
   - High frequency writes can lead to resource contention 
   - Managing amdn maintaining a dsitributed database is more complex

Issues with solution 3:
   - Consumer service is a single point of failure and we'll need to scale with multiple nodes to make it
   reliable
   - Multiple instances of the consumer service process events and calculate aggregated statistics
   - Aggregated data can be written to a distributed cache 
   - Added complexity with maintaining kafka cluster, cache cluster and a separate servuce with multi node cosnumer instances 


Final solution:
I would pick solution 3 Event streaming

Reasoning:
Since it's a popular API with a high volume of requests, a kafka cluster is most well suited to handle that.
Kafka is high-throughout and fault-tolerant so it'll take a substantial responsiblity from the start. Also it is capable of
real time processing. I will also keep in mind that we'll already be having kafka cluster (or some event streaming tool) in use so it'll be just about creating new topics and maitaning a new service. Have a distributed cache set up
to store aggregated statistics and we're good to go. This will be a very robust solution.

Other notes:
I would use a configuration management service like consul for dynamic configuration management instead of having the 
configs in code.