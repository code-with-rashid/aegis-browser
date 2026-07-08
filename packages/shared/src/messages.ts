/**
 * The generic shape of every background↔UI message. Concrete message types (e.g.
 * "start run", "confirmation request") are defined by the features that introduce them
 * and narrow `Type`/`Payload` accordingly; this is the shared extension point.
 */
export interface AegisMessage<Type extends string = string, Payload = unknown> {
  readonly type: Type;
  readonly payload: Payload;
}
