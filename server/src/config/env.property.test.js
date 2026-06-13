import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import {
  REQUIRED_ENV_VARS,
  EnvValidationError,
  findMissingEnvVars,
  validateEnv,
  loadConfig,
  loadConfigOrExit,
} from "./env.js";

// Feature: planet-of-toys-ecommerce, Property 42: Startup requires all mandatory environment variables
//
// For any configuration in which a required environment variable (encryption
// key, JWT secret, database connection string, and other required vars) is
// missing, application startup fails; when all required variables are present,
// startup proceeds.
//
// Validates: Requirements 29.5

const NUM_RUNS = 100;

/** Non-blank value generator for a "present" environment variable. */
const presentValue = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim() !== "");

/**
 * Generator producing a complete environment record: every required variable
 * is assigned a non-blank value.
 */
const completeEnvArb = fc
  .tuple(...REQUIRED_ENV_VARS.map(() => presentValue))
  .map((values) =>
    Object.fromEntries(REQUIRED_ENV_VARS.map((name, i) => [name, values[i]]))
  );

/**
 * Generator producing an environment that is guaranteed to be missing at least
 * one required variable. We start from a complete environment, then pick a
 * non-empty subset of required vars to "break" by either deleting them or
 * blanking them out (both count as missing per the schema).
 */
const incompleteEnvArb = fc
  .tuple(
    completeEnvArb,
    // A non-empty subset of indices into REQUIRED_ENV_VARS to break.
    fc
      .subarray(REQUIRED_ENV_VARS.map((_, i) => i))
      .filter((subset) => subset.length > 0),
    // For each required var, how to break it: delete or blank.
    fc.array(fc.constantFrom("delete", "blank", "whitespace"), {
      minLength: REQUIRED_ENV_VARS.length,
      maxLength: REQUIRED_ENV_VARS.length,
    })
  )
  .map(([env, brokenIndices, modes]) => {
    const next = { ...env };
    for (const idx of brokenIndices) {
      const name = REQUIRED_ENV_VARS[idx];
      const mode = modes[idx];
      if (mode === "delete") {
        delete next[name];
      } else if (mode === "blank") {
        next[name] = "";
      } else {
        next[name] = "   \t  ";
      }
    }
    return { env: next, broken: brokenIndices.map((i) => REQUIRED_ENV_VARS[i]) };
  });

describe("Property 42: Startup requires all mandatory environment variables", () => {
  it("validateEnv throws EnvValidationError whenever a required variable is missing", () => {
    fc.assert(
      fc.property(incompleteEnvArb, ({ env, broken }) => {
        // findMissingEnvVars must report a non-empty set including the broken vars.
        const missing = findMissingEnvVars(env);
        expect(missing.length).toBeGreaterThan(0);
        for (const name of broken) {
          expect(missing).toContain(name);
        }

        // Startup validation must fail fast by throwing.
        let thrown;
        try {
          validateEnv(env);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(EnvValidationError);

        // loadConfig surfaces the same failure.
        expect(() => loadConfig(env)).toThrow(EnvValidationError);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("loadConfigOrExit fails fast (process exit, no config returned) when a required variable is missing", () => {
    fc.assert(
      fc.property(incompleteEnvArb, ({ env }) => {
        const exit = vi.fn(() => undefined);
        const logger = { error: vi.fn() };

        const result = loadConfigOrExit({ env, exit, logger });

        // Exits with a non-zero code and never returns a usable config.
        expect(exit).toHaveBeenCalledWith(1);
        expect(logger.error).toHaveBeenCalled();
        expect(result).toBeUndefined();
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("startup proceeds when all required variables are present", () => {
    fc.assert(
      fc.property(completeEnvArb, (env) => {
        expect(findMissingEnvVars(env)).toEqual([]);
        expect(() => validateEnv(env)).not.toThrow();

        const exit = vi.fn(() => undefined);
        const logger = { error: vi.fn() };
        const config = loadConfigOrExit({ env, exit, logger });

        expect(exit).not.toHaveBeenCalled();
        expect(config).toBeDefined();
        expect(config.secrets).toBeDefined();
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
