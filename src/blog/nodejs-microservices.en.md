# Microservices Architecture on Node.js with NestJS

## Why Microservices?

Microservices architecture allows breaking down a monolithic application into small, independent services that are easy to scale and maintain.

## Advantages of NestJS for Microservices

NestJS provides built-in microservices support out of the box:

1. **Transports**: TCP, Redis, NATS, RabbitMQ, Kafka
2. **Decorators**: Easy work with messaging patterns
3. **Dependency Injection**: Easy dependency management

## Creating a Microservice

### 1. Install dependencies

```bash
npm install @nestjs/microservices
```

### 2. Configure main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: {
        host: '127.0.0.1',
        port: 8877,
      },
    },
  );
  await app.listen();
}
bootstrap();
```

### 3. Create a controller

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class MathController {
  @MessagePattern({ cmd: 'sum' })
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }
}
```

## Communication Between Services

### Synchronous call

```typescript
@Injectable()
export class AppService {
  constructor(
    @Inject('MATH_SERVICE') private client: ClientProxy
  ) {}

  async getSum() {
    const pattern = { cmd: 'sum' };
    const payload = [1, 2, 3];
    return this.client.send<number>(pattern, payload);
  }
}
```

### Asynchronous events

```typescript
@Injectable()
export class NotificationService {
  constructor(
    @Inject('NOTIFICATION_SERVICE') private client: ClientProxy
  ) {}

  sendNotification(userId: string, message: string) {
    this.client.emit('user_notification', { userId, message });
  }
}
```

## Best Practices

1. **API Gateway**: Use a gateway for request routing
2. **Service Discovery**: Consul or Eureka for service discovery
3. **Circuit Breaker**: Protection against cascading failures
4. **Distributed Tracing**: Jaeger or Zipkin for monitoring
5. **Centralized Logging**: ELK Stack

## Monitoring and Debugging

Use Prometheus for metrics:

```typescript
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
})
export class AppModule {}
```

## Conclusion

Microservices architecture with NestJS provides powerful tools for building scalable systems. Start with small services and gradually increase their number as the project grows.

---

**Tags**: Node.js, NestJS, Microservices, Backend
**Publication Date**: October 15, 2025
