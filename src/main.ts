import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { configureHttpApplication } from './configure-http-application.js';
import { getApiEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const environment = getApiEnvironment(config);

  configureHttpApplication(app, environment);
  await app.listen(environment.PORT, '0.0.0.0');

  Logger.log(`API listening on port ${environment.PORT}`, 'Bootstrap');
}

await bootstrap();
