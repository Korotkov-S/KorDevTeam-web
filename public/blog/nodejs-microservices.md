# Микросервисная архитектура на Node.js с NestJS

## Почему микросервисы?

Микросервисная архитектура позволяет разбить монолитное приложение на небольшие, независимые сервисы, которые легко масштабировать и поддерживать.

## Преимущества NestJS для микросервисов

NestJS предоставляет встроенную поддержку микросервисов из коробки:

1. **Транспорты**: TCP, Redis, NATS, RabbitMQ, Kafka
2. **Декораторы**: Простая работа с паттернами сообщений
3. **Dependency Injection**: Легкое управление зависимостями

## Создание микросервиса

### 1. Установка зависимостей

```bash
npm install @nestjs/microservices
```

### 2. Настройка main.ts

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

### 3. Создание контроллера

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

## Коммуникация между сервисами

### Синхронный вызов

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

### Асинхронные события

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

1. **API Gateway**: Используйте шлюз для маршрутизации запросов
2. **Service Discovery**: Consul или Eureka для обнаружения сервисов
3. **Circuit Breaker**: Защита от каскадных сбоев
4. **Distributed Tracing**: Jaeger или Zipkin для мониторинга
5. **Централизованное логирование**: ELK Stack

## Мониторинг и отладка

Используйте Prometheus для метрик:

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

## Заключение

Микросервисная архитектура с NestJS предоставляет мощные инструменты для построения масштабируемых систем. Начните с небольших сервисов и постепенно увеличивайте их количество по мере роста проекта.

---

**Теги**: Node.js, NestJS, Microservices, Backend
**Дата публикации**: 15 октября 2025
