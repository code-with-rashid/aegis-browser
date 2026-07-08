import { toElementRef } from '@aegis/shared';
import { z } from 'zod';

/** Validates a raw ref string and brands it as an `ElementRef`. */
export const ElementRefSchema = z.string().min(1).transform(toElementRef);
