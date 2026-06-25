"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EtlModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const database_module_1 = require("../database/database.module");
const etl_controller_1 = require("./etl.controller");
const etl_service_1 = require("./etl.service");
const etl_constants_1 = require("./etl.constants");
let EtlModule = class EtlModule {
};
exports.EtlModule = EtlModule;
exports.EtlModule = EtlModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            bullmq_1.BullModule.registerQueue({ name: etl_constants_1.ETL_QUEUE }),
        ],
        controllers: [etl_controller_1.EtlController],
        providers: [etl_service_1.EtlService],
        exports: [etl_service_1.EtlService],
    })
], EtlModule);
//# sourceMappingURL=etl.module.js.map