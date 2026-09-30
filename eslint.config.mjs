import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "storage/**", "playwright-report/**", "test-results/**"] },
];
export default config;
