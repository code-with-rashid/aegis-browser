import { connectToBackground } from '../../messaging/chrome-port';
import type { BackgroundToPanelMessage, PanelToBackgroundMessage } from '../../messaging/protocol';
import { createRunStore } from './run-store';

/**
 * The side panel's one long-lived connection to the background composition root,
 * opened once when this module first loads (the side panel's document lifetime).
 */
export const useRunStore =
  createRunStore(connectToBackground<PanelToBackgroundMessage, BackgroundToPanelMessage>());
