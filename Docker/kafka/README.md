# Kafka Docker Setup for Evolution API

This directory contains the Docker Compose configuration for running Apache Kafka locally for development and testing with Evolution API.

## Services

### Zookeeper
- **Container**: `zookeeper`
- **Image**: `confluentinc/cp-zookeeper:7.5.0`
- **Port**: `2181`
- **Purpose**: Coordination service for Kafka cluster

### Kafka
- **Container**: `kafka`
- **Image**: `confluentinc/cp-kafka:7.5.0`
- **Ports**: 
  - `9092` - PLAINTEXT_HOST (localhost access)
  - `29092` - PLAINTEXT (internal container access)
  - `9094` - OUTSIDE (external Docker access)
- **Purpose**: Message broker for event streaming

## Quick Start

### 1. Start Kafka Services
```bash
cd Docker/kafka
docker-compose up -d
```

### 2. Verify Services
```bash
# Check if containers are running
docker-compose ps

# Check Kafka logs
docker-compose logs kafka

# Check Zookeeper logs
docker-compose logs zookeeper
```

### 3. Test Kafka Connection
```bash
# Create a test topic
docker exec kafka kafka-topics --create --topic test-topic --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1

# List topics
docker exec kafka kafka-topics --list --bootstrap-server localhost:9092

# Produce messages
docker exec -it kafka kafka-console-producer --topic test-topic --bootstrap-server localhost:9092

# Consume messages (in another terminal)
docker exec -it kafka kafka-console-consumer --topic test-topic --from-beginning --bootstrap-server localhost:9092
```

## Evolution API Integration

### Environment Variables
Configure these variables in your Evolution API `.env` file:

```bash
# Kafka Configuration
KAFKA_ENABLED=true
KAFKA_CLIENT_ID=evolution-api
KAFKA_BROKERS=localhost:9092
KAFKA_GLOBAL_ENABLED=true
KAFKA_CONSUMER_GROUP_ID=evolution-api-consumers
KAFKA_TOPIC_PREFIX=evolution
KAFKA_AUTO_CREATE_TOPICS=true

# Event Configuration
KAFKA_EVENTS_APPLICATION_STARTUP=true
KAFKA_EVENTS_INSTANCE_CREATE=true
KAFKA_EVENTS_MESSAGES_UPSERT=true
# ... other events as needed
```

### Connection Endpoints
- **From Evolution API**: `localhost:9092`
- **From other Docker containers**: `kafka:29092`
- **From external applications**: `host.docker.internal:9094`

## Data Persistence

Data is persisted in Docker volumes:
- `zookeeper_data`: Zookeeper data and logs
- `kafka_data`: Kafka topic data and logs

## Network

Services run on the `evolution-net` network, allowing integration with other Evolution API services.

## Stopping Services

```bash
# Stop services
docker-compose down

# Stop and remove volumes (WARNING: This will delete all data)
docker-compose down -v
```

## Troubleshooting

### Connection Issues
1. Ensure ports 2181, 9092, 29092, and 9094 are not in use
2. Check if Docker network `evolution-net` exists
3. Verify firewall settings allow connections to these ports

### Performance Tuning
The configuration includes production-ready settings:
- Log retention: 7 days (168 hours)
- Compression: gzip
- Auto-topic creation enabled
- Optimized segment and retention settings

### Logs
```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# View specific service logs
docker-compose logs kafka
docker-compose logs zookeeper
```

## Integration with Evolution API

Once Kafka is running, Evolution API will automatically:
1. Connect to Kafka on startup (if `KAFKA_ENABLED=true`)
2. Create topics based on `KAFKA_TOPIC_PREFIX`
3. Start producing events to configured topics
4. Handle consumer groups for reliable message processing

For more details on Kafka integration, see the main Evolution API documentation.
