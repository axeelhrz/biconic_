import "reflect-metadata";
import { config } from "dotenv";
import { resolve } from "path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

const envCandidates = [
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), "../.env.local"),
  resolve(process.cwd(), "../../.env.local"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
];
for (const envPath of envCandidates) {
  config({ path: envPath });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("v1");
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Upload-Token", "x-upload-token"],
    exposedHeaders: ["ETag"],
  });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`Biconic backend listening on :${port}`);
}

bootstrap();
