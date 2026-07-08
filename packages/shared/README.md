# @aegis/shared

Cross-cutting primitives used by every other package: a `Result<T, E>` type and typed
error base, a structured logger, a typed event bus, storage ports (`get/set/remove`,
namespaced, Zod-validated) with a `chrome.storage` adapter and an in-memory mock, and
core domain types (`ElementRef`, `TaskId`, background↔UI message contracts).

This package has no dependency on any other `@aegis/*` package.
