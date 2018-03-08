
export enum ServiceType {
  Unknown,
  Advertise,
  Pull,
  Push,
}

export enum RequestStatus {
  Pending,
  Accepted,
  Rejected,
  AcceptedButRejected,
}

export enum ServiceErrorCode {
  InvalidMethod = 'InvalidMethod',
  InvalidServiceName = 'InvalidServiceName',
  InvalidContentType = 'InvalidContentType',
  UnknownError = 'UnknownError',
}

/**
 * unique source symbol
 */
export const SymbolSource = Symbol('source');
