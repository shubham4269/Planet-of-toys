// server/src/modules/catalog/catalog.errors.js
/** Operational 400-class validation error with a client-safe message. */
export class CatalogValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "CatalogValidationError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.clientMessage = message;
  }
}

export default CatalogValidationError;
