import { grpc, IgreService } from './protocol.js';

export function createClient(address = '127.0.0.1:50051') {
  return new IgreService(address, grpc.credentials.createInsecure());
}
export function unary(client, method, request) {
  return new Promise((resolve, reject) => client[method](request, { deadline: Date.now() + 10000 },
    (error, response) => error ? reject(error) : resolve(response)));
}
