"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constants = void 0;
exports.Constants = {
    etl_output: {
        Enums: {},
    },
    public: {
        Enums: {
            app_permission_type: ["VIEW", "UPDATE"],
            app_role: ["APP_ADMIN", "CREATOR", "VIEWER"],
            billing_interval: ["month", "year"],
            client_member_permission_types: ["VIEW", "UPDATE"],
            client_role: ["admin", "editor", "viewer"],
            client_type: ["empresa", "individuo"],
            etl_run_status: ["started", "running", "completed", "failed"],
            subscription_status: [
                "trialing",
                "active",
                "past_due",
                "canceled",
                "incomplete",
                "expired",
            ],
        },
    },
};
//# sourceMappingURL=database.types.js.map