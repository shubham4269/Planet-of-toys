import "@testing-library/jest-dom";

// jsdom does not implement IntersectionObserver (used by LandingPage reveal
// animations); provide a no-op stub so components relying on it can render.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

globalThis.IntersectionObserver ??= IntersectionObserverStub;
