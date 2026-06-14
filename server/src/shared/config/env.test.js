import { describe, it, expect, vi } from "vitest";
import {
  REQUIRED_ENV_VARS,
  BOOTSTRAP_SECRET_VARS,
  EnvValidationError,
  findMissingEnvVars,
  validateEnv,
  buildConfig,
  loadConfig,
  loadConfigOrExit,
} from "./env.js";

/** A minimal environment that satisfies all required variables. */
function completeEnv(overrides = {}) {
  return {
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    JWT_SECRET: "super-secret-jwt",
    MONGODB_URI: "mongodb://127.0.0.1:27017/planet_of_toys",
    ...overrides,
  };
}

describe("environment schema", () => {
  it("declares the three bootstrap secrets as environment-only and required", () => {
    expect(BOOTSTRAP_SECRET_VARS).toEqual([
      "ENCRYPTION_KEY",
      "JWT_SECRET",
      "MONGODB_URI",
    ]);
    for (const name of BOOTSTRAP_SECRET_VARS) {
      expect(REQUIRED_ENV_VARS).toContain(name);
    }
  });
});

describe("findMissingEnvVars", () => {
  it("returns an empty list when all required vars are present", () => {
    expect(findMissingEnvVars(completeEnv())).toEqual([]);
  });

  it("detects a missing required variable", () => {
    const env = completeEnv();
    delete env.JWT_SECRET;
    expect(findMissingEnvVars(env)).toEqual(["JWT_SECRET"]);
  });

  it("treats blank/whitespace-only values as missing", () => {
    expect(findMissingEnvVars(completeEnv({ ENCRYPTION_KEY: "   " }))).toEqual([
      "ENCRYPTION_KEY",
    ]);
    expect(findMissingEnvVars(completeEnv({ MONGODB_URI: "" }))).toEqual([
      "MONGODB_URI",
    ]);
  });

  it("reports every missing variable", () => {
    expect(findMissingEnvVars({})).toEqual([...REQUIRED_ENV_VARS]);
  });
});

describe("validateEnv", () => {
  it("passes when all required variables are present", () => {
    expect(() => validateEnv(completeEnv())).not.toThrow();
  });

  it("throws EnvValidationError listing the missing variables", () => {
    const env = completeEnv();
    delete env.MONGODB_URI;
    try {
      validateEnv(env);
      throw new Error("expected validateEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect(error.missing).toEqual(["MONGODB_URI"]);
    }
  });
});

describe("buildConfig", () => {
  it("sources bootstrap secrets only from the environment", () => {
    const config = buildConfig(completeEnv());
    expect(config.secrets).toEqual({
      encryptionKey: "0123456789abcdef0123456789abcdef",
      jwtSecret: "super-secret-jwt",
      mongoUri: "mongodb://127.0.0.1:27017/planet_of_toys",
    });
  });

  it("applies defaults for optional settings", () => {
    const config = buildConfig(completeEnv());
    expect(config.server.port).toBe(4000);
    expect(config.auth.sessionExpiration).toBe("2h");
    expect(config.cors.allowedOrigins).toEqual(["http://localhost:5173"]);
    expect(config.uploads.maxUploadSizeMb).toBe(10);
    expect(config.uploads.allowedMediaTypes).toContain("image/webp");
    expect(config.rateLimits.otp.max).toBe(3);
    expect(config.rateLimits.login.blockThreshold).toBe(5);
  });

  it("parses provided optional settings", () => {
    const config = buildConfig(
      completeEnv({
        PORT: "8080",
        SESSION_EXPIRATION: "12h",
        ALLOWED_ORIGINS: "https://a.com, https://b.com",
        MAX_UPLOAD_SIZE_MB: "25",
        ALLOWED_MEDIA_TYPES: "image/png,image/webp",
        RATE_LIMIT_OTP_MAX: "7",
      })
    );
    expect(config.server.port).toBe(8080);
    expect(config.auth.sessionExpiration).toBe("12h");
    expect(config.cors.allowedOrigins).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
    expect(config.uploads.maxUploadSizeMb).toBe(25);
    expect(config.uploads.allowedMediaTypes).toEqual([
      "image/png",
      "image/webp",
    ]);
    expect(config.rateLimits.otp.max).toBe(7);
  });

  it("exposes integration fallbacks from the environment", () => {
    const config = buildConfig(
      completeEnv({ RAZORPAY_KEY_ID: "rzp_test_123" })
    );
    expect(config.integrations.razorpay.keyId).toBe("rzp_test_123");
  });
});

describe("loadConfig", () => {
  it("returns a config object when the environment is valid", () => {
    const config = loadConfig(completeEnv());
    expect(config.secrets.jwtSecret).toBe("super-secret-jwt");
  });

  it("throws when a required variable is missing", () => {
    const env = completeEnv();
    delete env.ENCRYPTION_KEY;
    expect(() => loadConfig(env)).toThrow(EnvValidationError);
  });
});

describe("loadConfigOrExit", () => {
  it("returns config without exiting when the environment is valid", () => {
    const exit = vi.fn();
    const logger = { error: vi.fn() };
    const config = loadConfigOrExit({ env: completeEnv(), exit, logger });
    expect(exit).not.toHaveBeenCalled();
    expect(config.secrets.encryptionKey).toBeDefined();
  });

  it("fails fast by exiting with code 1 when a required variable is missing", () => {
    const exit = vi.fn();
    const logger = { error: vi.fn() };
    const env = completeEnv();
    delete env.JWT_SECRET;
    loadConfigOrExit({ env, exit, logger });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
