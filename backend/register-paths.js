const path = require("path");
const tsconfigPaths = require("tsconfig-paths");

tsconfigPaths.register({
  baseUrl: path.join(__dirname),
  paths: {
    "@/*": ["../*"],
  },
});
