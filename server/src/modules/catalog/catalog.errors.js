// server/src/modules/catalog/catalog.errors.js
import { AppError } from "../../shared/errors/index.js";

/**
 * Operational 400-class validation error for the catalog module. Extends
 * AppError so the central error handler surfaces its (vetted, client-safe)
 * message to the client — the archive-guard and validation messages are meant to
 * be shown to admins. Defaults to status 400.
 */
export class CatalogValidationError extends AppError {
  constructor(message, statusCode = 400) {
    super(message, statusCode, { clientMessage: message });
    this.name = "CatalogValidationError";
  }
}

export default CatalogValidationError;
