import { createStackIntegration } from './stack.mjs';
import { localCompose } from './local-compose.mjs';
export function createDeploymentIntegration() { return {
  stack: createStackIntegration(),
  localCompose,
  "volumes": [],
  "runtime": {},
  "businessBindings": {},
  "initialFiles": []
}; }
