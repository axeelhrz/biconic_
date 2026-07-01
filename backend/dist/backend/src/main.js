"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const dotenv_1 = require("dotenv");
const path_1 = require("path");
const fs_1 = require("fs");
function ensurePathAliasesRegistered() {
    try {
        require.resolve("@/lib/etl/limits");
        return;
    }
    catch {
    }
    let dir = __dirname;
    for (let i = 0; i < 6; i++) {
        if ((0, fs_1.existsSync)((0, path_1.resolve)(dir, "lib")) && (0, fs_1.existsSync)((0, path_1.resolve)(dir, "app"))) {
            try {
                require("tsconfig-paths").register({ baseUrl: dir, paths: { "@/*": ["*"] } });
            }
            catch {
            }
            return;
        }
        const parent = (0, path_1.resolve)(dir, "..");
        if (parent === dir)
            break;
        dir = parent;
    }
}
ensurePathAliasesRegistered();
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const app_module_1 = require("./app.module");
const envCandidates = [
    (0, path_1.resolve)(process.cwd(), ".env.local"),
    (0, path_1.resolve)(process.cwd(), "../.env.local"),
    (0, path_1.resolve)(process.cwd(), "../../.env.local"),
    (0, path_1.resolve)(process.cwd(), ".env"),
    (0, path_1.resolve)(process.cwd(), "../.env"),
];
for (const envPath of envCandidates) {
    (0, dotenv_1.config)({ path: envPath });
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix("v1");
    app.use((0, cookie_parser_1.default)());
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
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
//# sourceMappingURL=main.js.map