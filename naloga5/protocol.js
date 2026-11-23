import grpc from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';

const definition = loadSync(fileURLToPath(new URL('./igre.proto', import.meta.url)), {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
});
export const IgreService = grpc.loadPackageDefinition(definition).play.IgreService;
export { grpc };
