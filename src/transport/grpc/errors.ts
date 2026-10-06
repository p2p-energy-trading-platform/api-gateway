import { ConnectError } from "@connectrpc/connect";
import { fromGrpcError } from "../../errors/grpc-to-http.js";


// Short helper to translate connect errors to app errors
export function toAppError(error: unknown): unknown {
  if (error instanceof ConnectError) {
    return fromGrpcError(error.code, error.rawMessage);
  }
  return error;
}