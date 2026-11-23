import { startGrpcServer } from './service.js';

const address = process.env.GRPC_ADDRESS || '127.0.0.1:50051';
const { server } = await startGrpcServer({ address });
console.log(`gRPC storitev: ${address}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.tryShutdown(() => process.exit(0)));
